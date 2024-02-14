// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/access/manager/IAccessManager.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./IdaoErrors.sol";

contract RegisterPoints is
    Initializable,
    AccessManagedUpgradeable,
    IdaoErrors,
    UUPSUpgradeable,
    EIP712Upgradeable
{
    using ECDSA for bytes32;

    bytes32 public constant CLAIM_POINTS_TYPEHASH =
        keccak256(
            "ClaimForecastPoints(uint256 amount,address receiver,uint256 nonce)"
        );

    string public constant NAME = "IDAO.Forecast.Contracts.RegisterPoints";

    string public constant VERSION = "1.0.0";

    uint64 public constant FORECAST_POINTS_ISSUER_ROLE =
        uint64(uint256(keccak256("FORECAST_POINTS_ISSUER_ROLE")));

    bool private allowUpgrade;

    // Mapping by used nonces for the specific sender address and the nonce.
    mapping(uint256 => bool) public isNonceUsed;
    mapping(address => uint256) private userPoints;

    event PointsAdded(address user, uint256 points);

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     */
    function initialize(address initialAuthority_) public initializer {
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();
        __EIP712_init(NAME, VERSION);
    }

    /**
     * @notice Adds the points for the users.
     * @param _user The user addresses.
     * @param _points Amount of points to claim.
     * @param _nonce The unique random nonce.
     * @param _v the recovery byte of the signature.
     * @param _r half of the ECDSA signature pair.
     * @param _s half of the ECDSA signature pair.
     */
    function claimPoints(
        address _user,
        uint256 _points,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        permit(_points, _user, _nonce, _v, _r, _s);
        userPoints[_user] += _points;

        emit PointsAdded(_user, _points);
    }

    /**
     * @notice Retrieves the balance of points for a user.
     * @param _user The user's address.
     */
    function pointsBalance(address _user) external view returns (uint256) {
        return userPoints[_user];
    }

    function batchIsNonceUsed(
        uint256[] calldata _nonces
    ) external view returns (bool[] memory) {
        bool[] memory results = new bool[](_nonces.length);

        for (uint256 i = 0; i < _nonces.length; i++) {
            results[i] = isNonceUsed[_nonces[i]];
        }

        return results;
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

    /**
     * @notice Permits the transaction with the signature.
     * @param _amount Amount of points issued.
     * @param _receiver The receiver address.
     * @param _nonce The unique nonce.
     * @param _v the recovery byte of the signature.
     * @param _r half of the ECDSA signature pair.
     * @param _s half of the ECDSA signature pair.
     */
    function permit(
        uint256 _amount,
        address _receiver,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) private {
        // Returns the hash of the type.
        bytes32 structHash = _hash(_amount, _receiver, _nonce);
        // Returns the hash of the fully encoded EIP712 message for this domain.
        bytes32 typedHash = _hashTypedDataV4(structHash);
        // Returns the address that signed a hashed message.
        address recovered = ECDSA.recover(typedHash, _v, _r, _s);

        (bool success, ) = IAccessManager(authority()).hasRole(
            FORECAST_POINTS_ISSUER_ROLE,
            recovered
        );

        if (!success) {
            revert InvalidSignature();
        }

        _useNonce(_nonce);
    }

    /**
     * @notice Marks the nonce as used.
     * @param _nonce The unique random nonce.
     */
    function _useNonce(uint256 _nonce) private {
        if (isNonceUsed[_nonce]) {
            revert InvalidNonce();
        }

        isNonceUsed[_nonce] = true;
    }

    /**
     * @notice Returns the hash of the type.
     * @param _amount Amount of points issued.
     * @param _receiver The receiver address.
     * @param _nonce The unique nonce.
     */
    function _hash(
        uint256 _amount,
        address _receiver,
        uint256 _nonce
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(CLAIM_POINTS_TYPEHASH, _amount, _receiver, _nonce)
            );
    }
}
