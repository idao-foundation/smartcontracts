import hre, { ethers } from "hardhat";
import { AccessManager, AccessManager__factory, ChainlinkSource, ChainlinkSource__factory } from "../typechain-types";

async function main() {
    let source: ChainlinkSource;
    const chainlinkOracle = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

    const Manager = (await ethers.getContractFactory('ChainlinkSource')) as ChainlinkSource__factory;
    source = await Manager.deploy(chainlinkOracle);

    await source.waitForDeployment();

    console.log("ChainlinkSource deployed to:", source.target);

    await source.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: source.target,
        constructorArguments: [chainlinkOracle],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
