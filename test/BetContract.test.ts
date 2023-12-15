import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { SlotManager__factory } from "../typechain-types/factories/contracts/SlotManager__factory";
import { BetContract__factory } from "../typechain-types/factories/contracts/BetContract__factory";
import { BUSDMock__factory } from "../typechain-types/factories/contracts/test/BUSDMock__factory";
import { BUSDMock } from "../typechain-types/contracts/test/BUSDMock";
import { ZeroAddress, Addressable } from "ethers";
import { AccessManager, AccessManager__factory, BetContract, SlotManager } from "../typechain-types";

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

describe('BetContract', () => {
    let manager: AccessManager;
    let slotManager: SlotManager;
    let betContract: BetContract;
    let busdMock: BUSDMock;
    let admin: HardhatEthersSigner;
    let slotManagerRole: HardhatEthersSigner;
    let upgrader: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    const globalSlotLimit = 5;
    const nativeFeeAmount = 1;
    const DEFAULT_ADMIN_ROLE = 0n;
    const SLOT_MANAGER_ROLE = 1n;

    beforeEach(async () => {
        [admin, slotManagerRole, upgrader, addr1] = await ethers.getSigners();

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

        await manager.connect(admin).grantRole(SLOT_MANAGER_ROLE, slotManagerRole.address, 0);

        await setFunctionRole(admin, manager, slotManager.target, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'freeSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'editGlobalSlotLimit(uint256)', DEFAULT_ADMIN_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'overrideSlotLimit(address,uint256)', DEFAULT_ADMIN_ROLE);

        const BetContract = (await ethers.getContractFactory('BetContract')) as BetContract__factory;
        betContract = await upgrades.deployProxy(
            BetContract,
            [manager.target, nativeFeeAmount],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as BetContract;

        await setFunctionRole(admin, manager, betContract.target, 'createPool(bool,string,address,uint256[])', DEFAULT_ADMIN_ROLE);
        await setFunctionRole(admin, manager, betContract.target, 'setPoolStatus(uint256,bool)', DEFAULT_ADMIN_ROLE);
        await setFunctionRole(admin, manager, betContract.target, 'editPool(uint256,bool,string,address,uint256[])', DEFAULT_ADMIN_ROLE);
        await setFunctionRole(admin, manager, betContract.target, 'rescueERC20OrNative(address,address,uint256)', DEFAULT_ADMIN_ROLE);
        await setFunctionRole(admin, manager, betContract.target, 'setNativeFeeAmount(uint256)', DEFAULT_ADMIN_ROLE);
    });

    describe('Initialize', async () => {
        it('should initialize the contract correctly', async () => {
            /* ASSERT */
            const [isAdmin,] = await manager.hasRole(DEFAULT_ADMIN_ROLE, admin.address);
            expect(isAdmin).to.equal(true);

            const nativeFee = await betContract.nativeFeeAmount();
            expect(nativeFee).to.equal(nativeFeeAmount);
        });
    });

    describe('setNativeFeeAmount', async () => {
        it('should set native fee amount correctly', async () => {
            /* SETUP */
            const nativeFeeBefore = await betContract.nativeFeeAmount();
            const newNativeFee = 20;

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

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const newNativeFee = 20;

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
            const newNativeFee = 10;

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

        it('rejects if not default admin role', async function () {
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
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations = [1n, 2n, 3n];

            /* EXECUTE */
            const tx = await betContract.connect(admin).createPool(active, name, oracleAddress, durations);

            /* ASSERT */
            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;

            const [currentActive, currentName, currentOracleAddress, currentDurations] = await betContract.poolInfo(poolId);

            expect(poolCount).to.equal(1);

            expect(active).to.be.equal(currentActive);
            expect(name).to.be.equal(currentName);
            expect(oracleAddress).to.be.equal(currentOracleAddress);
            expect(durations).to.deep.equal(currentDurations);

            await expect(tx).to.emit(betContract, 'PoolCreated')
                .withArgs(poolId, active, name, oracleAddress, durations);
        });

        it('should revert when duration length is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations: bigint[] = [];

            /* EXECUTE */
            const promise = betContract.connect(admin).createPool(active, name, oracleAddress, durations);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "DataLengthsIsZero");
        });

        it('should revert when oracle address is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = ZeroAddress;
            const durations = [1n, 2n, 3n];

            /* EXECUTE */
            const promise = betContract.connect(admin).createPool(active, name, oracleAddress, durations);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "ZeroAddress");
        });

        it('rejects if not default admin role', async function () {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations = [1n, 2n, 3n];

            /* EXECUTE */
            const promise = betContract.connect(addr1).createPool(active, name, oracleAddress, durations);

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
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations = [1n, 2n, 3n];

            await betContract.connect(admin).createPool(activeBefore, name, oracleAddress, durations);
        });

        it('should create a new pool with specified parameters', async () => {
            /* SETUP */
            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;
            const newActive = false;

            /* EXECUTE */
            const tx = await betContract.connect(admin).setPoolStatus(poolId, newActive);

            /* ASSERT */
            const [currentActive, , ,] = await betContract.poolInfo(poolId);

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

        it('rejects if not default admin role', async function () {
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
        let oracleAddressBefore: string;
        let durationsBefore: bigint[];
        let poolId: bigint;

        beforeEach(async () => {
            activeBefore = true;
            nameBefore = 'New Pool';
            oracleAddressBefore = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            durationsBefore = [1n, 2n, 3n];

            await betContract.connect(admin).createPool(activeBefore, nameBefore, oracleAddressBefore, durationsBefore);

            const poolCount = await betContract.poolLength();
            poolId = poolCount - 1n;
        });

        it('should edit an existing pool with specified parameters', async () => {
            /* SETUP */
            const active = false;
            const name = 'Updated Pool';
            const oracleAddress = '0xCC79157eb46F5624204f47AB42b3906cAA40eaB7';
            const durations = [1n, 2n, 3n, 4n];

            /* EXECUTE */
            const tx = await betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations);

            /* ASSERT */
            const [currentActive, currentName, currentOracleAddress, currentDurations] = await betContract.poolInfo(poolId);

            expect(active).to.be.equal(currentActive);
            expect(name).to.be.equal(currentName);
            expect(oracleAddress).to.be.equal(currentOracleAddress);
            expect(durations).to.deep.equal(currentDurations);

            expect(activeBefore).not.to.be.equal(currentActive);
            expect(nameBefore).not.to.be.equal(currentName);
            expect(oracleAddressBefore).not.to.be.equal(currentOracleAddress);
            expect(durationsBefore).not.to.deep.equal(currentDurations);

            await expect(tx).to.emit(betContract, 'PoolUpdated')
                .withArgs(poolId, active, name, oracleAddress, durations);
        });

        it('should revert when duration length is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations: bigint[] = [];

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(betContract, "DataLengthsIsZero");
        });

        it('should revert when oracle address is zero', async () => {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = ZeroAddress;
            const durations = [1n, 2n, 3n];

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations);

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

            /* EXECUTE */
            const promise = betContract.connect(admin).editPool(poolId, active, name, oracleAddress, durations);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                betContract, 'PoolDoesNotExist'
            );
        });

        it('rejects if not default admin role', async function () {
            /* SETUP */
            const active = true;
            const name = 'New Pool';
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations = [1n, 2n, 3n];

            /* EXECUTE */
            const promise = betContract.connect(addr1).editPool(poolId, active, name, oracleAddress, durations);

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
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations = [1n, 2n, 3n];
            const poolCountBefore = await betContract.poolLength();

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations);

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
            const oracleAddress = '0x40193c8518BB267228Fc409a613bDbD8eC5a97b3';
            const durations = [1n, 2n, 3n];

            await betContract.connect(admin).createPool(active, name, oracleAddress, durations);

            const poolCount = await betContract.poolLength();
            const poolId = poolCount - 1n;

            /* EXECUTE */
            const [currentActive, currentName, currentOracleAddress, currentDurations] = await betContract.poolInfo(poolId);

            /* ASSERT */
            expect(active).to.be.equal(currentActive);
            expect(name).to.be.equal(currentName);
            expect(oracleAddress).to.be.equal(currentOracleAddress);
            expect(durations).to.deep.equal(currentDurations);
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

    it.only("upgrade",async () => {
        const factory = await ethers.getContractFactory("BetContract");
        const newImplementation = await factory.deploy();

        const implBefore = await upgrades.erc1967.getImplementationAddress(betContract.target as string);

        await betContract.connect(admin).upgradeToAndCall(newImplementation.target, "0x");

        const implAfter = await upgrades.erc1967.getImplementationAddress(betContract.target as string);

        expect(implBefore).not.to.equal(implAfter);

    })
});
