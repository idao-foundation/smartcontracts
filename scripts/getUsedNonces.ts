import { ethers } from "hardhat";

async function main() {
    const contract = await ethers.getContractAt("RegisterPoints", "0xaEE3f53f1F4B243F156631a3BA359Da5fc5E4095");

    const claimEvents = await contract.queryFilter(
        contract.filters.PointsAdded(undefined, undefined)
    );

    const nonces = claimEvents.map(async (e) => {
        const tx = await e.getTransaction();
        const data = tx.data;

        const args = contract.interface.decodeFunctionData("claimPoints", data);
        return args[2];
    });

    console.log(await Promise.all(nonces));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});