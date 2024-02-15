import { ethers } from "hardhat";

async function main() {
    const wallet = ethers.Wallet.createRandom();

    console.log("Address:     ", wallet.address);
    console.log("Private Key: ", wallet.privateKey);
    console.log("KEEP THIS PRIVATE KEY SAFE!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});