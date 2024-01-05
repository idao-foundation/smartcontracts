import hre, { ethers } from "hardhat";
import { AccessManager, AccessManager__factory } from "../typechain-types";

async function main() {
    let manager: AccessManager;
    const admin = '0xFc57eBe6d333980E620A923B6edb78fc7FB5cC3f';

    const Manager = (await ethers.getContractFactory('AccessManager')) as AccessManager__factory;
    manager = await Manager.deploy(admin);

    await manager.waitForDeployment();

    console.log("AccessManager deployed to:", manager.target);

    await manager.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: manager.target,
        constructorArguments: [admin],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
