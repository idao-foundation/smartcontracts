import hre, { ethers, upgrades } from "hardhat";
import { SlotManager, SlotManager__factory } from "../typechain-types";

async function main() {
    let manager: SlotManager;
    const authority = '0x24C64b7D1C3CcC47297Da957f9Ecf59cB01D7FFf';

    const Manager = (await ethers.getContractFactory('SlotManager')) as SlotManager__factory;
    manager = await upgrades.deployProxy(Manager, [authority, 10]) as unknown as SlotManager;

    await manager.waitForDeployment();

    const impl = await upgrades.erc1967.getImplementationAddress(manager.target.toString());

    console.log("AccessManager deployed to:", manager.target);
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
