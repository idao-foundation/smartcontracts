// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BetContract is
    Initializable,
    AccessManagedUpgradeable,
    UUPSUpgradeable
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;

    using Address for address payable;

    struct PoolInfo {
        bool active;
        string name;
        address oracleAddress;
    }

    error DataLengthsIsZero();
    error AmountIsZero();
    error ZeroAddress();
    error PoolDoesNotExist();
    error UpgradeDenied();

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 private nativeFee;

    bool private allowUpgrade;

    PoolInfo[] private pools;

    mapping(uint256 => EnumerableSet.UintSet) private poolDurations;

    event PoolCreated(
        uint256 indexed poolId,
        bool active,
        string name,
        address oracleAddress,
        uint256[] durations
    );

    event PoolStatusUpdated(uint256 indexed poolId, bool active);

    event PoolUpdated(
        uint256 indexed poolId,
        bool active,
        string name,
        address oracleAddress,
        uint256[] durations
    );

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     * @param nativeFee_ The native fee that takes when a user places a bet.
     */
    function initialize(
        address initialAuthority_,
        uint256 nativeFee_
    ) external initializer {
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();

        nativeFee = nativeFee_;
    }

    /**
     * @notice Fallback function to receive native coins.
     */
    receive() external payable {}

    //TODO: implement
    function bet(
        uint256 _poolId,
        uint256 _predictionPrice,
        uint256 _duration
    ) external payable {}

    //TODO: implement
    function fillPrice(uint256 _betId) external {}

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
        uint256[] memory _durations
    ) external restricted {
        uint256 durationsCount = _durations.length;

        if (durationsCount == 0) {
            revert DataLengthsIsZero();
        }
        if (_oracleAddress == address(0)) {
            revert ZeroAddress();
        }
        pools.push(
            PoolInfo({
                active: _active,
                name: _name,
                oracleAddress: _oracleAddress
            })
        );

        uint256 poolId = pools.length - 1;

        for (uint256 i = 0; i < durationsCount; i++) {
            poolDurations[poolId].add(_durations[i]);
        }

        emit PoolCreated(poolId, _active, _name, _oracleAddress, _durations);
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
        uint256[] memory _durations
    ) external restricted {
        if (_poolId >= pools.length) {
            revert PoolDoesNotExist();
        }
        uint256 durationsCount = _durations.length;

        if (durationsCount == 0) {
            revert DataLengthsIsZero();
        }
        if (_oracleAddress == address(0)) {
            revert ZeroAddress();
        }
        pools[_poolId].active = _active;
        pools[_poolId].name = _name;
        pools[_poolId].oracleAddress = _oracleAddress;

        for (uint256 i = 0; i < durationsCount; i++) {
            poolDurations[_poolId].add(_durations[i]);
        }

        emit PoolUpdated(_poolId, _active, _name, _oracleAddress, _durations);
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
            payable(_to).sendValue(address(this).balance);
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

    /**
     * @notice Retrieves the number of pools created.
     * @return The total count of pools created.
     */
    function poolLength() external view returns (uint256) {
        return pools.length;
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
     * @return active If the pool is active or not.
     * @return name The name of the pool.
     * @return oracleAddress The address of the oracle for the pool.
     * @return durations An array containing the durations of the pool.
     */
    function poolInfo(
        uint256 _poolId
    )
        external
        view
        returns (
            bool active,
            string memory name,
            address oracleAddress,
            uint256[] memory durations
        )
    {
        if (_poolId >= pools.length) {
            revert PoolDoesNotExist();
        }

        PoolInfo memory pool = pools[_poolId];

        return (
            pool.active,
            pool.name,
            pool.oracleAddress,
            poolDurations[_poolId].values()
        );
    }

    //TODO: implement
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
            uint256 bidEndTimestamp
        )
    {}

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
}
