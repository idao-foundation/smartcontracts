// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract IdaoErrors {
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
    error OraclePriceIsZero();
    error NotInitialized();
    error IncorrectFeeAmount();
    error NicknameIsAlreadyTaken();
    error AddressAlreadyHasNickname(string nickname);
    error SlotLimitReached();
    error NoSlotsToFree();
    error InvalidSignature();
    error InvalidNonce();
    error InvalidBadgeId();
    error InsufficientBets();
    error BadgeAlreadyClaimed();
}
