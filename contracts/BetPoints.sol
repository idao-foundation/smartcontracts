// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./IdaoErrors.sol";

import "hardhat/console.sol";

contract BetPoints is
    Initializable,
    AccessManagedUpgradeable,
    IdaoErrors,
    UUPSUpgradeable
{
    uint256 pointsPerRating18;
    uint256 minPoints18;
    uint256 avgPoints18;
    uint256 rewardedUsersShare18;
    bool private allowUpgrade;

    struct UserResult {
        address user;
        uint96 accuracy;
    }

    struct Rating {
        uint256 totalPoints18;
        uint256 minPoints18;
        uint256 avgPoints18;
        uint256 rewardedUsersShare18;
        uint256 betCount;
        UserResult[] users;
    }

    mapping(bytes32 => Rating) public rating;

    function initialize(address manager) public initializer {
        __AccessManaged_init(manager);
        __UUPSUpgradeable_init();

        pointsPerRating18 = 20 * 1e18;
        minPoints18 = 1 * 1e18;
        avgPoints18 = 2 * 1e18;
        rewardedUsersShare18 = 1 * 1e17; // 10%
    }

    function setTotalPoints(
        bytes32 ratingId,
        uint256 _totalPoints18
    ) external restricted {
        rating[ratingId].totalPoints18 = _totalPoints18;
    }

    function addUserToRatingAndSort(
        bytes32 key,
        address user,
        int256 userPrediction18,
        int256 realPrice18
    ) external restricted {
        uint96 accuracy18 = uint96(
            abs(1e18 - (userPrediction18 * 1e18) / realPrice18)
        );

        uint256 totalPoints18 = rating[key].totalPoints18;
        if (totalPoints18 == 0) {
            uint256 _pointsPerRating18 = pointsPerRating18;
            rating[key].totalPoints18 = _pointsPerRating18;
            totalPoints18 = _pointsPerRating18;
        }

        rating[key].minPoints18 = minPoints18;
        rating[key].avgPoints18 = avgPoints18;
        rating[key].rewardedUsersShare18 = rewardedUsersShare18;
        rating[key].betCount++;

        uint256 maxLen = totalPoints18 / 1e18;

        require(maxLen != 0, "Rating is empty");

        // overwriting least accurate prediction
        if (rating[key].users.length == maxLen) {
            // if new user is more accurate than least accurate user
            if (rating[key].users[maxLen - 1].accuracy > accuracy18) {
                rating[key].users[maxLen - 1] = UserResult(user, accuracy18);
            } else {
                // if new user is less accurate than least accurate user
                return;
            }
        } else {
            rating[key].users.push(UserResult(user, accuracy18));
        }

        UserResult[] memory _sortedRating = sort(rating[key].users);

        for (uint256 i = 0; i < _sortedRating.length; i++) {
            rating[key].users[i] = _sortedRating[i];
        }
    }

    function getRating(
        bytes32 ratingId
    )
        external
        view
        returns (UserResult[] memory users, uint256[] memory points)
    {
        Rating memory _rating = rating[ratingId];
        users = _rating.users;

        console.log("totalPoints18", _rating.totalPoints18);
        if (_rating.totalPoints18 == 0) {
            revert NotInitialized();
        }

        uint256 _minPoints18 = _rating.minPoints18;
        console.log("minPoints18", _minPoints18);

        uint256 _avgPoints18 = _rating.avgPoints18;
        console.log("avgPoints18", avgPoints18);

        uint256 ratingLen = rating[ratingId].users.length;
        console.log("ratingLen", ratingLen);
        points = new uint256[](ratingLen);

        uint256 betCount = _rating.betCount;
        console.log("betCount", betCount);

        uint256 targetRewardedUsersAmount18 = (_rating.totalPoints18 * 1e18) /
            _avgPoints18;
        console.log("targetRewardedUsersAmount18", targetRewardedUsersAmount18);

        uint256 realRewardedUsersAmount18 = betCount *
            _rating.rewardedUsersShare18;
        console.log("realRewardedUsersAmount18", realRewardedUsersAmount18);

        if (realRewardedUsersAmount18 < 1e18) {
            console.log("reward only one most accurate user");
            points[0] = _minPoints18;
            return (users, points);
        }
        // распределяем по формуле

        // фактическое значение больше целевого?
        if (realRewardedUsersAmount18 > targetRewardedUsersAmount18) {
            // корректируем средний балл
            _avgPoints18 =
                (_avgPoints18 * 1e18) /
                ((realRewardedUsersAmount18 * 1e18) /
                    targetRewardedUsersAmount18);
            console.log("avgPoints18", _avgPoints18);

            if (_avgPoints18 > 1e18) {
                console.log("use new avgPoints18");

                // max: 3, min: 1, avg: 2, 10% цель награждения
                // 150 ставок пришло, 20 баллов, рейтинг 20 адресов.
                // цель ставок: 20 баллов / 2 avg = 10 адресов
                // фактически: 150 ставок * 10% = 15 адресов

                // фактическое значение больше целевого
                // новый avg 1.333...
                // новый max 1.666...
                // diff 0.047619047619047619

                // новый avg больше 1 - распределение по новому avg

                // ??? т.е. мы делим кол-во баллов на средний и получаем кол-во адресов, которым нужно распределить баллы ???
                // ??? в данном случае 15 адресов (20 / 1.333...), топ один получит 1.666... ???
                // это если что то что написано сейчас, то как я это понял
            } else {
                console.log("distribute 1 point to as many users as possible");
                uint256 onePointReceiversCount = _rating.totalPoints18 / 1e18;
                for (uint256 i = 0; i < onePointReceiversCount; i++) {
                    points[i] = _minPoints18;
                }

                return (users, points);

                // max: 3, min: 1, avg: 2, 10% цель награждения
                // 300 ставок пришло, 20 баллов, рейтинг 20 адресов.
                // цель ставок: 20 баллов / 2 avg = 10 адресов
                // фактически: 300 ставок * 10% = 30 адресов

                // фактическое значение больше целевого
                // новый avg 0.666...

                // новый avg меньше 1 - раздаём по 1 баллу всем, кто вошёл в рейтинг (топ 20 адресов)
            }
        }

        uint256 _maxPoints18 = (_avgPoints18 * 2) - _minPoints18;
        console.log("maxPoints18", _maxPoints18);

        uint256 pointsReceiversCount = realRewardedUsersAmount18 / 1e18;
        console.log("pointsReceiversCount", pointsReceiversCount);

        if (pointsReceiversCount == 1) {
            console.log("reward only one most accurate user");
            points[0] = _minPoints18;
            return (users, points);
        }

        uint256 diff = (_maxPoints18 - _minPoints18) /
            (pointsReceiversCount - 1);
        console.log("diff", diff);

        points[0] = _maxPoints18;
        for (uint256 i = 1; i < pointsReceiversCount; i++) {
            points[i] = points[i - 1] - diff;
        }
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

    function abs(int256 x) private pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }

    function sort(
        UserResult[] memory data
    ) private view returns (UserResult[] memory) {
        quickSort(data, int(0), int(data.length - 1));
        return data;
    }

    function quickSort(
        UserResult[] memory arr,
        int left,
        int right
    ) private view {
        int i = left;
        int j = right;
        if (i == j) return;
        uint pivot = arr[uint(left + (right - left) / 2)].accuracy;
        while (i <= j) {
            while (arr[uint(i)].accuracy < pivot) i++;
            while (pivot < arr[uint(j)].accuracy) j--;
            if (i <= j) {
                (arr[uint(i)], arr[uint(j)]) = (arr[uint(j)], arr[uint(i)]);
                i++;
                j--;
            }
        }
        if (left < j) quickSort(arr, left, j);
        if (i < right) quickSort(arr, i, right);
    }
}
