// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SlotManager.sol";
import "./gelato/Types.sol";
import "./interfaces/IDataSource.sol";

contract BetContract is
    Initializable,
    AccessManagedUpgradeable,
    UUPSUpgradeable
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;
    using Address for address payable;

    address public constant NATIVE_ETH =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 constant AVERAGE_POINTS = 2;
    uint256 constant MIN_POINTS = 1;
    uint256 constant MAX_TARGET_PERCENT_RECEIVERS = 10;

    struct IndividualPoolInfo {
        bool active;
        string name;
        address oracleAddress;
        uint256 settlementPeriod;
        uint256[] betIds;
        uint256[] winnersOfPointsIds;
        uint256 maxPoints;
    }

    struct BetInfo {
        address bidder;
        uint256 poolId;
        uint256 bidPrice;
        uint256 resultPrice;
        uint256 bidStartTimestamp;
        uint256 bidEndTimestamp;
        uint256 bidSettleTimestamp;
        uint256 err;
        bool ordered;
    }

    error DataLengthsIsZero();
    error DataLengthsMismatch();
    error AmountIsZero();
    error InsufficientFunds();
    error ZeroAddress();
    error PoolDoesNotExist();
    error PoolIsInactive();
    error UpgradeDenied();
    error DurationNotAllowed();
    error BetDoesNotExist();
    error BetNotEnded();
    error PriceAlreadyFilled();

    IndividualPoolInfo[] private individualPools;
    
    //duration =>
    mapping(uint256 => IndividualPoolInfo[] individualPoolsDetails) private generalPools;

    BetInfo[] private bets;

    uint256 private nativeFee;

    SlotManager public slotManager;

    IAutomate public gelatoAutomate;

    address public gelatoDedicatedMsgSender;

    address payable public gelatoFeeCollector;

    bool private allowUpgrade;

    event PoolCreated(
        uint256 indexed poolId,
        bool active,
        string name,
        address oracleAddress,
        uint256 duration,
        uint256 settlementPeriod
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
        uint256 settlementPeriod
    );

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
        __UUPSUpgradeable_init();

        slotManager = slotManager_;
        nativeFee = nativeFee_;
        gelatoAutomate = IAutomate(automateAddress_);

        if (automateAddress_ != address(0)) {
            (gelatoDedicatedMsgSender, ) = IOpsProxyFactory(
                0xC815dB16D4be6ddf2685C201937905aBf338F5D7
            ).getProxyOf(address(this));

            IGelato gelato = IGelato(IAutomate(gelatoAutomate).gelato());
            gelatoFeeCollector = payable(gelato.feeCollector());
        }
    }

