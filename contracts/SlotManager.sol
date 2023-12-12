// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @dev SlotManager manages address slots and slot limits.
 */
contract SlotManager is
    Initializable,
    AccessControlUpgradeable,
    AccessManagedUpgradeable,
    UUPSUpgradeable
{
    error SlotLimitReached();
    error NoSlotsToFree();

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public globalSlotLimit;

    mapping(address => uint256) public slotLimits;

    /**
     * @dev Initializes the contract.
     * @param upgrader_ The address of the upgrader role.
     * @param initialAuthority_ The authority that manages this contract.
     * @param globalSlotLimit_ The initial global slot limit.
     */
    function initialize(
        address upgrader_,
        address initialAuthority_,
        uint256 globalSlotLimit_
    ) external initializer {
        __AccessControl_init();
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();

        _grantRole(UPGRADER_ROLE, upgrader_);
        globalSlotLimit = globalSlotLimit_;
    }

    /**
     * @dev Redeems one slot for the specified address.
     * @param _account The address to redeem a slot for.
     */
    function redeemSlot(address _account) external restricted {
        if (slotLimits[_account] >= globalSlotLimit) {
            revert SlotLimitReached();
        }
        slotLimits[_account]++;
    }

    /**
     * @dev Frees up one slot for the specified address.
     * @param _account The address to free up a slot for.
     */
    function freeSlot(address _account) external restricted {
        if (slotLimits[_account] == 0) {
            revert NoSlotsToFree();
        }
        slotLimits[_account]--;
    }

    /**
     * @dev Allows the admin to edit the global slot limit.
     * @param _slotAmount The updated global slot limit.
     */
    function editGlobalSlotLimit(uint256 _slotAmount) external restricted {
        globalSlotLimit = _slotAmount;
    }

    /**
     * @dev Allows the admin to override the slot limit for a specific address.
     * @param _account The address to update the slot limit for.
     * @param _slotAmount The updated slot limit for the address.
     */
    function overrideSlotLimit(
        address _account,
        uint256 _slotAmount
    ) external restricted {
        slotLimits[_account] = _slotAmount;
    }

    /**
     * @dev Retrieves the available slots for a specific address.
     * @param _account The address to check for available slots.
     * @return The available number of slots at the specified address.
     */
    function availableSlots(address _account) external view returns (uint256) {
        // No available slots when the limit is reached.
        if (slotLimits[_account] >= globalSlotLimit) {
            return 0;
        }
        // Returns the available slots below the limit.
        return globalSlotLimit - slotLimits[_account];
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}
}
