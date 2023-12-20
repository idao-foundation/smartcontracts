import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { ZeroAddress, Addressable } from "ethers";
import { 
    AccessManager, 
    AccessManager__factory, 
    BetContract, 
    BetContract__factory, 
    SlotManager, 
    SlotManager__factory, 
    MockSource, 
    MockSource__factory, 
    BUSDMock, 
    BUSDMock__factory 
} from "../typechain-types";

import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers"

async function setFunctionRole(
    admin: HardhatEthersSigner,
    manager: AccessManager,
    target: string | Addressable,
    funcSig: string,
    role: bigint
) {
    const functionSelector = ethers.dataSlice(ethers.id(funcSig), 0, 4);

    await manager.connect(admin).setTargetFunctionRole(
        target,
        [functionSelector],
        role
    );
}

async function getBlockTimestamp(tx: any): Promise<number> {
    const minedTx = await tx.wait();
    const txBlock = await ethers.provider.getBlock(minedTx.blockNumber);
    return txBlock?.timestamp || 0;
}

describe('BetContract', () => {
    let manager: AccessManager;
    let slotManager: SlotManager;
    let betContract: BetContract;
    let busdMock: BUSDMock;
    let mockSourse: MockSource;
    let admin: HardhatEthersSigner;
    let gelato: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    const globalSlotLimit = 5;
    const nativeFeeAmount = ethers.parseUnits('1', 18);
    const ADMIN_ROLE = 0n;
    const SLOT_MANAGER_ROLE = 1n;
    const GELATO_ROLE = 2n;
    const ORACLE_PRICE = ethers.parseUnits('1', 18);
    const ORACLE_DECIMALS = 18n;

    before(async () => {
        await reset();
    });

    beforeEach(async () => {
        [admin, gelato, addr1] = await ethers.getSigners();

        const BUSDMock = (await ethers.getContractFactory('BUSDMock')) as BUSDMock__factory;
        busdMock = await BUSDMock.deploy();

        const MockSource = (await ethers.getContractFactory('MockSource')) as MockSource__factory;
        mockSourse = await MockSource.deploy();

        await mockSourse.setPrice(ORACLE_PRICE, ORACLE_DECIMALS);

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

        await manager.connect(admin).grantRole(SLOT_MANAGER_ROLE, betContract.target, 0);
        await manager.connect(admin).grantRole(GELATO_ROLE, gelato.address, 0);

        await setFunctionRole(admin, manager, slotManager.target, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'freeSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(admin, manager, betContract.target, 'fillPrice(uint256)', GELATO_ROLE);
    });

    describe('Initialize', async () => {
        it('should initialize the contract correctly', async () => {
            /* ASSERT */
            const [isAdmin,] = await manager.hasRole(ADMIN_ROLE, admin.address);
            expect(isAdmin).to.equal(true);

            const nativeFee = await betContract.nativeFeeAmount();
            expect(nativeFee).to.equal(nativeFeeAmount);
        });
    });

    describe('bet', async () => {
        it('should place a bet correctly', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount();

            /* EXECUTE */
            const tx = await betContract.connect(addr1).bet(poolId, nativeFeeAmount, duration, {
                value: amount
            });

            /* ASSERT */
            const betCount = await betContract.betLength();
            const betId = betCount - 1n;

            expect(betCount).to.equal(1);

            const createdAt = await getBlockTimestamp(tx);

            const [bidder, currentPoolId, bidPrice, resultPrice, bidStartTimestamp, bidEndTimestamp, bidSettlementTimestamp] = await betContract.betInfo(betId);

            expect(addr1.address).to.be.equal(bidder);
            expect(poolId).to.be.equal(currentPoolId);
            expect(amount).to.be.equal(bidPrice);
            expect(0).to.be.equal(resultPrice);
            expect(createdAt).to.be.equal(bidStartTimestamp);
            expect(BigInt(createdAt) + duration).to.be.equal(bidEndTimestamp);
            expect(settlementPeriods[0]).to.be.equal(bidSettlementTimestamp);

            await expect(tx).to.emit(betContract, 'BetPlaced')
                .withArgs(betId, poolId, addr1.address, amount, nativeFeeAmount, duration, settlementPeriods[0]);
        });

        it('should revert when pool does not exist', async () => {
            /* SETUP */
            const poolId = await betContract.poolLength();
            const predictionPrice = ethers.parseUnits('1', 18);
            const duration = 1n;

            /* EXECUTE */
            const promise = betContract.bet(poolId, predictionPrice, duration);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'PoolDoesNotExist'
            );
        });

        it('should revert when pool is inactive', async () => {
            /* SETUP */
            const active = false;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const predictionPrice = ethers.parseUnits('1', 18);
            const duration = durations[0];

            /* EXECUTE */
            const promise = betContract.bet(poolId, predictionPrice, duration);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'PoolIsInactive'
            );
        });

        it('should revert when insufficient funds', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const predictionPrice = ethers.parseUnits('1', 18);
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount() - 1n;

            /* EXECUTE */
            const promise = betContract.bet(poolId, predictionPrice, duration, {
                value: amount
            });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'InsufficientFunds'
            );
        });

        it('should revert when duration does not exist in pool', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const predictionPrice = ethers.parseUnits('1', 18);
            const duration = 0;

            const amount = await betContract.nativeFeeAmount();

            /* EXECUTE */
            const promise = betContract.bet(poolId, predictionPrice, duration, {
                value: amount
            });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'DurationNotAllowed'
            );
        });
    });

    describe('betLength', async () => {
        it('should return the number of bet created', async () => {
            /* SETUP */
            const betCountBefore = await betContract.betLength();
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount();

            const tx = await betContract.connect(addr1).bet(poolId, nativeFeeAmount, duration, {
                value: amount
            });

            /* EXECUTE */
            const betCountAfter = await betContract.betLength();

            /* ASSERT */
            expect(betCountAfter).to.equal(betCountBefore + 1n);
        });
    });

    describe('betInfo', async () => {
        it('should retrieve information about a specific bet', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount();

            const tx = await betContract.connect(addr1).bet(poolId, nativeFeeAmount, duration, {
                value: amount
            });

            const betCount = await betContract.betLength();
            const betId = betCount - 1n;

            /* EXECUTE */
            const [bidder, currentPoolId, bidPrice, resultPrice, bidStartTimestamp, bidEndTimestamp, bidSettlementTimestamp] = await betContract.betInfo(betId);

            /* ASSERT */
            const createdAt = await getBlockTimestamp(tx);

            expect(addr1.address).to.be.equal(bidder);
            expect(poolId).to.be.equal(currentPoolId);
            expect(amount).to.be.equal(bidPrice);
            expect(0).to.be.equal(resultPrice);
            expect(createdAt).to.be.equal(bidStartTimestamp);
            expect(BigInt(createdAt) + duration).to.be.equal(bidEndTimestamp);
            expect(settlementPeriods[0]).to.be.equal(bidSettlementTimestamp);
        });

        it('should revert when bet does not exist', async () => {
            /* SETUP */
            const betId = await betContract.betLength();

            /* EXECUTE */
            const promise = betContract.betInfo(betId);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'BetDoesNotExist'
            );
        });
    });

    describe('fillPrice', async () => {
        it('should fetch the price from Chainlink after the bet duration ends', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 4000n, 5000n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount();

            await betContract.connect(addr1).bet(poolId, nativeFeeAmount, duration, {
                value: amount
            });

            const betCount = await betContract.betLength();
            const betId = betCount - 1n;

            /* EXECUTE */
            await betContract.connect(gelato).fillPrice(betId);

            /* ASSERT */
            const [, , , resultPrice, , ,] = await betContract.betInfo(betId);
            expect(resultPrice).to.be.equal(ORACLE_PRICE);
        });

        it('should revert when bet does not exist', async () => {
            /* SETUP */
            const betId = await betContract.betLength();

            /* EXECUTE */
            const promise = betContract.connect(gelato).fillPrice(betId);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'BetDoesNotExist'
            );
        });

        it('should revert when bet does not exist', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [3600n, 4000n, 5000n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount();

            const tx = await betContract.connect(addr1).bet(poolId, nativeFeeAmount, duration, {
                value: amount
            });

            const betCount = await betContract.betLength();
            const betId = betCount - 1n;

            /* EXECUTE */
            const promise = betContract.connect(gelato).fillPrice(betId);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'BetNotEnded'
            );
        });

        it('rejects if not gelato role', async () => {
            /* SETUP */
            const account = Math.floor(Math.random() * 2) === 1 ? addr1 : admin;
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 4000n, 5000n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolId = await betContract.poolLength() - 1n;
            const duration = durations[0];

            const amount = await betContract.nativeFeeAmount();

            await betContract.connect(addr1).bet(poolId, nativeFeeAmount, duration, {
                value: amount
            });

            const betCount = await betContract.betLength();
            const betId = betCount - 1n;

            /* EXECUTE */
            const promise = betContract.connect(addr1).fillPrice(betId);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'AccessManagedUnauthorized'
            ).withArgs(account.address);
        });
    });

    describe('setNativeFeeAmount', async () => {
        it('should set native fee amount correctly', async () => {
            /* SETUP */
            const nativeFeeBefore = await betContract.nativeFeeAmount();
            const newNativeFee = ethers.parseUnits('2', 18);

            /* EXECUTE */
            await betContract.connect(admin).setNativeFeeAmount(newNativeFee);

            /* ASSERT */
            const nativeFeeAfter = await betContract.nativeFeeAmount();

            expect(nativeFeeAfter).not.to.equal(nativeFeeBefore);
            expect(nativeFeeAfter).to.equal(newNativeFee);
        });

        it('rejects if native fee amount is 0', async () => {
            /* SETUP */
            const newNativeFee = 0;

            /* EXECUTE */
            const promise = betContract.connect(admin).setNativeFeeAmount(newNativeFee);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'AmountIsZero'
            );
        });

        it('rejects if not admin role', async () => {
            /* SETUP */
            const newNativeFee = ethers.parseUnits('2', 18);

            /* EXECUTE */
            const promise = betContract.connect(addr1).setNativeFeeAmount(newNativeFee);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('nativeFeeAmount', async () => {
        it('should get native fee amount correctly', async () => {
            /* SETUP */
            const nativeFeeBefore = await betContract.nativeFeeAmount();
            const newNativeFee = ethers.parseUnits('2', 18);

            await betContract.connect(admin).setNativeFeeAmount(newNativeFee);

            /* EXECUTE */
            const nativeFeeAfter = await betContract.nativeFeeAmount();

            /* ASSERT */
            expect(nativeFeeAfter).not.to.equal(nativeFeeBefore);
            expect(nativeFeeAfter).to.equal(newNativeFee);
        });
    });

    describe('rescueERC20OrNative', async () => {
        it('should allow the admin to rescue ERC20', async function () {
            /* SETUP */
            const to = admin.address;
            const amount = ethers.parseUnits('1', 18);

            // Transfer some tokens to the contract
            await busdMock.mint(betContract.target, amount);

            /* ASSERT */
            const ownerBalanceBefore = await busdMock.balanceOf(to);

            expect(await busdMock.balanceOf(betContract.target)).to.equal(amount);

            /* EXECUTE */
            await betContract.connect(admin).rescueERC20OrNative(busdMock.target, to, amount);

            /* ASSERT */
            const ownerBalanceAfter = await busdMock.balanceOf(to);

            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + amount);
            expect(await busdMock.balanceOf(betContract.target)).to.equal(0);
        });

        it('should allow the admin to rescue native coins', async function () {
            /* SETUP */
            const to = admin.address;
            const amount = ethers.parseUnits('1');

            // Send native coins to the contract address
            await admin.sendTransaction({
                to: betContract.target,
                value: amount
            });

            const ownerBalanceBefore = await ethers.provider.getBalance(to);

            /* EXECUTE */
            const tx = await betContract.connect(admin).rescueERC20OrNative(ZeroAddress, to, amount);

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);
            const ownerBalanceAfter = await ethers.provider.getBalance(to);

            expect(ownerBalanceAfter).to.be.equal(ownerBalanceBefore + amount - fee);
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

    describe('createPool', async () => {
        it('should create a new pool with specified parameters', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const tx = await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;

            const [currentActive, currentName, currentOracleAddress, currentDurations, currentSettlementPeriods] = await betContract.poolInfo(poolId);

            expect(poolCount).to.equal(1);

            expect(active).to.be.equal(currentActive);
            expect(name).to.be.equal(currentName);
            expect(oracleAddress).to.be.equal(currentOracleAddress);
            expect(durations).to.deep.equal(currentDurations);
            expect(settlementPeriods).to.deep.equal(currentSettlementPeriods);

            await expect(tx).to.emit(betContract, 'PoolCreated')
                .withArgs(poolId, active, name, oracleAddress, durations, settlementPeriods);
        });

        it('should revert when duration length is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations: bigint[] = [];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "DataLengthsIsZero");
        });

        it('should revert when durations and settlementPeriods length are not the same', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "DataLengthsMismatch");
        });

        it('should revert when oracle address is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = ZeroAddress;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "ZeroAddress");
        });

        it('rejects if not admin role', async function () {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(addr1).createPool(active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('setPoolStatus', async () => {
        let activeBefore: boolean;

        beforeEach(async () => {
            activeBefore = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(activeBefore, name, oracleAddress, durations, settlementPeriods);
        });

        it('should create a new pool with specified parameters', async () => {
            /* SETUP */
            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;
            const newActive = false;

            /* EXECUTE */
            const tx = await betContract.connect(admin).setPoolStatus(poolId, newActive);

            /* ASSERT */
            const [currentActive, , , ,] = await betContract.poolInfo(poolId);

            expect(activeBefore).not.to.be.equal(currentActive);
            expect(newActive).to.be.equal(currentActive);

            await expect(tx).to.emit(betContract, 'PoolStatusUpdated')
                .withArgs(poolId, newActive);
        });

        it('should revert when pool does not exist', async () => {
            /* SETUP */
            const poolId = await betContract.poolLength();
            const newActive = false;

            /* EXECUTE */
            const promise = betContract.connect(admin).setPoolStatus(poolId, newActive);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'PoolDoesNotExist'
            );
        });

        it('rejects if not admin role', async function () {
            /* SETUP */
            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;
            const newActive = false;

            /* EXECUTE */
            const promise = betContract.connect(addr1).setPoolStatus(poolId, newActive);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('editPool', async () => {
        let activeBefore: boolean;
        let nameBefore: string;
        let oracleAddressBefore: string | Addressable;
        let durationsBefore: bigint[];
        let settlementPeriodsBefore: bigint[];
        let poolId: bigint;

        beforeEach(async () => {
            activeBefore = true;
            nameBefore = 'New Pool';
            oracleAddressBefore = mockSourse.target;
            durationsBefore = [1n, 2n, 3n];
            settlementPeriodsBefore = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(activeBefore, nameBefore, oracleAddressBefore, durationsBefore, settlementPeriodsBefore);

            const poolCount = await betContract.poolLength();
            poolId = poolCount - 1n;
        });

        it('should edit an existing pool with specified parameters', async () => {
            /* SETUP */
            const active = false;
            const name = 'Updated Pool';
            const oracleAddress = '0xCC79157eb46F5624204f47AB42b3906cAA40eaB7';
            const durations = [1n, 2n, 3n, 4n];
            const settlementPeriods = [10n, 20n, 30n, 40n];

            /* EXECUTE */
            const tx = await betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            const [currentActive, currentName, currentOracleAddress, currentDurations, currentSettlementPeriods] = await betContract.poolInfo(poolId);

            expect(active).to.be.equal(currentActive);
            expect(name).to.be.equal(currentName);
            expect(oracleAddress).to.be.equal(currentOracleAddress);
            expect(durations).to.deep.equal(currentDurations);

            expect(activeBefore).not.to.be.equal(currentActive);
            expect(nameBefore).not.to.be.equal(currentName);
            expect(oracleAddressBefore).not.to.be.equal(currentOracleAddress);
            expect(durationsBefore).not.to.deep.equal(currentDurations);
            expect(settlementPeriodsBefore).not.to.deep.equal(currentSettlementPeriods);

            await expect(tx).to.emit(betContract, 'PoolUpdated')
                .withArgs(poolId, active, name, oracleAddress, durations, settlementPeriods);
        });

        it('should revert when duration length is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations: bigint[] = [];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "DataLengthsIsZero");
        });

        it('should revert when durations and settlementPeriods length are not the same', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "DataLengthsMismatch");
        });

        it('should revert when oracle address is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = ZeroAddress;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "ZeroAddress");
        });

        it('should revert when pool does not exist', async () => {
            /* SETUP */
            const poolId = await betContract.poolLength();
            const active = false;
            const name = 'Updated Pool';
            const oracleAddress = '0xCC79157eb46F5624204f47AB42b3906cAA40eaB7';
            const durations = [1n, 2n, 3n, 4n];
            const settlementPeriods = [10n, 20n, 30n, 40n];

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'PoolDoesNotExist'
            );
        });

        it('rejects if not admin role', async function () {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            /* EXECUTE */
            const promise = betContract.connect(addr1).editPool(poolId, active, name, oracleAddress, durations, settlementPeriods);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('poolLength', async () => {
        it('should return the number of pools created', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];
            const poolCountBefore = await betContract.poolLength();

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            /* EXECUTE */
            const poolCountAfter = await betContract.poolLength();

            /* ASSERT */
            expect(poolCountAfter).to.equal(poolCountBefore + 1n);
        });
    });

    describe('poolInfo', async () => {
        it('should retrieve information about a specific pool', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = mockSourse.target;
            const durations = [1n, 2n, 3n];
            const settlementPeriods = [10n, 20n, 30n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations, settlementPeriods);

            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;

            /* EXECUTE */
            const [currentActive, currentName, currentOracleAddress, currentDurations, currentSettlementPeriods] = await betContract.poolInfo(poolId);

            /* ASSERT */
            expect(active).to.be.equal(currentActive);
            expect(name).to.be.equal(currentName);
            expect(oracleAddress).to.be.equal(currentOracleAddress);
            expect(durations).to.deep.equal(currentDurations);
            expect(settlementPeriods).to.deep.equal(currentSettlementPeriods);
        });

        it('should revert when pool does not exist', async () => {
            /* SETUP */
            const poolId = await betContract.poolLength();

            /* EXECUTE */
            const promise = betContract.poolInfo(poolId);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'PoolDoesNotExist'
            );
        });
    });

    describe('upgradeToAndCall', async () => {
        let newImplementation: BetContract;

        beforeEach(async () => {
            const factory = await ethers.getContractFactory("BetContract");
            newImplementation = await factory.deploy();
        });

        it('should upgrade to a new implementation', async () => {
            /* SETUP */
            const implementationBefore = await upgrades.erc1967.getImplementationAddress(betContract.target as string);

            /* EXECUTE */
            await betContract.connect(admin).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            const implementationAfter = await upgrades.erc1967.getImplementationAddress(betContract.target as string);

            expect(implementationBefore).not.to.equal(implementationAfter);
        });

        it('rejects if not admin role', async function () {
            /* EXECUTE */
            const promise = betContract.connect(addr1).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });
});
