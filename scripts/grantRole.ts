import hre, { ethers } from "hardhat";
import { AccessManager, AccessManager__factory, ChainlinkSource, ChainlinkSource__factory, MockSource, MockSource__factory } from "../typechain-types";
import { ZeroAddress, Addressable } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

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

async function main() {
    const SLOT_MANAGER_ROLE = 1n;
    const betContract = "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c";
    const slotManager = "0x08CCFF17BFd29a99646F4CBf86825CD2af6F4236";

    const manager = await ethers.getContractAt('AccessManager', '0x24C64b7D1C3CcC47297Da957f9Ecf59cB01D7FFf') as AccessManager;
    const admin = (await ethers.getSigners())[0];

    await manager.connect(admin).grantRole(SLOT_MANAGER_ROLE, betContract, 0);

    await setFunctionRole(admin, manager, slotManager, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
    await setFunctionRole(admin, manager, slotManager, 'freeSlot(address)', SLOT_MANAGER_ROLE);

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
