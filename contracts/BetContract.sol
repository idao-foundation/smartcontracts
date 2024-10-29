// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./SlotManager.sol";
import "./gelato/Types.sol";
import "./interfaces/IDataSource.sol";
import "./IdaoErrors.sol";

contract BetContract is
    Initializable,
    AccessManagedUpgradeable,
    PausableUpgradeable,
    IdaoErrors,
    UUPSUpgradeable
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using Address for address payable;

    address public constant NATIVE_ETH =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    struct Pool {
        bool active;
        string name;
        address oracleAddress;
    }

    struct PoolInfo {
        bool active;
        string name;
        address oracleAddress;
        uint256[] durations;
        uint256[] settlementPeriods;
        uint256 oracleCurrentPrice;
        uint8 oracleDecimals;
        address eventSource;
    }

    struct BetInfo {
        address bidder;
        uint256 poolId;
        uint256 bidPrice;
        uint256 resultPrice;
        uint256 bidStartTimestamp;
        uint256 bidEndTimestamp;
        uint256 bidSettleTimestamp;
    }

    mapping(uint256 => EnumerableSet.UintSet) private poolDurations;
    mapping(uint256 => EnumerableSet.UintSet) private poolSettlementPeriods;

    Pool[] private pools;

    BetInfo[] private bets;

    uint256 private nativeFee;

    SlotManager public slotManager;

    IAutomate public gelatoAutomate;

    address public gelatoDedicatedMsgSender;

    address payable public gelatoFeeCollector;

    bool private allowUpgrade;

    // TODO: Mapping placed here for upgrade safety, should be moved to a mappings section
    mapping(address => uint256) public userBetCount;
    mapping(address => bool) private userCounted;

    uint256 public userCount;

    // TODO: Remove this mapping and store value in BetInfo struct
    mapping(uint256 => uint256) private betIdToPriceAtBid;

    event PoolCreated(
        uint256 indexed poolId,
        bool active,
        string name,
        address oracleAddress,
        uint256[] durations,
        uint256[] settlementPeriods
    );

    event PoolStatusUpdated(uint256 indexed poolId, bool active);

    event PoolUpdated(
        uint256 indexed poolId,
        bool active,
        string name,
        address oracleAddress,
        uint256[] durations,
        uint256[] settlementPeriods
    );

    event BetPlaced(
        uint256 indexed betId,
        uint256 indexed poolId,
        address indexed bidder,
        uint256 bidPrice,
        uint256 predictionPrice,
        uint256 duration,
        uint256 bidEndTimestamp,
        uint256 settlementPeriod,
        uint256 priceAtBid
    );

    event PriceFilled(uint256 indexed betId, uint256 filledPrice);

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     * @param slotManager_ The address of the SlotManager contract.
     * @param automateAddress_ The address of the Gelato Automate contract.
     * @param nativeFee_ The native fee that takes when a user places a bet.
     */
    function initialize(
        address initialAuthority_,
        SlotManager slotManager_,
        address automateAddress_,
        uint256 nativeFee_
    ) external initializer {
        __AccessManaged_init(initialAuthority_);
        __Pausable_init();
        __UUPSUpgradeable_init();

        slotManager = slotManager_;
        nativeFee = nativeFee_;
        gelatoAutomate = IAutomate(automateAddress_);

        if (automateAddress_ != address(0)) {
            address proxyModuleAddress = IAutomate(automateAddress_)
                .taskModuleAddresses(Module.PROXY);

            address opsProxyFactoryAddress = IProxyModule(proxyModuleAddress)
                .opsProxyFactory();

            (gelatoDedicatedMsgSender, ) = IOpsProxyFactory(
                opsProxyFactoryAddress
            ).getProxyOf(address(this));

            IGelato gelato = IGelato(IAutomate(gelatoAutomate).gelato());
            gelatoFeeCollector = payable(gelato.feeCollector());
        }
    }

    /**
     * @notice Fallback function to receive native coins.
     */
    receive() external payable {}

    /**
     * @notice Creates a new bet with specified parameters.
     * @param _poolId The ID of the pool.
     * @param _predictionPrice The prediction price of the bet.
     * @param _duration The duration of the bet.
     */
    function bet(
        uint256 _poolId,
        uint256 _predictionPrice,
        uint256 _duration
    ) external payable whenNotPaused {
        if (_poolId >= pools.length) {
            revert PoolDoesNotExist();
        }
        if (!pools[_poolId].active) {
            revert PoolIsInactive();
        }
        if (msg.value != nativeFee) {
            revert InsufficientFunds();
        }
        if (!poolDurations[_poolId].contains(_duration)) {
            revert DurationNotAllowed();
        }

        if (!userCounted[msg.sender]) {
            userCount++;
            userCounted[msg.sender] = true;
        }

        slotManager.redeemSlot(msg.sender);

        uint256 betId = bets.length;
        uint256 settlementPeriod;

        for (uint256 i = 0; i < poolDurations[_poolId].length(); i++) {
            if (poolDurations[_poolId].at(i) == _duration) {
                settlementPeriod = poolSettlementPeriods[_poolId].at(i);
            }
        }

        uint256 bidEndTimestamp = block.timestamp + _duration;

        bets.push(
            BetInfo({
                bidder: msg.sender,
                poolId: _poolId,
                bidPrice: _predictionPrice,
                resultPrice: 0,
                bidStartTimestamp: block.timestamp,
                bidEndTimestamp: bidEndTimestamp,
                bidSettleTimestamp: settlementPeriod
            })
        );

        if (address(gelatoAutomate) != address(0)) {
            bytes memory data = abi.encodeWithSelector(
                this.fillPrice.selector,
                betId
            );

            _createGelatoTask(data, betId);
        }

        userBetCount[msg.sender]++;

        (uint256 priceAtBid, ) = IDataSource(pools[_poolId].oracleAddress)
            .getLatestPrice();

        betIdToPriceAtBid[betId] = priceAtBid;

        emit BetPlaced(
            betId,
            _poolId,
            msg.sender,
            msg.value,
            _predictionPrice,
            _duration,
            bidEndTimestamp,
            settlementPeriod,
            priceAtBid
        );
    }

    /**
     * @notice Fetches the price from Chainlink after the bit duration ends, updates the bid information.
     * @param _betId The ID of the bet.
     */
    function fillPrice(uint256 _betId) external {
        if (_betId >= bets.length) {
            revert BetDoesNotExist();
        }
        if (bets[_betId].bidEndTimestamp > block.timestamp) {
            revert BetNotEnded();
        }
        if (bets[_betId].resultPrice != 0) {
            revert PriceAlreadyFilled();
        }
        address oracleAddress = pools[bets[_betId].poolId].oracleAddress;
        (uint256 price, ) = IDataSource(oracleAddress).getLatestPrice();

        if (price == 0) {
            revert OraclePriceIsZero();
        }

        bets[_betId].resultPrice = price;

        slotManager.freeSlot(bets[_betId].bidder);

        emit PriceFilled(_betId, price);

        _repayGelatoExecution();
    }

    /**
     * @notice Creates a new pool with specified parameters.
     * @param _active If the pool is active or not.
     * @param _name The name of the pool.
     * @param _oracleAddress The address of the oracle for the pool.
     * @param _durations An array containing the durations of the pool.
     */
    function createPool(
        bool _active,
        string memory _name,
        address _oracleAddress,
        uint256[] memory _durations,
        uint256[] memory _settlementPeriods
    ) external restricted {
        uint256 durationsCount = _durations.length;

        if (durationsCount == 0) {
            revert DataLengthsIsZero();
        }
        if (durationsCount != _settlementPeriods.length) {
            revert DataLengthsMismatch();
        }
        if (_oracleAddress == address(0)) {
            revert ZeroAddress();
        }
        uint256 poolId = pools.length;

        pools.push(
            Pool({active: _active, name: _name, oracleAddress: _oracleAddress})
        );

        for (uint256 i = 0; i < durationsCount; i++) {
            poolDurations[poolId].add(_durations[i]);
            poolSettlementPeriods[poolId].add(_settlementPeriods[i]);
        }

        emit PoolCreated(
            poolId,
            _active,
            _name,
            _oracleAddress,
            _durations,
            _settlementPeriods
        );
    }

    /**
     * @notice Sets the status (active/inactive) of a pool.
     * @param _poolId The ID of the pool.
     * @param _active If the pool is active or not.
     */
    function setPoolStatus(uint256 _poolId, bool _active) external restricted {
        if (_poolId >= pools.length) {
            revert PoolDoesNotExist();
        }
        pools[_poolId].active = _active;

        emit PoolStatusUpdated(_poolId, _active);
    }

    /**
     * @notice Edits pool data for an existing pool.
     * @param _poolId The ID of the pool.
     * @param _active If the pool is active or not.
     * @param _name The name of the pool.
     * @param _oracleAddress The address of the oracle for the pool.
     * @param _durations An array containing the durations of the pool.
     */
    function editPool(
        uint256 _poolId,
        bool _active,
        string memory _name,
        address _oracleAddress,
        uint256[] memory _durations,
        uint256[] memory _settlementPeriods
    ) external restricted {
        if (_poolId >= pools.length) {
            revert PoolDoesNotExist();
        }
        uint256 durationsCount = _durations.length;

        if (durationsCount == 0) {
            revert DataLengthsIsZero();
        }
        if (durationsCount != _settlementPeriods.length) {
            revert DataLengthsMismatch();
        }
        if (_oracleAddress == address(0)) {
            revert ZeroAddress();
        }
        pools[_poolId].active = _active;
        pools[_poolId].name = _name;
        pools[_poolId].oracleAddress = _oracleAddress;

        for (uint256 i = 0; i < durationsCount; i++) {
            poolDurations[_poolId].add(_durations[i]);
            poolSettlementPeriods[_poolId].add(_settlementPeriods[i]);
        }

        emit PoolUpdated(
            _poolId,
            _active,
            _name,
            _oracleAddress,
            _durations,
            _settlementPeriods
        );
    }

    /**
     * @notice Rescues stuck tokens or native coins from the contract to the specified address.
     * @param _token The address of the token to be withdrawn.
     * @param _to The address to which the tokens will be transferred.
     * @param _amount The amount of stuck tokens.
     */
    function rescueERC20OrNative(
        address _token,
        address _to,
        uint256 _amount
    ) external restricted {
        if (_token == address(0)) {
            payable(_to).sendValue(_amount);
        } else {
            IERC20(_token).transfer(_to, _amount);
        }
    }

    /**
     * @notice Sets the amount of native value required for a bet.
     * @param _amount The amount of native fee.
     */
    function setNativeFeeAmount(uint256 _amount) external restricted {
        if (_amount == 0) {
            revert AmountIsZero();
        }
        nativeFee = _amount;
    }

    function setUserBetCount(
        uint256 _betCount,
        address _user
    ) external restricted {
        userBetCount[_user] = _betCount;
    }

    function countUser(address _user) external restricted {
        if (!userCounted[_user]) {
            userCount++;
            userCounted[_user] = true;
        }
    }

    /**
     * @notice Retrieves the number of pools created.
     * @return The total count of pools created.
     */
    function poolLength() external view returns (uint256) {
        return pools.length;
    }

    /**
     * @notice Retrieves the number of bets placed.
     * @return The total count of bets placed.
     */
    function betLength() external view returns (uint256) {
        return bets.length;
    }

    /**
     * @notice Retrieves the native fee required for placing a bet.
     * @return The amount of native fee.
     */
    function nativeFeeAmount() external view returns (uint256) {
        return nativeFee;
    }

    /**
     * @notice Retrieves information about a specific pool.
     * @param _poolId The ID of the pool.
     * @return pool information.
     */
    function poolInfo(uint256 _poolId) public view returns (PoolInfo memory) {
        if (_poolId >= pools.length) {
            revert PoolDoesNotExist();
        }

        Pool memory pool = pools[_poolId];

        (uint256 price, uint8 decimals) = IDataSource(pool.oracleAddress)
            .getLatestPrice();

        return
            PoolInfo(
                pool.active,
                pool.name,
                pool.oracleAddress,
                poolDurations[_poolId].values(),
                poolSettlementPeriods[_poolId].values(),
                price,
                decimals,
                IDataSource(pool.oracleAddress).eventSource()
            );
    }

    /**
     * @notice Retrieves information about all pools.
     * @return pools information.
     */
    function getAllPools() external view returns (PoolInfo[] memory) {
        uint256 length = pools.length;
        PoolInfo[] memory poolInfos = new PoolInfo[](length);

        for (uint256 i = 0; i < pools.length; i++) {
            poolInfos[i] = poolInfo(i);
        }

        return poolInfos;
    }

    /**
     * @notice Retrieves information about a specific bet.
     * @param _betId The ID of the bet.
     * @return bidder The address of the bidder.
     * @return poolId The ID of the pool.
     * @return bidPrice The bid price of the bet.
     * @return resultPrice The result price of the bet.
     * @return bidStartTimestamp The timestamp when the bet started.
     * @return bidEndTimestamp The timestamp when the bet ended.
     * @return bidSettleTimestamp The timestamp when the bet will be settled.
     */
    function betInfo(
        uint256 _betId
    )
        external
        view
        returns (
            address bidder,
            uint256 poolId,
            uint256 bidPrice,
            uint256 resultPrice,
            uint256 bidStartTimestamp,
            uint256 bidEndTimestamp,
            uint256 bidSettleTimestamp,
            uint256 priceAtBid
        )
    {
        if (_betId >= bets.length) {
            revert BetDoesNotExist();
        }

        BetInfo memory userBet = bets[_betId];

        return (
            userBet.bidder,
            userBet.poolId,
            userBet.bidPrice,
            userBet.resultPrice,
            userBet.bidStartTimestamp,
            userBet.bidEndTimestamp,
            userBet.bidSettleTimestamp,
            betIdToPriceAtBid[_betId]
        );
    }

    function upgradeToAndCall(
        address newImplementation,
        bytes memory data
    ) public payable override restricted {
        allowUpgrade = true;

        super.upgradeToAndCall(newImplementation, data);
    }

    function setGelato(address automateAddress_) external restricted {
        gelatoAutomate = IAutomate(automateAddress_);

        if (automateAddress_ != address(0)) {
            address proxyModuleAddress = IAutomate(automateAddress_)
                .taskModuleAddresses(Module.PROXY);

            address opsProxyFactoryAddress = IProxyModule(proxyModuleAddress)
                .opsProxyFactory();

            (gelatoDedicatedMsgSender, ) = IOpsProxyFactory(
                opsProxyFactoryAddress
            ).getProxyOf(address(this));

            IGelato gelato = IGelato(IAutomate(gelatoAutomate).gelato());
            gelatoFeeCollector = payable(gelato.feeCollector());
        }
    }

    function pause() external restricted {
        _pause();
    }

    function unpause() external restricted {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override {
        if (!allowUpgrade) {
            // This path may not be reachable
            revert UpgradeDenied();
        }
        allowUpgrade = false;
    }

    function _createGelatoTask(
        bytes memory data,
        uint256 id
    ) private returns (bytes32) {
        ModuleData memory moduleData = ModuleData({
            modules: new Module[](2),
            args: new bytes[](2)
        });

        moduleData.modules[0] = Module.PROXY;
        moduleData.args[0] = abi.encode(id);

        moduleData.modules[1] = Module.SINGLE_EXEC;
        moduleData.args[1] = bytes("");

        return
            gelatoAutomate.createTask(
                address(this),
                data,
                moduleData,
                NATIVE_ETH
            );
    }

    function _repayGelatoExecution() private {
        if (_isDedicatedMsgSenderOrAutomate()) {
            (uint256 fee, ) = gelatoAutomate.getFeeDetails();
            gelatoFeeCollector.sendValue(fee);
        }
    }

    function _isDedicatedMsgSenderOrAutomate() private view returns (bool) {
        return
            msg.sender == address(gelatoAutomate) ||
            msg.sender == gelatoDedicatedMsgSender;
    }
}
