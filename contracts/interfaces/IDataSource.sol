// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDataSource {
    function getLatestPrice()
        external
        view
        returns (uint256 value, uint8 decimals);

    function eventSource() external view returns (address);
}
