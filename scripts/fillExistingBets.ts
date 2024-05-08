import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { BetContract__factory } from "../typechain-types";
dotenv.config();

const nodeUrl = process.env.POLYGON_URL;
const mnemonic = process.env.MNEMONIC as string;
const accountIndex = 0;
const contractAddress = "0x79aF96Efc55a5162CA9427b28D2B1cFB993C7E02";
const gasPct = 125;
const gasPricePct = 125;

async function main() {
    const provider = new ethers.JsonRpcProvider(nodeUrl);
    const signer = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${accountIndex}`).connect(provider);
    const betContract = new ethers.Contract(contractAddress, BetContract__factory.abi, signer);

    let currentNonce = await signer.getNonce();
    console.log(`Account address: ${signer.address}`)
    console.log(`Account nonce: ${currentNonce}`);

    // 790 sepolia
    //
    let i = 0;
    while (true) {
        const data = await betContract.betInfo.staticCall(i);

        if (data.bidStartTimestamp == 0n) {
            break;
        }

        if (data.resultPrice != 0n) {
            console.log(i, "is filled");
            i++;
            continue;
        }

        const betId = i;

        let estimateGas: bigint = 0n;
        try {
            await betContract.fillPrice.staticCall(betId);
            estimateGas = await betContract.fillPrice.estimateGas(betId);
        } catch (err) {
            console.log(i, "filling is failing", err);
            i++;
            continue;
        }
        const gasLimit = (estimateGas * BigInt(gasPct)) / 100n
        console.log(`${betId}: will use gasLimit ${gasLimit} (estimated ${estimateGas}, factor ${gasPct}%`)

        const feeData = await provider.getFeeData();
        const currentGasPrice = feeData.gasPrice!;
        const gasPrice = (currentGasPrice * BigInt(gasPricePct)) / 100n;
        console.log(`${betId}: will use gasPrice ${ethers.formatUnits(gasPrice, 9)} (current ${ethers.formatUnits(currentGasPrice, 9)}, factor ${gasPct}%`)

        const nonce = currentNonce;
        console.log(`${betId}: will use tx nonce ${nonce}`);
        currentNonce++;

        const tx = await betContract.fillPrice(betId, {nonce, gasPrice, gasLimit});
        console.log(`${betId}: Broadcasted tx: ${tx.hash}`);

        await tx.wait();
        console.log(`${betId}: price filled`);

        i++;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
})