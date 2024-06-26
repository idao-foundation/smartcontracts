// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../interfaces/IDataSource.sol";

contract MockSource is IDataSource {
    uint256 public _price;
    uint8 public _decimals;

    event PriceUpdated(uint256 price, uint8 decimals);

    function setPrice(uint256 price, uint8 decimals) external {
        _price = price;
        _decimals = decimals;

        emit PriceUpdated(price, decimals);
    }

    function getLatestPrice()
        external
        view
        override
        returns (uint256 value, uint8 decimals)
    {
        return (_price, _decimals);
    }

    function eventSource() external view override returns (address) {
        return address(this);
    }
}
