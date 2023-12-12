import hre, { ethers } from "hardhat";
import { Manager__factory } from "../typechain-types/factories/contracts/Manager__factory";
import { Manager } from "../typechain-types/contracts/Manager";

async function main() {
    let manager: Manager;
    const admin = process.env.ADMIN_WALLET as string;

    const Manager = (await ethers.getContractFactory('Manager')) as Manager__factory;
    manager = await Manager.deploy(admin);

    await manager.waitForDeployment();

    console.log("Manager deployed to:", manager.target);

    await hre.run("verify:verify", {
        address: manager.target,
        constructorArguments: [admin],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
