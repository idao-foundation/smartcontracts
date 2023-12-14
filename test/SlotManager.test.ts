import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { Manager__factory } from "../typechain-types/factories/contracts/Manager__factory";
import { Manager } from "../typechain-types/contracts/Manager";
import { SlotManager__factory } from "../typechain-types/factories/contracts/SlotManager__factory";

async function setFunctionRole(
    admin: HardhatEthersSigner,
    manager: any,
    target: string,
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

describe('SlotManager', () => {
    let manager: Manager;
    let slotManager: any;
    let admin: HardhatEthersSigner;
    let slotManagerRole: HardhatEthersSigner;
    let upgrader: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    const globalSlotLimit = 5;
    const DEFAULT_ADMIN_ROLE = 0n;
    const SLOT_MANAGER_ROLE = 1n;

    beforeEach(async () => {
        [admin, slotManagerRole, upgrader, addr1] = await ethers.getSigners();

        const Manager = (await ethers.getContractFactory('Manager')) as Manager__factory;
        manager = await Manager.deploy(admin.address);

        const SlotManager = (await ethers.getContractFactory('SlotManager')) as SlotManager__factory;
        slotManager = await upgrades.deployProxy(
            SlotManager,
            [upgrader.address, manager.target, globalSlotLimit],
            { initializer: 'initialize', kind: 'uups' }
        );

        await manager.connect(admin).grantRole(SLOT_MANAGER_ROLE, slotManagerRole.address, 0);

        await setFunctionRole(admin, manager, slotManager.target, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'freeSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'editGlobalSlotLimit(uint256)', DEFAULT_ADMIN_ROLE);
        await setFunctionRole(admin, manager, slotManager.target, 'overrideSlotLimit(address,uint256)', DEFAULT_ADMIN_ROLE);
    });

    describe('Initialize', async () => {
        it('should initialize the contract correctly', async () => {
            /* ASSERT */
            const [isAdmin,] = await manager.hasRole(DEFAULT_ADMIN_ROLE, admin.address);
            expect(isAdmin).to.equal(true);

            const [isSlotManager,] = await manager.hasRole(SLOT_MANAGER_ROLE, slotManagerRole.address);
            expect(isSlotManager).to.equal(true);

            expect(await slotManager.hasRole(await slotManager.UPGRADER_ROLE(), upgrader.address)).to.true;

            const globalSlotLimit = await slotManager.globalSlotLimit();
            expect(globalSlotLimit).to.equal(globalSlotLimit);
        });
    });

    describe('redeemSlot', async () => {
        it('should redeem slots correctly', async () => {
            /* SETUP */
            const account = addr1.address;

            /* EXECUTE */
            await slotManager.connect(slotManagerRole).redeemSlot(account);

            /* ASSERT */
            const availableSlots = await slotManager.availableSlots(account);
            const globalSlotLimit = await slotManager.globalSlotLimit();

            expect(availableSlots).to.equal(globalSlotLimit - BigInt(1));
        });

        it('rejects if slot limit is reached', async () => {
            /* SETUP */
            const account = addr1.address;
            const newGlobalSlotLimit = 0;
            await slotManager.connect(admin).editGlobalSlotLimit(newGlobalSlotLimit);

            /* EXECUTE */
            const promise = slotManager.connect(slotManagerRole).redeemSlot(account);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'SlotLimitReached'
            );
        });

        it('rejects if not slot manager role', async () => {
            /* SETUP */
            const account = addr1.address;

            /* EXECUTE */
            const promise = slotManager.connect(addr1).redeemSlot(account);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('freeSlot', async () => {
        it('should free slots correctly', async () => {
            /* SETUP */
            const account = addr1.address;

            await slotManager.connect(slotManagerRole).redeemSlot(account);

            /* EXECUTE */
            await slotManager.connect(slotManagerRole).freeSlot(account);

            /* ASSERT */
            const availableSlots = await slotManager.availableSlots(account);
            const globalSlotLimit = await slotManager.globalSlotLimit();

            expect(availableSlots).to.equal(globalSlotLimit);
        });

        it('rejects if no slots to free', async () => {
            /* SETUP */
            const account = addr1.address;

            /* EXECUTE */
            const promise = slotManager.connect(slotManagerRole).freeSlot(account);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'NoSlotsToFree'
            );
        });

        it('rejects if not slot manager role', async () => {
            /* SETUP */
            const account = addr1.address;

            /* EXECUTE */
            const promise = slotManager.connect(addr1).freeSlot(account);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('editGlobalSlotLimit', async () => {
        it('should edit global slot limit correctly', async () => {
            /* SETUP */
            const globalSlotLimitBefore = await slotManager.globalSlotLimit();
            const newGlobalSlotLimit = 20;

            /* EXECUTE */
            await slotManager.connect(admin).editGlobalSlotLimit(newGlobalSlotLimit);

            /* ASSERT */
            const globalSlotLimitAfter = await slotManager.globalSlotLimit();

            expect(globalSlotLimitAfter).not.to.equal(globalSlotLimitBefore);
            expect(globalSlotLimitAfter).to.equal(newGlobalSlotLimit);
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const newGlobalSlotLimit = 20;

            /* EXECUTE */
            const promise = slotManager.connect(addr1).editGlobalSlotLimit(newGlobalSlotLimit);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('overrideSlotLimit', async () => {
        it('should edit global slot limit correctly', async () => {
            /* SETUP */
            const account = addr1.address;
            const newSlotLimit = 2;
            const slotLimitBefore = await slotManager.slotLimits(account);

            /* EXECUTE */
            await slotManager.connect(admin).overrideSlotLimit(account, newSlotLimit);

            /* ASSERT */
            const slotLimitAfter = await slotManager.slotLimits(account);

            expect(slotLimitAfter).not.to.equal(slotLimitBefore);
            expect(slotLimitAfter).to.equal(newSlotLimit);
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const account = addr1.address;
            const newSlotLimit = 2;

            /* EXECUTE */
            const promise = slotManager.connect(addr1).overrideSlotLimit(account, newSlotLimit);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                slotManager, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });

    describe('availableSlots', async () => {
        it('should retrieve available slots for an address correctly when the limit is not reached', async () => {
            /* SETUP */
            const account = addr1.address;
            await slotManager.connect(slotManagerRole).redeemSlot(account);

            /* EXECUTE */
            const availableSlots = await slotManager.availableSlots(account);

            /* ASSERT */
            const globalSlotLimit = await slotManager.globalSlotLimit();

            expect(availableSlots).to.equal(globalSlotLimit - BigInt(1));
        });

        it('should retrieve available slots for an address correctly when the limit is reached', async () => {
            /* SETUP */
            const account = addr1.address;
            const newGlobalSlotLimit = 0;
            const newSlotLimit = 2;

            await slotManager.connect(admin).editGlobalSlotLimit(newGlobalSlotLimit);
            await slotManager.connect(admin).overrideSlotLimit(account, newSlotLimit);

            /* EXECUTE */
            const availableSlots = await slotManager.availableSlots(account);

            /* ASSERT */
            const globalSlotLimit = await slotManager.globalSlotLimit();

            expect(availableSlots).to.equal(globalSlotLimit);
            expect(availableSlots).to.equal(0);
        });
    });
});
