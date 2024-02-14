import { ethers } from "hardhat";

async function main() {
    const betContract = await ethers.getContractAt("BetContract", "0x47c76771fB6ea832Ddc040513b5769199F779a0d");

    const events = await betContract.queryFilter(
        betContract.filters["PriceFilled(uint256,uint256)"](undefined, undefined)
    );

    let maxGasUsed = 0n;
    let minGasUsed = BigInt(Number.MAX_SAFE_INTEGER);

    let maxGasLimit = 0n;
    let minGasLimit = BigInt(Number.MAX_SAFE_INTEGER);

    for (let i = 0; i < events.length; i++) {
        const event = events[i];

        const betId = event.args.betId;

        if (betId == 1n) {
            continue;
        }

        const transaction = await event.getTransaction();
        const transactionReceipt = await event.getTransactionReceipt();

        const limit = transaction.gasLimit;
        const gasUsed = transactionReceipt.gasUsed;

        if (limit > maxGasLimit) {
            maxGasLimit = limit;
        }
        if (limit < minGasLimit) {
            minGasLimit = limit;
        }

        if (gasUsed > maxGasUsed) {
            maxGasUsed = gasUsed;
        }
        if (gasUsed < minGasUsed) {
            minGasUsed = gasUsed;
        }

        console.log(`PriceFill: ${limit}, ${gasUsed}, ${betId}`);
    }

    console.log(`Max Gas Limit: ${maxGasLimit}`);
    console.log(`Min Gas Limit: ${minGasLimit}`);

    console.log(`Max Gas Used: ${maxGasUsed}`);
    console.log(`Min Gas Used: ${minGasUsed}`);
}


main().catch((err) => {
    console.error(err);
    process.exit(1);
});