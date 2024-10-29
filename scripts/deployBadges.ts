import hre, { ethers, upgrades } from "hardhat";
import {
    BadgeContract,
    BadgeContract__factory
} from "../typechain-types";

async function main() {
    let badgeContract: BadgeContract;

    const authority = '0x24C64b7D1C3CcC47297Da957f9Ecf59cB01D7FFf';
    const betContract = '0x5E945200e9eFF3d4414a4466B5008643dceC7073'

    const BadgeContract = (await ethers.getContractFactory('BadgeContract')) as BadgeContract__factory;
    badgeContract = await upgrades.deployProxy(BadgeContract, [
        authority,
        betContract
    ]) as unknown as BadgeContract;

    await badgeContract.waitForDeployment();

    const impl = await upgrades.erc1967.getImplementationAddress(badgeContract.target.toString());

    console.log("BadgeContract deployed to:", badgeContract.target);
    console.log("Implementation deployed to:", impl);

    await badgeContract.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: impl,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
