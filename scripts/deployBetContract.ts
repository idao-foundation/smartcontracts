import hre, { ethers, upgrades } from "hardhat";
import { BetContract, BetContract__factory, SlotManager, SlotManager__factory } from "../typechain-types";

async function main() {
    let manager: BetContract;

    const authority = '0x24C64b7D1C3CcC47297Da957f9Ecf59cB01D7FFf';
    const slotManager = "0x08CCFF17BFd29a99646F4CBf86825CD2af6F4236";
    const sepoliaAutomate = "0x2A6C106ae13B558BB9E2Ec64Bd2f1f7BEFF3A5E0"
    
    const Manager = (await ethers.getContractFactory('BetContract')) as BetContract__factory;
    manager = await upgrades.deployProxy(Manager, [
        authority,
        slotManager,
        sepoliaAutomate,
        ethers.parseEther('0.0000001')
    ]) as unknown as BetContract;

    await manager.waitForDeployment();

    const impl = await upgrades.erc1967.getImplementationAddress(manager.target.toString());

    console.log("BetContract deployed to:", manager.target);
    console.log("Implementation deployed to:", impl);

    await manager.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: impl,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
