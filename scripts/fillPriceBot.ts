import { log, error, increasePrepend, warning } from "./tools/logging";
import { delay } from "./tools/timing";

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { BetContract__factory } from "../typechain-types";
import { logToDiscord } from "./tools/discordLogging";

dotenv.config();

const apiKey = process.env.SEPOLIA_ALCEMY_API_KEY;
const mnemonic = process.env.MNEMONIC as string;
const accountIndex = 1;
const contractAddress = "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c";
const gasPct = 150;
const gasPricePct = 150;

async function botLoop() {
    const provider = new ethers.AlchemyProvider("sepolia", apiKey);
    const signer = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${accountIndex}`).connect(provider);
    const betContract = new ethers.Contract(contractAddress, BetContract__factory.abi, signer);

    let currentNonce = await signer.getNonce();
    await logToDiscord(`Account address: ${signer.address}`)
    await logToDiscord(`Account nonce: ${currentNonce}`);
    await logToDiscord(`Contract address: ${contractAddress}`);
    await logToDiscord(`Gas price factor: ${gasPricePct}%`);
    await logToDiscord(`Gas limit factor: ${gasPct}%`);
    await logToDiscord(`Connected to chainId: ${(await provider.getNetwork()).chainId}`);

    await logToDiscord("Started BetPlaced event listener");
    increasePrepend();
    const eventType = betContract.filters["BetPlaced(uint256,uint256,address,uint256,uint256,uint256,uint256,uint256,uint256)"];
    const listener = await betContract.on(
        eventType,
        async function (betId, poolId, bidder, bidPrice, predictionPrice, duration, bidEndTimestamp, settlementPeriod, priceAtBid) {

            await logToDiscord(`Received bet id ${betId} with duration ${duration}`);

            const delayDuration = Number(duration - 15n);
            await logToDiscord(`${betId}: Waiting for ${delayDuration} seconds`);
            await delay(delayDuration);

            await logToDiscord(`${betId}: checking for fillPrice availability`)
            while (true) {
                try {
                    await betContract.fillPrice.staticCall(betId);
                    await logToDiscord(`${betId}: fillPrice is executable`);
                    break;
                } catch {
                    continue;
                }
            }

            const estimateGas = await betContract.fillPrice.estimateGas(betId);
            const gasLimit = (estimateGas * BigInt(gasPct)) / 100n
            await logToDiscord(`${betId}: will use gasLimit ${gasLimit} (estimated ${estimateGas}, factor ${gasPct}%`)

            const feeData = await provider.getFeeData();
            const currentGasPrice = feeData.gasPrice!;
            const gasPrice = (currentGasPrice * BigInt(gasPricePct)) / 100n;
            await logToDiscord(`${betId}: will use gasPrice ${ethers.formatUnits(gasPrice, 9)} (current ${ethers.formatUnits(currentGasPrice, 9)}, factor ${gasPct}%`)

            const nonce = currentNonce;
            await logToDiscord(`${betId}: will use tx nonce ${nonce}`);
            currentNonce++;

            const tx = await betContract.fillPrice(betId, {nonce, gasPrice, gasLimit});
            await logToDiscord(`${betId}: Broadcasted tx: ${tx.hash}`);

            while (true) {
                try {
                    await tx.wait();
                    break;
                } catch (err) {
                    await logToDiscord(`${betId}: tx failed: \n\`\`\`${err}\`\`\``);
                    await delay(5);
                }
            }
            await logToDiscord(`${betId}: price filled`);
        }
    );

    let listenerCount: number;
    do {
        listenerCount = await listener.listenerCount(eventType);
        await delay(1)
    } while (listenerCount > 0)
}

async function main() {
    await delay(2);

    await logToDiscord("Price fill bot - process started")
    while (true) {
        await logToDiscord("Bot loop start");
        increasePrepend();
        try {
            await botLoop();
        } catch (err) {
            await logToDiscord(`Bot loop crashed!\n\n${err}\n\n`)
            const delaySeconds = 300;
            await logToDiscord(`Waiting ${delaySeconds} before restart`);
            await delay(delaySeconds);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
})