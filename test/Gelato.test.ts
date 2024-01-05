import { ethers, upgrades } from "hardhat";
import { AccessManager, AccessManager__factory, BetContract, MockSource, MockSource__factory, SlotManager, SlotManager__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { reset, time, setBalance } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { Addressable } from "ethers";

import { expect } from "chai";

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

describe("BetContract + Gelato", function () {
    let betContract: BetContract;
    let signers: HardhatEthersSigner[];
    let manager: AccessManager;
    let slotManager: SlotManager;
    let oracle: MockSource;

    let gelatoExecutor: HardhatEthersSigner;

    const globalSlotLimit = 5;
    const nativeFeeAmount = ethers.parseUnits('1', 18);

    const SLOT_MANAGER_ROLE = 1n;

    before(async function () {
        if (process.env.SEPOLIA_URL === undefined) {
            throw new Error("Please set SEPOLIA_URL in .env");
        }

        await reset(
            process.env.SEPOLIA_URL
        );

        signers = await ethers.getSigners();
        gelatoExecutor = await ethers.getImpersonatedSigner("0x2A6C106ae13B558BB9E2Ec64Bd2f1f7BEFF3A5E0");

        await setBalance(
            gelatoExecutor.address,
            await ethers.provider.getBalance(signers[0].address)
        );
    });

    beforeEach(async function () {
        const Manager = (await ethers.getContractFactory('AccessManager')) as AccessManager__factory;
        manager = await Manager.deploy(signers[0].address);

        const SlotManager = (await ethers.getContractFactory('SlotManager')) as SlotManager__factory;
        slotManager = await upgrades.deployProxy(
            SlotManager,
            [manager.target, globalSlotLimit],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as SlotManager;

        const MockSource = (await ethers.getContractFactory('MockSource')) as MockSource__factory;
        oracle = await MockSource.deploy();

        await oracle.setPrice(ethers.parseUnits('1', 18), 18);

        const BetContractFactory = await ethers.getContractFactory("BetContract");
        betContract = await upgrades.deployProxy(BetContractFactory, [
            manager.target,
            slotManager.target,
            gelatoExecutor.address,
            nativeFeeAmount
        ]) as unknown as BetContract;

        await manager.grantRole(SLOT_MANAGER_ROLE, betContract.target, 0);

        await setFunctionRole(signers[0], manager, slotManager.target, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
        await setFunctionRole(signers[0], manager, slotManager.target, 'freeSlot(address)', SLOT_MANAGER_ROLE);

    });

    it("Should be able to place a bet and create task", async function () {
        /* SETUP */
        const active = true;
        const name = 'New Pool';
        const durations = [1n, 2n, 3n];
        const settlementPeriods = [10n, 20n, 30n];

        await betContract.createPool(active, name, oracle.target, durations, settlementPeriods);

        const poolId = await betContract.poolLength() - 1n;
        const duration = durations[0];

        const amount = await betContract.nativeFeeAmount();

        /* EXECUTE */
        const tx = await betContract.connect(signers[1]).bet(poolId, nativeFeeAmount, duration, {
            value: amount
        });

        /* ASSERT */
        const txReceipt = await tx.wait();
        const logs = txReceipt!.logs;
        const taskCreatedTopic = "0x73f079427211e7b93db86024054de0b3c4a076a36cf0f86d2c4bf0d112eb7f1d"

        const gelatoLog = logs.find((log) => log.topics[0] === taskCreatedTopic);
        expect(gelatoLog).to.not.be.undefined;

        expect(gelatoLog!.topics[1]).to.be.equal(ethers.zeroPadValue(betContract.target.toString(), 32));
        expect(gelatoLog!.topics[2]).to.be.equal(ethers.zeroPadValue(betContract.target.toString(), 32));
    });

    it("Should be able to fill price and repay gas to Gelato", async function () {
        /* SETUP */
        const active = true;
        const name = 'New Pool';
        const durations = [1n, 2n, 3n];
        const settlementPeriods = [10n, 20n, 30n];

        await betContract.createPool(active, name, oracle.target, durations, settlementPeriods);

        const poolId = await betContract.poolLength() - 1n;
        const duration = durations[0];

        const amount = await betContract.nativeFeeAmount();

        /* EXECUTE */
        await betContract.connect(signers[1]).bet(poolId, nativeFeeAmount, duration, {
            value: amount
        });
        await time.increase(duration);

        const balanceBefore = await ethers.provider.getBalance(betContract);
        await betContract.connect(gelatoExecutor).fillPrice(0);
        const balanceAfter = await ethers.provider.getBalance(betContract);

        /* ASSERT */
        expect(balanceAfter).to.be.not.equal(0);
    });

    it("Should allow to place 2 bets", async function () {
        /* SETUP */
        const active = true;
        const name = 'New Pool';
        const durations = [1n, 2n, 3n];
        const settlementPeriods = [10n, 20n, 30n];

        await betContract.createPool(active, name, oracle.target, durations, settlementPeriods);

        const poolId = await betContract.poolLength() - 1n;
        const duration = durations[0];

        const amount = await betContract.nativeFeeAmount();

        /* EXECUTE */
        await betContract.connect(signers[1]).bet(poolId, nativeFeeAmount, duration, {
            value: amount
        });
        await betContract.connect(signers[1]).bet(poolId, nativeFeeAmount, duration, {
            value: amount
        });
    });
});
