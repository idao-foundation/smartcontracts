import { ethers } from "hardhat";

function onlyUnique(value: any, index: number, array: any[]) {
    return array.indexOf(value) === index;
}

async function main() {
    const betContract = await ethers.getContractAt("BetContract", "0x2e0C9c8cA221eb03DbCEd4F1FDfAF2b2a7792D5c");

    const events = await ethers.provider.getLogs({ address: betContract.target, fromBlock: 4962344, toBlock: "latest" });

    const bets = events.filter(
        x => (x.topics[0] === "0x1044135a3aa1117d429877ab89fedff855fed25c3872ea4b5d83e42f069fb136" ||
            x.topics[0] === "0x69d86545c929d33bd342fd834422253fa147698f4ba07e90cd40252fe11fb59f")
    );

    const addresses = bets.map(x => ethers.getAddress("0x" + x.topics[3].slice(26, 66)));
    const unique = addresses.filter(onlyUnique).map(x => { return { address: x, count: 0 } });

    for (let i = 0; i < bets.length; i++) {
        const address = ethers.getAddress("0x" + bets[i].topics[3].slice(26, 66));
        const index = unique.findIndex(x => x.address === address);
        unique[index].count++;
    }

    // Reset slot limits
    
    // const slotManager = await ethers.getContractAt("SlotManager", "0x08CCFF17BFd29a99646F4CBf86825CD2af6F4236");
    // let tx = await slotManager.editGlobalSlotLimit(5);
    // await tx.wait();
    
    // for (let i = 0; i < unique.length; i++) {
    //     tx = await slotManager.overrideSlotLimit(unique[i].address, 0);
    //     await tx.wait();
    // }

    console.log({
        total: bets.length,
        grouped: unique,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});