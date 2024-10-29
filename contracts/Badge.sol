// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./BetContract.sol";
import "./IdaoErrors.sol";

contract BadgeContract is
    Initializable,
    AccessManagedUpgradeable,
    IdaoErrors,
    UUPSUpgradeable
{
    using Address for address payable;

    struct Badge {
        uint256 requiredBets;
        uint256 feePrice;
    }

    BetContract public betContract;
    address public fundingWallet;
    bool private allowUpgrade;
    uint256 public badgeCount;

    // Mapping from badge ID to Badge struct
    mapping(uint256 => Badge) public badgeInfo;
    // Mapping to track badges claimed by users
    mapping(address => uint256[]) private claimedBadges;

    event BadgeCreated(
        uint256 indexed badgeId,
        uint256 requiredBets,
        uint256 feePrice
    );
    event BadgeUpdated(
        uint256 indexed badgeId,
        uint256 requiredBets,
        uint256 feePrice
    );
    event BadgeClaimed(
        address indexed account,
        uint256 indexed badgeId,
        uint256 accountBetCount
    );

    function initialize(
        address initialAuthority_,
        BetContract betContract_,
        address fundingWallet_
    ) external initializer {
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();

        fundingWallet = fundingWallet_;
        betContract = betContract_;
    }

    /**
     * @notice Fallback function to receive native coins.
     */
    receive() external payable {}

    /**
     * @notice Claim a badge for the user.
     * @param _badgeId The ID of the badge to claim.
     */
    function claim(uint256 _badgeId) external payable {
        if (_badgeId == 0 || _badgeId > badgeCount) {
            revert InvalidBadgeId();
        }
        if (getLastClaimedBadge(msg.sender) >= _badgeId) {
            revert BadgeAlreadyClaimed();
        }

        uint256 userBets = betContract.userBetCount(msg.sender);

        if (userBets < badgeInfo[_badgeId].requiredBets) {
            revert InsufficientBets();
        }

        uint256 feePrice = badgeInfo[_badgeId].feePrice;

        if (msg.value != feePrice) {
            revert IncorrectFeeAmount();
        }

        payable(fundingWallet).sendValue(msg.value);

        claimedBadges[msg.sender].push(_badgeId);

        emit BadgeClaimed(msg.sender, _badgeId, userBets);
    }

    /**
     * @notice Create a new badge.
     * @param _requiredBets The number of bets required to claim the badge.
     * @param _feePrice The fee price to claim the badge in native currency.
     */
    function createBadge(
        uint256 _requiredBets,
        uint256 _feePrice
    ) external restricted {
        badgeCount++;
        badgeInfo[badgeCount] = Badge(_requiredBets, _feePrice);
        emit BadgeCreated(badgeCount, _requiredBets, _feePrice);
    }

    /**
     * @notice Update an existing badge.
     * @param _badgeId The ID of the badge to update.
     * @param _requiredBets The new number of bets required to claim the badge.
     * @param _feePrice The new fee price to claim the badge in native currency.
     */
    function updateBadge(
        uint256 _badgeId,
        uint256 _requiredBets,
        uint256 _feePrice
    ) external restricted {
        if (_badgeId == 0 || _badgeId > badgeCount) {
            revert InvalidBadgeId();
        }
        badgeInfo[_badgeId] = Badge(_requiredBets, _feePrice);
        emit BadgeUpdated(_badgeId, _requiredBets, _feePrice);
    }

    /**
     * @notice Set a funding wallet to receive fees.
     * @param _fundingWallet The new funding wallet address.
     */
    function setFundingWallet(address _fundingWallet) external restricted {
        if (_fundingWallet == address(0)) {
            revert ZeroAddress();
        }
        fundingWallet = _fundingWallet;
    }

    /**
     * @notice Get all badge IDs claimed by a specific address.
     * @param _account The address of the user.
     * @return The array of badge IDs owned by the user.
     */
    function getClaimedBadges(
        address _account
    ) external view returns (uint256[] memory) {
        return claimedBadges[_account];
    }

    /**
     * @notice Get the highest badge ID the user is eligible to claim.
     * @param _account The address of the user.
     * @return badgeId The highest badge ID that the user can claim, or 0 if not eligible for any badge.
     */
    function getHigherBadge(
        address _account
    ) external view returns (uint256 badgeId) {
        uint256 userBets = betContract.userBetCount(_account);
        uint256 right = badgeCount;
        uint256 left = getLastClaimedBadge(_account) + 1;

        while (left <= right) {
            uint256 mid = (left + right) / 2;

            if (badgeInfo[mid].requiredBets <= userBets) {
                // Eligible for this badge or higher, search the upper half
                badgeId = mid;
                left = mid + 1;
            } else {
                // Not eligible, search the lower half
                right = mid - 1;
            }
        }

        return badgeId;
    }

    function upgradeToAndCall(
        address newImplementation,
        bytes memory data
    ) public payable override restricted {
        allowUpgrade = true;
        super.upgradeToAndCall(newImplementation, data);
    }

    /**
     * @notice Get the last badge claimed by the user.
     * @param _account The address of the user.
     * @return The ID of the last badge claimed by the user.
     */
    function getLastClaimedBadge(
        address _account
    ) public view returns (uint256) {
        uint256 totalCount = claimedBadges[_account].length;
        return totalCount > 0 ? claimedBadges[_account][totalCount - 1] : 0;
    }

    function _authorizeUpgrade(address) internal override {
        if (!allowUpgrade) revert UpgradeDenied();
        allowUpgrade = false;
    }
}
