// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IChainlink {
    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );
}
