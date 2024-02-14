// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../interfaces/IChainlinkDataSource.sol";
import "../interfaces/IDataSource.sol";

contract ChainlinkSource is IDataSource {
    IChainlinkDataSource public oracle;

    constructor(address oracleAddress) {
        oracle = IChainlinkDataSource(oracleAddress);
    }

    function getLatestPrice()
        external
        view
        override
        returns (uint256 value, uint8 decimals)
    {
        (, int256 answer, , , ) = oracle.latestRoundData();
        return (uint256(answer), oracle.decimals());
    }

    function eventSource() external view override returns (address) {
        return oracle.aggregator();
    }
}
