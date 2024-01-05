import hre, { ethers } from "hardhat";
import { AccessManager, AccessManager__factory, ChainlinkSource, ChainlinkSource__factory, MockSource, MockSource__factory } from "../typechain-types";

async function main() {
    let source: MockSource;

    const Manager = (await ethers.getContractFactory('MockSource')) as MockSource__factory;
    source = await Manager.deploy();

    await source.waitForDeployment();

    console.log("MockSource deployed to:", source.target);

    await source.setPrice(ethers.parseUnits('40000.0', 8), 8)

    await source.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: source.target,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
