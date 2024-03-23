import hre, { ethers, upgrades } from "hardhat";
import { BetContract } from "../typechain-types";

async function main() {
    let betContract = await ethers.getContractAt("BetContract", "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c");
    let implAddress = await upgrades.erc1967.getImplementationAddress(betContract.target.toString());
    console.log("BetContract initial impl:", implAddress);

    const BetContract = await ethers.getContractFactory("BetContract");
    betContract = await upgrades.upgradeProxy(
        "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c",
        BetContract
    ) as unknown as BetContract;

    console.log("BetContract upgrade submitted");
    while (true) {
        const newImplAddress = await upgrades.erc1967.getImplementationAddress(betContract.target.toString());
        if (implAddress !== newImplAddress) {
            implAddress = newImplAddress;
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }


    console.log("BetContract upgraded to impl:", implAddress);

    await new Promise(resolve => setTimeout(resolve, 10000));

    await hre.run("verify:verify", {
        address: implAddress,
        constructorArguments: [],
    });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });