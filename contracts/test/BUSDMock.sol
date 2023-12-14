// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BUSDMock is ERC20 {
    constructor() ERC20("BUSDMock", "BUSD") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}