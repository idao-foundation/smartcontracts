// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/access/manager/AccessManager.sol";

/**
 * @dev Manager is a central contract to store the permissions of a system.
 */
contract Manager is AccessManager {
    constructor(address initialAdmin_) AccessManager(initialAdmin_) {}
}
