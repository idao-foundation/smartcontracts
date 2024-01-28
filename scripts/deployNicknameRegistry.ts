import hre, { ethers, upgrades } from "hardhat";
import { NicknameRegistry, NicknameRegistry__factory } from "../typechain-types";

async function main() {
    let nicknameRegistry: NicknameRegistry;

    const authority = '0x24C64b7D1C3CcC47297Da957f9Ecf59cB01D7FFf';
    const fundingWallet = '0x...';
    const nicknameFee = 1;

    const NicknameRegistry = (await ethers.getContractFactory('NicknameRegistry')) as NicknameRegistry__factory;
    nicknameRegistry = await upgrades.deployProxy(NicknameRegistry, [
        authority,
        fundingWallet, 
        nicknameFee
    ]) as unknown as NicknameRegistry;

    await nicknameRegistry.waitForDeployment();

    const impl = await upgrades.erc1967.getImplementationAddress(nicknameRegistry.target.toString());

    console.log("NicknameRegistry deployed to:", nicknameRegistry.target);
    console.log("Implementation deployed to:", impl);

    await nicknameRegistry.deploymentTransaction()?.wait(5)

    await hre.run("verify:verify", {
        address: impl,
        constructorArguments: [],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
