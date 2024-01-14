// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/manager/AccessManaged.sol";

contract NicknameRegistry is AccessManaged {
    using Address for address payable;

    error ZeroAddress();
    error UnsupportedPaymentToken();
    error IncorrectFeeAmount();
    error NicknameIsAlreadyTaken();
    error AddressAlreadyHasNickname(string nickname);

    address public fundingWallet;
    uint256 public nicknameFee;

    mapping(bytes32 => address) private nicknameToAddress;
    mapping(address => string) private addressToNickname;
    mapping(address => uint256) public tokenPaymentAmounts;

    event NicknameCreated(address indexed account, string nickname);

    /**
     * @notice Initializes the contract.
     * @param initialAuthority_ The authority that manages this contract.
     * @param fundingWallet_ The address of the funding wallet.
     * @param fee_ The fee amount for creating a nickname.
     */
    constructor(
        address initialAuthority_,
        address fundingWallet_,
        uint256 fee_
    ) AccessManaged(initialAuthority_) {
        fundingWallet = fundingWallet_;
        nicknameFee = fee_;
    }

    /**
     * @notice Sets the fee required for creating a nickname.
     * @param _fee The new fee amount.
     */
    function setNicknameFee(uint256 _fee) external restricted {
        nicknameFee = _fee;
    }

    /**
     * @notice Sets the payment amount for a token.
     * @param _tokenContractAddress The address of the token contract.
     * @param _paymentAmount The payment amount for the token.
     */
    function setTokenPaymentAmount(
        address _tokenContractAddress,
        uint256 _paymentAmount
    ) external restricted {
        tokenPaymentAmounts[_tokenContractAddress] = _paymentAmount;
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
     * @param _paymentToken The payment amount for the token.
     */
    function createNickname(
        string memory _nickname,
        address _paymentToken
    ) external payable {
        if (nicknameFee != 0) {
            transferFee(_paymentToken, nicknameFee);
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

        emit NicknameCreated(msg.sender, _nickname);
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

    /**
     * @dev Transfers the calculated fee from the user to the funding wallet.
     * @param _paymentToken The address of the token used for the fee.
     * @param _nicknameFee The fee amount to be transferred.
     */
    function transferFee(address _paymentToken, uint256 _nicknameFee) private {
        uint256 paymentAmount = tokenPaymentAmounts[_paymentToken];

        if (paymentAmount == 0) {
            revert UnsupportedPaymentToken();
        }

        uint256 fee = paymentAmount * _nicknameFee;

        if (_paymentToken == address(0)) {
            if (msg.value != fee) {
                revert IncorrectFeeAmount();
            }
            payable(fundingWallet).sendValue(msg.value);
        } else {
            IERC20(_paymentToken).transferFrom(msg.sender, fundingWallet, fee);
        }
    }
}
