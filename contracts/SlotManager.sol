// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @notice SlotManager manages address slots and slot limits.
 */
contract SlotManager is
    Initializable,
    AccessManagedUpgradeable,
    UUPSUpgradeable
{
    error SlotLimitReached();
    error NoSlotsToFree();
    error UpgradeDenied();

    uint256 public globalSlotLimit;

    bool private allowUpgrade;

    mapping(address => uint256) public slotLimits;

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     * @param globalSlotLimit_ The initial global slot limit.
     */
    function initialize(
        address initialAuthority_,
        uint256 globalSlotLimit_
    ) external initializer {
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();

        globalSlotLimit = globalSlotLimit_;
    }

    /**
     * @notice Allows the admin to edit the global slot limit.
     * @param _slotAmount The updated global slot limit.
     */
    function editGlobalSlotLimit(uint256 _slotAmount) external restricted {
        globalSlotLimit = _slotAmount;
    }

    /**
     * @notice Allows the admin to override the slot limit for a specific address.
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
     * @notice Retrieves the available slots for a specific address.
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

    /**
     * @notice Redeems one slot for the specified address.
     * @param _account The address to redeem a slot for.
     */
    function redeemSlot(address _account) public restricted {
        if (slotLimits[_account] >= globalSlotLimit) {
            revert SlotLimitReached();
        }
        slotLimits[_account]++;
    }

    /**
     * @notice Frees up one slot for the specified address.
     * @param _account The address to free up a slot for.
     */
    function freeSlot(address _account) public restricted {
        if (slotLimits[_account] == 0) {
            revert NoSlotsToFree();
        }
        slotLimits[_account]--;
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
}
