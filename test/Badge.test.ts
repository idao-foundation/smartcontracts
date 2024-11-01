import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { ZeroAddress } from "ethers";
import {
    AccessManager,
    AccessManager__factory,
    BetContract,
    BetContract__factory,
    SlotManager,
    SlotManager__factory,
    BadgeContract,
    BadgeContract__factory,
    BUSDMock,
    BUSDMock__factory
} from "../typechain-types";

import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers"
describe("BadgeContract", () => {
    let badgeContract: BadgeContract;
    let manager: AccessManager;
    let slotManager: SlotManager;
    let betContract: BetContract;
    let busdMock: BUSDMock;
    let admin: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    const globalSlotLimit = 5;
    const nativeFeeAmount = ethers.parseUnits('1', 18);
    const ADMIN_ROLE = 0n;

    before(async () => {
        await reset();
    });

    beforeEach(async () => {
        [admin, addr1] = await ethers.getSigners();

        const BUSDMock = (await ethers.getContractFactory('BUSDMock')) as BUSDMock__factory;
        busdMock = await BUSDMock.deploy();

        const Manager = (await ethers.getContractFactory('AccessManager')) as AccessManager__factory;
        manager = await Manager.deploy(admin.address);

        const SlotManager = (await ethers.getContractFactory('SlotManager')) as SlotManager__factory;
        slotManager = await upgrades.deployProxy(
            SlotManager,
            [manager.target, globalSlotLimit],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as SlotManager;

        const BetContract = (await ethers.getContractFactory('BetContract')) as BetContract__factory;
        betContract = await upgrades.deployProxy(
            BetContract,
            [manager.target, slotManager.target, ethers.ZeroAddress, nativeFeeAmount],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as BetContract;

        const BadgeContract = (await ethers.getContractFactory('BadgeContract')) as BadgeContract__factory;
        badgeContract = await upgrades.deployProxy(
            BadgeContract,
            [manager.target, betContract.target],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as BadgeContract;
    });

    describe('Initialize', () => {
        it('should initialize the contract correctly', async () => {
            /* ASSERT */
            const [isAdmin,] = await manager.hasRole(ADMIN_ROLE, admin.address);
            expect(isAdmin).to.equal(true);

            const betContractAddress = await badgeContract.betContract();
            expect(betContractAddress).to.equal(betContract.target);
        });
    });

    describe('createBadge', () => {
        it('should create a badge', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');

            /* EXECUTE */
            const tx = await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            /* ASSERT */
            const badgeInfo = await badgeContract.badgeInfo(1);
            expect(badgeInfo.requiredBets).to.equal(requiredBets);
            expect(badgeInfo.feePrice).to.equal(feePrice);

            await expect(tx).to.emit(badgeContract, 'BadgeCreated').withArgs(1, requiredBets, feePrice);
        });

        it('rejects if not admin role', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).createBadge(requiredBets, feePrice);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('updateBadge', () => {
        it('should update a badge', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            const updatedBets = 20;
            const updatedFee = ethers.parseUnits('2', 'ether');

            /* EXECUTE */
            const tx = await badgeContract.connect(admin).updateBadge(1, updatedBets, updatedFee);

            /* ASSERT */
            const badgeInfo = await badgeContract.badgeInfo(1);
            expect(badgeInfo.requiredBets).to.equal(updatedBets);
            expect(badgeInfo.feePrice).to.equal(updatedFee);

            await expect(tx).to.emit(badgeContract, 'BadgeUpdated').withArgs(1, updatedBets, updatedFee);
        });

        it('should revert if badge ID is zero', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            const updatedBets = 20;
            const updatedFee = ethers.parseUnits('2', 'ether');

            /* EXECUTE */
            const promise = badgeContract.connect(admin).updateBadge(0, updatedBets, updatedFee);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'InvalidBadgeId'
            );
        });

        it('should revert if badge ID is not valid', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            const updatedBets = 20;
            const updatedFee = ethers.parseUnits('2', 'ether');

            /* EXECUTE */
            const promise = badgeContract.connect(admin).updateBadge(100, updatedBets, updatedFee);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'InvalidBadgeId'
            );
        });

        it('rejects if not admin role', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            const updatedBets = 20;
            const updatedFee = ethers.parseUnits('2', 'ether');

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).updateBadge(1, updatedBets, updatedFee);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('upgradeToAndCall', async () => {
        let newImplementation: BadgeContract;

        beforeEach(async () => {
            const factory = await ethers.getContractFactory("BadgeContract");
            newImplementation = await factory.deploy();
        });

        it('should upgrade to a new implementation', async () => {
            /* SETUP */
            const implementationBefore = await upgrades.erc1967.getImplementationAddress(badgeContract.target as string);

            /* EXECUTE */
            await badgeContract.connect(admin).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            const implementationAfter = await upgrades.erc1967.getImplementationAddress(badgeContract.target as string);

            expect(implementationBefore).not.to.equal(implementationAfter);
        });

        it('rejects if not admin role', async function () {
            /* EXECUTE */
            const promise = badgeContract.connect(addr1).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('getHigherBadge', async () => {
        it('should return the highest badge ID the user is eligible to claim', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            const requiredBets3 = 30;
            const feePrice3 = ethers.parseUnits('3', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets3, feePrice3);

            await betContract.setUserBetCount(21, addr1.address);

            /* EXECUTE */
            const highestBadge = await badgeContract.getHigherBadge(addr1.address);

            /* ASSERT */
            expect(highestBadge).to.equal(2);
        });

        it('should return 0 if no badges are eligible', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            const requiredBets3 = 30;
            const feePrice3 = ethers.parseUnits('3', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets3, feePrice3);

            await betContract.setUserBetCount(5, addr1.address);

            /* EXECUTE */
            const highestBadge = await badgeContract.getHigherBadge(addr1.address);

            /* ASSERT */
            expect(highestBadge).to.equal(0);
        });

        it('should return 0 if no badges exist', async () => {
            /* SETUP */
            await betContract.setUserBetCount(5, addr1.address);

            /* EXECUTE */
            const highestBadge = await badgeContract.getHigherBadge(addr1.address);

            /* ASSERT */
            expect(highestBadge).to.equal(0);
        });

        it('should return 0 if user has claimed all badges', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            const requiredBets3 = 30;
            const feePrice3 = ethers.parseUnits('3', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets3, feePrice3);

            await betContract.setUserBetCount(10, addr1.address);
            await badgeContract.connect(addr1).claim(1, { value: feePrice1 });

            await betContract.setUserBetCount(20, addr1.address);
            await badgeContract.connect(addr1).claim(2, { value: feePrice2 });

            await betContract.setUserBetCount(30, addr1.address);
            await badgeContract.connect(addr1).claim(3, { value: feePrice3 });

            /* EXECUTE */
            const highestBadge = await badgeContract.getHigherBadge(addr1.address);

            /* ASSERT */
            expect(highestBadge).to.equal(0);
        });
    });

    describe('claim', async () => {
        it('should allow user to claim a badge', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            await betContract.setUserBetCount(requiredBets, addr1.address);

            const contractBalanceBefore = await ethers.provider.getBalance(badgeContract.target);
            const addr1BalanceBefore = await ethers.provider.getBalance(addr1.address);

            /* EXECUTE */
            const tx = await badgeContract.connect(addr1).claim(1, { value: feePrice });

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);

            const contractBalanceAfter = await ethers.provider.getBalance(badgeContract.target);
            const addr1BalanceAfter = await ethers.provider.getBalance(addr1.address);

            expect(contractBalanceAfter).to.equal(contractBalanceBefore + feePrice);
            expect(addr1BalanceAfter).to.equal(addr1BalanceBefore - feePrice - fee);

            const claimedBadges = await badgeContract.getClaimedBadges(addr1.address);
            expect(claimedBadges).to.include(1n);

            await expect(tx).to.emit(badgeContract, 'BadgeClaimed').withArgs(addr1.address, 1, requiredBets);
        });

        it('should revert if user has insufficient bets', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            await betContract.setUserBetCount(5, addr1.address);

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).claim(1, { value: feePrice });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'InsufficientBets'
            );
        });

        it('should revert if fee is incorrect', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            await betContract.setUserBetCount(10, addr1.address);

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).claim(1, { value: ethers.parseUnits('0.5', 'ether') });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'IncorrectFeeAmount'
            );
        });

        it('should revert if badge ID is invalid', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            await betContract.setUserBetCount(10, addr1.address);

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).claim(2, { value: feePrice });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'InvalidBadgeId'
            );
        });

        it('should revert if badge ID is zero', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            await betContract.setUserBetCount(10, addr1.address);

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).claim(0, { value: feePrice });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'InvalidBadgeId'
            );
        });

        it('should revert if badge has already been claimed', async () => {
            /* SETUP */
            const requiredBets = 10;
            const feePrice = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets, feePrice);

            await betContract.setUserBetCount(10, addr1.address);
            await badgeContract.connect(addr1).claim(1, { value: feePrice });

            /* EXECUTE */
            const promise = badgeContract.connect(addr1).claim(1, { value: feePrice });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                badgeContract, 'BadgeAlreadyClaimed'
            );
        });
    });

    describe('getClaimedBadges', async () => {
        it('should return the badges claimed by a user', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            await betContract.setUserBetCount(10, addr1.address);
            await badgeContract.connect(addr1).claim(1, { value: feePrice1 });

            await betContract.setUserBetCount(20, addr1.address);
            await badgeContract.connect(addr1).claim(2, { value: feePrice2 });

            /* EXECUTE */
            const claimedBadges = await badgeContract.getClaimedBadges(addr1.address);

            /* ASSERT */
            expect(claimedBadges).to.include(1n);
            expect(claimedBadges).to.include(2n);
        });

        it('should return an empty array if no badges have been claimed', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            /* EXECUTE */
            const claimedBadges = await badgeContract.getClaimedBadges(addr1.address);

            /* ASSERT */
            expect(claimedBadges).to.be.empty;
        });
    });

    describe('getLastClaimedBadge', async () => {
        it('should return the last badge claimed by a user', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            await betContract.setUserBetCount(10, addr1.address);
            await badgeContract.connect(addr1).claim(1, { value: feePrice1 });

            await betContract.setUserBetCount(20, addr1.address);
            await badgeContract.connect(addr1).claim(2, { value: feePrice2 });

            /* EXECUTE */
            const lastClaimedBadge = await badgeContract.getLastClaimedBadge(addr1.address);

            /* ASSERT */
            expect(lastClaimedBadge).to.equal(2);
        });

        it('should return 0 if no badges have been claimed', async () => {
            /* SETUP */
            const requiredBets1 = 10;
            const feePrice1 = ethers.parseUnits('1', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets1, feePrice1);

            const requiredBets2 = 20;
            const feePrice2 = ethers.parseUnits('2', 'ether');
            await badgeContract.connect(admin).createBadge(requiredBets2, feePrice2);

            /* EXECUTE */
            const lastClaimedBadge = await badgeContract.getLastClaimedBadge(addr1.address);

            /* ASSERT */
            expect(lastClaimedBadge).to.equal(0);
        });
    });

    describe('rescueERC20OrNative', async () => {
        it('should allow the admin to rescue ERC20', async function () {
            /* SETUP */
            const to = admin.address;
            const amount = ethers.parseUnits('1', 18);
            const rescueAmount = ethers.parseUnits('0.5', 18);

            // Transfer some tokens to the contract
            await busdMock.mint(betContract.target, amount);

            /* ASSERT */
            const ownerBalanceBefore = await busdMock.balanceOf(to);

            expect(await busdMock.balanceOf(betContract.target)).to.equal(amount);

            /* EXECUTE */
            await betContract.connect(admin).rescueERC20OrNative(busdMock.target, to, rescueAmount);

            /* ASSERT */
            const ownerBalanceAfter = await busdMock.balanceOf(to);

            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + rescueAmount);
            expect(await busdMock.balanceOf(betContract.target)).to.equal(amount - rescueAmount);
        });

        it('should allow the admin to rescue native coins', async function () {
            /* SETUP */
            const to = admin.address;
            const amount = ethers.parseUnits('1');
            const rescueAmount = ethers.parseUnits('0.5');

            // Send native coins to the contract address
            await admin.sendTransaction({
                to: betContract.target,
                value: amount
            });

            const ownerBalanceBefore = await ethers.provider.getBalance(to);

            /* EXECUTE */
            const tx = await betContract.connect(admin).rescueERC20OrNative(ZeroAddress, to, rescueAmount);

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);
            const ownerBalanceAfter = await ethers.provider.getBalance(to);

            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + rescueAmount - fee);
            expect(await ethers.provider.getBalance(betContract.target)).to.equal(amount - rescueAmount);
        });

        it('rejects if not admin role', async function () {
            /* SETUP */
            const amount = ethers.parseUnits('1', 18);

            /* EXECUTE */
            const promise = betContract.connect(addr1).rescueERC20OrNative(busdMock.target, addr1.address, amount);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });
});
