import hre, { ethers, upgrades } from "hardhat";
import {
    RegisterPoints,
    RegisterPoints__factory
} from "../typechain-types";

async function main() {
    let registerPoints: RegisterPoints;

    const authority = '0x24C64b7D1C3CcC47297Da957f9Ecf59cB01D7FFf';

    const RegisterPoints = (await ethers.getContractFactory('RegisterPoints')) as RegisterPoints__factory;
    registerPoints = await upgrades.deployProxy(RegisterPoints, [
        authority
    ]) as unknown as RegisterPoints;

    await registerPoints.waitForDeployment();

    const impl = await upgrades.erc1967.getImplementationAddress(registerPoints.target.toString());

    console.log("RegisterPoints deployed to:", registerPoints.target);
    console.log("Implementation deployed to:", impl);

    await registerPoints.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: impl,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
