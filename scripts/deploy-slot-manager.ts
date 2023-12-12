import hre, { ethers, upgrades } from "hardhat";
import { SlotManager__factory } from "../typechain-types/factories/contracts/SlotManager__factory";

async function setFunctionRole(
    admin: any,
    slotManager: any,
    target: string,
    funcSig: string,
    role: bigint
) {
    const functionSelector = ethers.dataSlice(ethers.id(funcSig), 0, 4);

    await slotManager.connect(admin).setTargetFunctionRole(
        target,
        [functionSelector],
        role
    );
}

async function main() {
    let slotManager: any;
    const DEFAULT_ADMIN_PRIVATE_KEY = process.env.DEFAULT_ADMIN_PRIVATE_KEY;
    const PROVIDER = process.env.PROVIDER as string;
    const web3Provider = new ethers.JsonRpcProvider(PROVIDER);
    const admin = new ethers.Wallet(DEFAULT_ADMIN_PRIVATE_KEY as string, web3Provider);
    const upgrader = process.env.UPGRADER_WALLET as string;
    const slotManagerRole = process.env.SLOT_MANAGER_WALLET as string;
    const globalSlotLimit = 5;
    const DEFAULT_ADMIN_ROLE = 0n;
    const SLOT_MANAGER_ROLE = 1n;

    const SlotManager = (await ethers.getContractFactory('SlotManager')) as SlotManager__factory;
    slotManager = await upgrades.deployProxy(
        SlotManager,
        [upgrader, slotManager.target, globalSlotLimit],
        { initializer: 'initialize', kind: 'uups' }
    );

    await slotManager.connect(admin).grantRole(SLOT_MANAGER_ROLE, slotManagerRole, 0);

    await setFunctionRole(admin, slotManager, slotManager.target, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
    await setFunctionRole(admin, slotManager, slotManager.target, 'freeSlot(address)', SLOT_MANAGER_ROLE);
    await setFunctionRole(admin, slotManager, slotManager.target, 'editGlobalSlotLimit(uint256)', DEFAULT_ADMIN_ROLE);
    await setFunctionRole(admin, slotManager, slotManager.target, 'overrideSlotLimit(address,uint256)', DEFAULT_ADMIN_ROLE);

    await slotManager.waitForDeployment();

    console.log("slotManager deployed to:", slotManager.target);

    await hre.run("verify:verify", {
        address: slotManager.target,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
