// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

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

    // keccak256("PermissionStructure(uint256 deadline,uint256 nonce)");
    bytes32 public constant PS_TYPEHASH =
        0x1a58b94d08a08929568cd68a319580254aae076eccdc7df2bd2d5506572734c2;

    uint64 public constant ADMIN_ROLE = 0;

    IAccessManager public manager;
    bool private allowUpgrade;

    // Mapping by used nonces for the specific sender address and the nonce.
    mapping(address => mapping(uint256 => bool)) public nonces;
    mapping(address => uint256) private userPoints;

    event PointsAdded(address user, uint256 points);

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     * @param name_ The user readable name of the signing domain.
     * @param version_ The current major version of the signing domain.
     */
    function initialize(
        address initialAuthority_,
        string memory name_,
        string memory version_
    ) public initializer {
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();
        __EIP712_init(name_, version_);
        manager = IAccessManager(initialAuthority_);
    }

    /**
     * @notice Adds the points for the users.
     * @param _users The users addresses.
     * @param _points The points for the users.
     * @param _deadline The signature valid before deadline (unix timestamp).
     * @param _nonce The unique random nonce.
     * @param _v the recovery byte of the signature.
     * @param _r half of the ECDSA signature pair.
     * @param _s half of the ECDSA signature pair.
     */
    function addPoints(
        address[] memory _users,
        uint256[] memory _points,
        uint256 _deadline,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        uint256 usersCount = _users.length;

        if (usersCount == 0) {
            revert DataLengthsIsZero();
        }
        if (usersCount != _points.length) {
            revert DataLengthsMismatch();
        }

        permit(_deadline, _nonce, _v, _r, _s);

        for (uint256 i = 0; i < usersCount; i++) {
            userPoints[_users[i]] += _points[i];

            emit PointsAdded(_users[i], _points[i]);
        }
    }

    /**
     * @notice Retrieves the balance of points for a user.
     * @param _user The user's address.
     */
    function pointsBalance(address _user) external view returns (uint256) {
        return userPoints[_user];
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
     * @param _deadline The signature valid before deadline (unix timestamp).
     * @param _nonce The unique random nonce.
     * @param _v the recovery byte of the signature.
     * @param _r half of the ECDSA signature pair.
     * @param _s half of the ECDSA signature pair.
     */
    function permit(
        uint256 _deadline,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) private {
        if (block.timestamp > _deadline) {
            revert ExpiredDeadline();
        }
        // Returns the hash of the type.
        bytes32 structHash = _hash(_deadline, _nonce);
        // Returns the hash of the fully encoded EIP712 message for this domain.
        bytes32 typedHash = _hashTypedDataV4(structHash);
        // Returns the address that signed a hashed message.
        address recovered = ECDSA.recover(typedHash, _v, _r, _s);

        (bool success, ) = manager.hasRole(ADMIN_ROLE, recovered);

        if (!success) {
            revert InvalidSignature();
        }

        _useNonce(msg.sender, _nonce);
    }

    /**
     * @notice Marks the nonce as used.
     * @param _from The sender address.
     * @param _nonce The unique random nonce.
     */
    function _useNonce(address _from, uint256 _nonce) private {
        if (nonces[_from][_nonce]) {
            revert InvalidNonce();
        }

        nonces[_from][_nonce] = true;
    }

    /**
     * @notice Returns the hash of the type.
     * @param _deadline The signature valid before deadline (unix timestamp).
     * @param _nonce The unique random nonce.
     */
    function _hash(
        uint256 _deadline,
        uint256 _nonce
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(PS_TYPEHASH, _deadline, _nonce));
    }
}
