import hre, { ethers, upgrades } from "hardhat";
import { BetContract } from "../typechain-types";

async function main() {
    const BetContract = await ethers.getContractFactory("BetContract");
    const betContract = await upgrades.upgradeProxy(
        "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c",
        BetContract
    ) as unknown as BetContract;

    await new Promise(resolve => setTimeout(resolve, 60000));

    const implAddress = await upgrades.erc1967.getImplementationAddress(betContract.target.toString());

    console.log("BetContract upgraded to impl:", implAddress);

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