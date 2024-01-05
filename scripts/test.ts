import { ethers } from "hardhat";

type SomeStruct = {
    id: number;
    name: string;
    date: string;
}

function someFunction(param: SomeStruct) {
    console.log(param);
}


async function main() {
    ethers.provider.on({
        address: "0x9b489F7Fffa89EA450E3121603e79d9093a9396E",
        topics: ["0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"],
    }, (args) => {
        const valueRaw = args.topics[1];
        const value = ethers.toBigInt(valueRaw);
        console.log("BTC price:", ethers.formatUnits(value, 8));
    })
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
})