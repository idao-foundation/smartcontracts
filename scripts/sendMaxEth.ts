import { ethers } from "hardhat";
import { TransactionRequest } from "ethers";

async function main() {
    let tx: TransactionRequest = {};
    const recepient = "";

    const [sender] = await ethers.getSigners();

    const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
    const gasLimit = await ethers.provider.estimateGas(tx);
    const fee = gasPrice! * gasLimit;
    const balance = await ethers.provider.getBalance(sender);
    const maxEth = balance - fee;

    tx.to = recepient;
    tx.gasLimit = gasLimit;
    tx.value = maxEth;
    tx.gasPrice = gasPrice;

    const txReceipt = await sender.sendTransaction(tx);
    await txReceipt.wait();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});