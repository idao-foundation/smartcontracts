import { ethers, upgrades } from "hardhat";
import { BetContract } from "../typechain-types";

async function main() {
    const oldBetContractAddress = "0xE50Dc56c80C09800f76D788608Ed015bA3a6B83D";

    const impl = await upgrades.erc1967.getImplementationAddress(oldBetContractAddress);
    console.log(`Current implementation: ${impl}`);

    const betContractFactory = await ethers.getContractFactory("BetContract");
    const oldBetContract = betContractFactory.attach(oldBetContractAddress) as BetContract;

    const authorityAddress = await oldBetContract.authority();
    const authority = await ethers.getContractAt("AccessManager", authorityAddress);

    const args = [
        authorityAddress,
        await oldBetContract.slotManager(),
        await oldBetContract.gelatoAutomate(),
        await oldBetContract.nativeFeeAmount()
    ]

    const newBetContract = await upgrades.deployProxy(
        betContractFactory,
        args,
        { initializer: "initialize" }
    ) as unknown as BetContract;

    console.log(`New BetContract deployed to: ${newBetContract.target}`);

    await newBetContract.deploymentTransaction()?.wait();

    const pools = await oldBetContract.getAllPools();
    for (const pool of pools) {
        const tx = await newBetContract.createPool(
            true,
            pool.name,
            pool.oracleAddress,
            pool.durations.map(d => Number(d)),
            pool.settlementPeriods.map(d => Number(d))
        )
        await tx.wait();

        console.log(`Pool ${pool.name} created`);
    }

    let tx = await authority.grantRole(
        1,
        newBetContract.target,
        0
    );
    await tx.wait();

    // tx = await newBetContract.bet(
    //     0,
    //     200,
    //     pools[0].durations[0],
    //     { value: await newBetContract.nativeFeeAmount() }
    // );
    // await tx.wait();

    console.log("Bet contract ready");

    const registerPointsFactory = await ethers.getContractFactory("RegisterPoints");

    const newRegisterPoints = await upgrades.deployProxy(
        registerPointsFactory,
        [authorityAddress],
        { initializer: "initialize" }
    );

    console.log(`New RegisterPoints deployed to: ${newRegisterPoints.address}`);
    console.log("RegisterPoints ready");

    console.log("BetContract:    ", newBetContract.target);
    console.log("RegisterPoints: ", newRegisterPoints.target);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});