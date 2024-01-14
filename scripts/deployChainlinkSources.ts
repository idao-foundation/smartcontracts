import hre, { ethers } from "hardhat";
import { AccessManager, AccessManager__factory, ChainlinkSource, ChainlinkSource__factory, MockSource, MockSource__factory } from "../typechain-types";

async function main() {
    let sourceBTC: ChainlinkSource;
    let sourceETH: ChainlinkSource;
    const chainlinkOracleBTC = "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43";
    const chainlinkOracleETH = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

    const Manager = (await ethers.getContractFactory('ChainlinkSource')) as ChainlinkSource__factory;
    sourceBTC = await Manager.deploy(chainlinkOracleBTC);
    await sourceBTC.waitForDeployment();
    console.log("ChainlinkSourceBTC deployed to:", sourceBTC.target);

    sourceETH = await Manager.deploy(chainlinkOracleETH);
    await sourceETH.waitForDeployment();
    console.log("ChainlinkSourceETH deployed to:", sourceETH.target);


    let source1: MockSource;
    let source2: MockSource;
    let source3: MockSource;
    const MockSource = (await ethers.getContractFactory('MockSource')) as MockSource__factory;

    source1 = await MockSource.deploy();
    await source1.waitForDeployment();
    console.log("MockSource#1 deployed to:", source1.target);

    source2 = await MockSource.deploy();
    await source2.waitForDeployment();
    console.log("MockSource#2 deployed to:", source2.target);

    source3 = await MockSource.deploy();
    await source3.waitForDeployment();
    console.log("MockSource#3 deployed to:", source3.target);

    console.log("Setting price 1");
    let tx = await source1.setPrice(ethers.parseUnits('40000.0', 8), 8);
    await tx.wait();

    console.log("Setting price 2");
    tx = await source2.setPrice(ethers.parseUnits('2000.0', 6), 6);
    await tx.wait();

    console.log("Setting price 3");
    tx = await source3.setPrice(ethers.parseUnits('0.005', 18), 18);
    await tx.wait();

    const pools = [sourceBTC, sourceETH, source1, source2, source3];

    const betContract = await ethers.getContractAt("BetContract", "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c");
    for (let i = 0; i < pools.length; i++) {
        const source = pools[i];

        const info = await betContract.poolInfo(i);

        console.log("Setting pool", i, "to", source.target);
        tx = await betContract.editPool(
            i,
            info.active,
            info.name,
            source.target,
            info.durations.map(x => x.toString()),
            info.settlementPeriods.map(x => x.toString())
        );
        await tx.wait();
    }

    await hre.run("verify:verify", {
        address: sourceBTC.target,
        constructorArguments: [chainlinkOracleBTC],
    });
    await hre.run("verify:verify", {
        address: sourceETH.target,
        constructorArguments: [chainlinkOracleETH],
    });
    await hre.run("verify:verify", {
        address: source1.target,
        constructorArguments: [],
    });
    await hre.run("verify:verify", {
        address: source2.target,
        constructorArguments: [],
    });
    await hre.run("verify:verify", {
        address: source3.target,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
