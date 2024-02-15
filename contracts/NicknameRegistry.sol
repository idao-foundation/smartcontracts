// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IdaoErrors.sol";

contract NicknameRegistry is
    Initializable,
    AccessManagedUpgradeable,
    IdaoErrors,
    UUPSUpgradeable
{
    using Address for address payable;

    uint256 public nicknameFee;
    address public fundingWallet;
    bool private allowUpgrade;
    address public feeTokenAddress;

    mapping(bytes32 => address) private nicknameToAddress;
    mapping(address => string) private addressToNickname;

    event NicknameCreated(
        address indexed account,
        string nickname,
        address feeToken,
        uint256 feeAmount
    );

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     * @param fundingWallet_ The address of the funding wallet.
     * @param feeToken_ The token address to be used for the fee.
     * @param fee_ The fee amount for creating a nickname.
     */
    function initialize(
        address initialAuthority_,
        address fundingWallet_,
        address feeToken_,
        uint256 fee_
    ) external initializer {
        __AccessManaged_init(initialAuthority_);
        __UUPSUpgradeable_init();

        fundingWallet = fundingWallet_;
        nicknameFee = fee_;
        feeTokenAddress = feeToken_;
    }

    /**
     * @notice Sets the fee required for creating a nickname.
     * @param _fee The new fee amount.
     * @param _feeToken Token address to be paid (zero address for native ETH/MATIC/...).
     */
    function setNicknameFee(
        uint256 _fee,
        address _feeToken
    ) external restricted {
        nicknameFee = _fee;
        feeTokenAddress = _feeToken;
    }

    /**
     * @notice Sets a funding wallet to receive payments from accounts' purchases.
     * @param _fundingWallet The new funding wallet address.
     */
    function setFundingWallet(address _fundingWallet) external restricted {
        if (_fundingWallet == address(0)) {
            revert ZeroAddress();
        }
        fundingWallet = _fundingWallet;
    }

    /**
     * @notice Creates a nickname for the sender's address.
     * @param _nickname The desired nickname.
     */
    function createNickname(string memory _nickname) external payable {
        if (nicknameFee != 0) {
            transferFee();
        }

        bytes32 nicknameHash = keccak256(abi.encodePacked(_nickname));

        if (nicknameToAddress[nicknameHash] != address(0)) {
            revert NicknameIsAlreadyTaken();
        }
        if (bytes(addressToNickname[msg.sender]).length != 0) {
            revert AddressAlreadyHasNickname(addressToNickname[msg.sender]);
        }
        nicknameToAddress[nicknameHash] = msg.sender;
        addressToNickname[msg.sender] = _nickname;

        emit NicknameCreated(
            msg.sender,
            _nickname,
            feeTokenAddress,
            nicknameFee
        );
    }

    /**
     * @notice Retrieves the address associated with a nickname.
     * @param _nickname The nickname to look up.
     * @return The address associated with the nickname.
     */
    function getAddressByNickname(
        string memory _nickname
    ) external view returns (address) {
        return nicknameToAddress[keccak256(abi.encodePacked(_nickname))];
    }

    /**
     * @notice Retrieves the nickname associated with an address.
     * @param _account The address to look up.
     * @return The nickname associated with the address.
     */
    function getNicknameByAddress(
        address _account
    ) external view returns (string memory) {
        return addressToNickname[_account];
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
     * @dev Transfers the calculated fee from the user to the funding wallet.
     */
    function transferFee() private {
        uint256 fee = nicknameFee;
        if (feeTokenAddress == address(0)) {
            if (msg.value != fee) {
                revert IncorrectFeeAmount();
            }
            payable(fundingWallet).sendValue(msg.value);
        } else {
            IERC20(feeTokenAddress).transferFrom(
                msg.sender,
                fundingWallet,
                fee
            );
        }
    }
}