function upgradeToAndCall(
        address newImplementation,
        bytes memory data
    ) public payable override restricted {
        allowUpgrade = true;

        super.upgradeToAndCall(newImplementation, data);
    }

    function _authorizeUpgrade(address) internal override {
        if (!allowUpgrade) {
            // This path may not be reachable
            revert UpgradeDenied();
        }
        allowUpgrade = false;
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
        address oracleAddress = individualPools[bets[_betId].poolId]
            .oracleAddress;

        IDataSource priceFeed = IDataSource(oracleAddress);

        (uint256 price, ) = priceFeed.getLatestPrice();

        bets[_betId].resultPrice = uint256(price);
        bets[_betId].err = uint256(
            abs(int256(1 - (bets[_betId].bidPrice / bets[_betId].resultPrice)))
        );

        //Gelato
    }

    function settleBet(uint256 _betId) private {
        BetInfo memory bet = bets[_betId];

        if (bet.ordered) {
            return;
        }

        IndividualPoolInfo storage currentPool = individualPools[bet.poolId];
        uint256 winnersOfPointsCount = currentPool.winnersOfPointsIds.length;

        for (uint256 i = 0; i < winnersOfPointsCount; i++) {
            if (bet.err < bets[currentPool.winnersOfPointsIds[i]].err) {
                if (winnersOfPointsCount == 2000) {
                    currentPool.winnersOfPointsIds.pop();
                }
                //TODO: insert here
                //maybe use double linked list
                //currentPool.winnersOfPointsIds.splice(i, 0, _betId);
                break;
            }
        }
    }

    function distributePoints(uint256 _duration) external {
        uint256 totalBetsCount = 0;

        IndividualPoolInfo[] memory individualPoolsDetails = generalPools[_duration];

        for (uint256 i = 0; i < individualPoolsDetails.length; i++) {
            //todo filter for settled bets
            totalBetsCount += individualPoolsDetails[i].betIds.length;
        }
        for (uint256 i = 0; i < individualPoolsDetails.length; i++) {
            // TODO: not less than 1 point, check rounding
            individualPoolsDetails[i].maxPoints =
                (individualPoolsDetails[i].betIds.length *
                    individualPoolsDetails[i].maxPoints) /
                totalBetsCount;

            distributePointsByIndividualPool(individualPoolsDetails[i]);
        }
    }

    function distributePointsByIndividualPool(
        IndividualPoolInfo memory individualPool
    ) private {
        IndividualPoolInfo memory currentPool = individualPool;

        uint256 pointsDistributedCount = currentPool.maxPoints;

        uint256 countOfParticipants = currentPool.betIds.length;

        //TODO: if (countOfParticipants == 0) - ? what to do

        uint256 actualValueOfRewardedPredictions = countOfParticipants /
            MAX_TARGET_PERCENT_RECEIVERS;

        uint256 totalNumberOfPointsDistributed = 0;

        if (actualValueOfRewardedPredictions < 1) {
            totalNumberOfPointsDistributed = 1;
        } else {
            totalNumberOfPointsDistributed = actualValueOfRewardedPredictions;
        }

        uint256 newAveragePoints = pointsDistributedCount /
            totalNumberOfPointsDistributed;

        if (newAveragePoints < 1) {
            newAveragePoints = 1;
        }

        transferPoints(currentPool.winnersOfPointsIds, newAveragePoints);
    }

    function transferPoints(
        uint256[] memory winners,
        uint256 averagePoints
    ) private {
        uint256 winnersCount = winners.length;
        uint256 maxPoints = averagePoints * 2 - MIN_POINTS;
        uint256 diff = (1000 * (maxPoints - MIN_POINTS)) / (winnersCount - 1);

        for (uint256 i = winnersCount; i > 0; i--) {
            if (i == winnersCount) {
                uint256 points = MIN_POINTS;
            } else {
                uint256 points = MIN_POINTS +
                    (diff * (winnersCount - i)) /
                    1000;
            }

            // transfer
            // emit event
        }
    }

    function abs(int256 x) private pure returns (int256) {
        return x >= 0 ? x : -x;
    }

    /**
     * @notice Creates a new pool with specified parameters.
     * @param _active If the pool is active or not.
     * @param _name The name of the pool.
     * @param _oracleAddress The address of the oracle for the pool.
     * @param _duration An array containing the durations of the pool.
     * @param _settlementPeriod The settlement period of the pool.
     * @param _maxPoints The maximum number of points that can be bet on.
     */
    function createPool(
        bool _active,
        string memory _name,
        address _oracleAddress,
        uint256 _duration,
        uint256 _settlementPeriod,
        uint256 _maxPoints
    ) external restricted {
        if (_oracleAddress == address(0)) {
            revert ZeroAddress();
        }

        uint256 poolId = individualPools.length;

        IndividualPoolInfo memory temp = IndividualPoolInfo({
            active: _active,
            name: _name,
            oracleAddress: _oracleAddress,
            settlementPeriod: _settlementPeriod,
            betIds: new uint256[](0),
            winnersOfPointsIds: new uint256[](0),
            maxPoints: _maxPoints
        });

        //TODO: create new general pool if not exists for the duration, fix structure
        generalPools[_duration].push(temp);
        
        //we can delete this, we have already individualPools in generalPools
        individualPools.push(temp);

        emit PoolCreated(
            poolId,
            _active,
            _name,
            _oracleAddress,
            _duration,
            _settlementPeriod
        );
    }
}
