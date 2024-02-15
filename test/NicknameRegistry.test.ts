import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { ZeroAddress } from "ethers";
import {
    AccessManager,
    AccessManager__factory,
    NicknameRegistry,
    NicknameRegistry__factory,
    BUSDMock,
    BUSDMock__factory
} from "../typechain-types";
import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe('NicknameRegistry', () => {
    let manager: AccessManager;
    let nicknameRegistry: NicknameRegistry;
    let busdMock: BUSDMock;
    let admin: HardhatEthersSigner;
    let fundingWallet: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    let addr2: HardhatEthersSigner;

    const nicknameFee = 1;
    const ADMIN_ROLE = 0n;

    before(async () => {
        await reset();
    });

    beforeEach(async () => {
        [admin, fundingWallet, addr1, addr2] = await ethers.getSigners();

        const BUSDMock = (await ethers.getContractFactory('BUSDMock')) as BUSDMock__factory;
        busdMock = await BUSDMock.deploy();

        const Manager = (await ethers.getContractFactory('AccessManager')) as AccessManager__factory;
        manager = await Manager.deploy(admin.address);

        const NicknameRegistry = (await ethers.getContractFactory('NicknameRegistry')) as NicknameRegistry__factory;
        nicknameRegistry = await upgrades.deployProxy(NicknameRegistry, [
            manager.target, fundingWallet.address, busdMock.target, nicknameFee
        ]) as unknown as NicknameRegistry;
    
        await nicknameRegistry.waitForDeployment();
    });

    describe('Initialize', async () => {
        it('should initialize the contract correctly', async () => {
            /* ASSERT */
            const [isAdmin,] = await manager.hasRole(ADMIN_ROLE, admin.address);
            expect(isAdmin).to.equal(true);

            const nativeFee = await nicknameRegistry.nicknameFee();
            expect(nativeFee).to.equal(nicknameFee);

            const fundingWalletAddress = await nicknameRegistry.fundingWallet();
            expect(fundingWalletAddress).to.equal(fundingWallet.address);

            const feeTokenAddress = await nicknameRegistry.feeTokenAddress();
            expect(feeTokenAddress).to.equal(busdMock.target);
        });
    });

    describe('setNicknameFee', async () => {
        it('should set nickname fee and token address successfully', async () => {
            /* SETUP */
            const newFee = 100;

            /* EXECUTE */
            await nicknameRegistry.connect(admin).setNicknameFee(newFee, ZeroAddress);

            /* ASSERT */
            const fee = await nicknameRegistry.nicknameFee();
            expect(fee).to.equal(newFee);

            const feeTokenAddress = await nicknameRegistry.feeTokenAddress();
            expect(feeTokenAddress).to.equal(ZeroAddress);
        });

        it('rejects if not admin role', async () => {
            /* SETUP */
            const newFee = 100;

            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr1).setNicknameFee(newFee, ZeroAddress);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('setFundingWallet', async () => {
        it('sets funding wallet successfully', async () => {
            /* SETUP */
            const fundingWalletBefore = await nicknameRegistry.fundingWallet();

            /* EXECUTE */
            await nicknameRegistry.connect(admin).setFundingWallet(addr1.address);

            /* ASSERT */
            const fundingWalletAfter = await nicknameRegistry.fundingWallet();

            expect(fundingWalletAfter).to.not.equal(fundingWalletBefore);
            expect(fundingWalletAfter).to.equal(addr1.address);
        });

        it('rejects setting while zero address', async () => {
            /* EXECUTE */
            const promise = nicknameRegistry.connect(admin).setFundingWallet(ZeroAddress);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'ZeroAddress'
            );
        });

        it('rejects if not admin role', async () => {
            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr1).setFundingWallet(addr1.address);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('createNickname', async () => {
        it('should create a nickname with native currency', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';
            const tokenAddress = ZeroAddress;
            const paymentAmount = ethers.parseUnits('1', 18);

            const addr1BalanceBefore = await ethers.provider.getBalance(account);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFee = await nicknameRegistry.nicknameFee();
            const nicknameFeeAmount = nicknameFee;

            /* EXECUTE */
            const tx = await nicknameRegistry.connect(addr1).createNickname(nickname, { value: nicknameFeeAmount });

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);
            const addr1BalanceAfter = await ethers.provider.getBalance(account);

            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore - nicknameFeeAmount - fee);

            const addr1Nickname = await nicknameRegistry.getNicknameByAddress(account);
            const nicknameAddr1 = await nicknameRegistry.getAddressByNickname(nickname);

            expect(nickname).to.equal(addr1Nickname);
            expect(account).to.equal(nicknameAddr1);

            await expect(tx).to.emit(nicknameRegistry, 'NicknameCreated')
                .withArgs(account, nickname, tokenAddress, paymentAmount);
        });

        it('should create a nickname with ERC20 token', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';

            const tokenAddress = busdMock.target;
            const paymentAmount = ethers.parseUnits('1', 18);

            await busdMock.connect(addr1).mint(account, paymentAmount);
            await busdMock.connect(addr1).approve(nicknameRegistry.target, paymentAmount);

            const addr1BalanceBefore = await busdMock.balanceOf(account);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFeeAmount = await nicknameRegistry.nicknameFee();

            /* EXECUTE */
            const tx = await nicknameRegistry.connect(addr1).createNickname(nickname);

            /* ASSERT */
            const addr1BalanceAfter = await busdMock.balanceOf(account);

            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore - nicknameFeeAmount);

            const addr1Nickname = await nicknameRegistry.getNicknameByAddress(account);
            const nicknameAddr1 = await nicknameRegistry.getAddressByNickname(nickname);

            expect(nickname).to.equal(addr1Nickname);
            expect(account).to.equal(nicknameAddr1);

            await expect(tx).to.emit(nicknameRegistry, 'NicknameCreated')
                .withArgs(account, nickname, tokenAddress, paymentAmount);
        });

        it('should create a nickname free of charge', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';

            const addr1BalanceBefore = await ethers.provider.getBalance(account);
            const tokenAddress = ZeroAddress;
            const paymentAmount = 0;

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFeeAmount = await nicknameRegistry.nicknameFee();

            /* EXECUTE */
            const tx = await nicknameRegistry.connect(addr1).createNickname(nickname, { value: nicknameFeeAmount });

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);
            const addr1BalanceAfter = await ethers.provider.getBalance(account);

            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore - fee);

            const addr1Nickname = await nicknameRegistry.getNicknameByAddress(account);
            const nicknameAddr1 = await nicknameRegistry.getAddressByNickname(nickname);

            expect(nickname).to.equal(addr1Nickname);
            expect(account).to.equal(nicknameAddr1);

            await expect(tx).to.emit(nicknameRegistry, 'NicknameCreated')
                .withArgs(account, nickname, ZeroAddress, paymentAmount);
        });

        it('should revert if incorrect fee amount with native currency', async () => {
            /* SETUP */
            const nickname = 'testNick';

            const tokenAddress = ZeroAddress;
            const paymentAmount = ethers.parseUnits('1', 18);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFee = await nicknameRegistry.nicknameFee();
            const nicknameFeeAmount = nicknameFee - 1n;

            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr1).createNickname(nickname, { value: nicknameFeeAmount });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'IncorrectFeeAmount'
            );
        });

        it('should revert if incorrect fee amount with ERC20 token', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';

            const tokenAddress = busdMock.target;
            const paymentAmount = ethers.parseUnits('1', 18);

            await busdMock.connect(addr1).mint(account, paymentAmount - 1n);
            await busdMock.connect(addr1).approve(nicknameRegistry.target, paymentAmount);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr1).createNickname(nickname);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                busdMock, 'ERC20InsufficientBalance'
            ).withArgs(addr1.address, paymentAmount - 1n, paymentAmount);
        });

        it('should revert if nickname is already taken', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';

            const tokenAddress = ZeroAddress;
            const paymentAmount = ethers.parseUnits('1', 18);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFeeAmount = await nicknameRegistry.nicknameFee();

            await nicknameRegistry.connect(addr1).createNickname(nickname, { value: nicknameFeeAmount });

            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr2).createNickname(nickname, { value: nicknameFeeAmount });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'NicknameIsAlreadyTaken'
            );
        });

        it('should revert if address already has a nickname', async () => {
            const nickname1 = 'testNick1';
            const nickname2 = 'testNick2';
            const tokenAddress = ZeroAddress;
            const paymentAmount = ethers.parseUnits('1', 18);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFeeAmount = await nicknameRegistry.nicknameFee();

            await nicknameRegistry.connect(addr1).createNickname(nickname1, { value: nicknameFeeAmount });

            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr1).createNickname(nickname2, { value: nicknameFeeAmount });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'AddressAlreadyHasNickname'
            ).withArgs(nickname1);
        });
    });

    describe('getAddressByNickname', async () => {
        it('should retrieve address by nickname', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';

            const tokenAddress = ZeroAddress;
            const paymentAmount = ethers.parseUnits('1', 18);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFeeAmount = await nicknameRegistry.nicknameFee();

            await nicknameRegistry.connect(addr1).createNickname(nickname, { value: nicknameFeeAmount });

            /* EXECUTE */
            const addr1Address = await nicknameRegistry.connect(admin).getAddressByNickname(nickname);

            /* ASSERT */
            expect(addr1Address).to.equal(account);
        });
    });
    describe('getNicknameByAddress', async () => {
        it('should retrieve nickname by address', async () => {
            /* SETUP */
            const account = addr1.address;
            const nickname = 'testNick';

            const tokenAddress = ZeroAddress;
            const paymentAmount = ethers.parseUnits('1', 18);

            await nicknameRegistry.connect(admin).setNicknameFee(paymentAmount, tokenAddress);

            const nicknameFeeAmount = await nicknameRegistry.nicknameFee();

            await nicknameRegistry.connect(addr1).createNickname(nickname, { value: nicknameFeeAmount });

            /* EXECUTE */
            const addr1Nickname = await nicknameRegistry.connect(admin).getNicknameByAddress(account);

            /* ASSERT */
            expect(addr1Nickname).to.equal(nickname);
        });
    });

    describe('upgradeToAndCall', async () => {
        let newImplementation: NicknameRegistry;

        beforeEach(async () => {
            const factory = await ethers.getContractFactory("NicknameRegistry");
            newImplementation = await factory.deploy();
        });

        it('should upgrade to a new implementation', async () => {
            /* SETUP */
            const implementationBefore = await upgrades.erc1967.getImplementationAddress(nicknameRegistry.target as string);

            /* EXECUTE */
            await nicknameRegistry.connect(admin).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            const implementationAfter = await upgrades.erc1967.getImplementationAddress(nicknameRegistry.target as string);

            expect(implementationBefore).not.to.equal(implementationAfter);
        });

        it('rejects if not admin role', async function () {
            /* EXECUTE */
            const promise = nicknameRegistry.connect(addr1).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                nicknameRegistry, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });
});
