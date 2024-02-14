import hre, { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { AccessManager, BetContract, ChainlinkSource__factory } from "../typechain-types";
import { Addressable } from "ethers";


async function setFunctionRole(
    admin: HardhatEthersSigner,
    manager: AccessManager,
    target: string | Addressable,
    funcSig: string,
    role: bigint
) {
    const functionSelector = ethers.dataSlice(ethers.id(funcSig), 0, 4);

    const tx = await manager.connect(admin).setTargetFunctionRole(
        target,
        [functionSelector],
        role
    );
    await tx.wait();
    console.log(`${funcSig} on ${target} assigned to role ${role}`);
}

async function main() {
    const initialSlotLimit = 5;
    const SLOT_MANAGER_ROLE = 1n;
    const automateAddress = "0x2A6C106ae13B558BB9E2Ec64Bd2f1f7BEFF3A5E0";
    const initialBetFee = ethers.parseEther('0.05');
    // polygon:  0xc907E116054Ad103354f2D350FD2514433D57F6f
    // bsc:      0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf
    // optimism: 0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593
    // arbitrum: 0x6ce185860a4963106506C203335A2910413708e9
    const chainlinkOracleBTC = "0xc907E116054Ad103354f2D350FD2514433D57F6f";
    // polygon: 0xF9680D99D6C9589e2a93a78A04A279e509205945
    const chainlinkOracleETH = "0xF9680D99D6C9589e2a93a78A04A279e509205945";

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Manager
    const Manager = await ethers.getContractFactory("AccessManager");
    const authority = await Manager.deploy(deployer.address);

    await authority.deploymentTransaction()?.wait();
    console.log("Manager deployed to:", authority.target.toString());

    let tx = await authority.labelRole(SLOT_MANAGER_ROLE, "SLOT_MANAGER_ROLE");
    await tx.wait();
    console.log("SLOT_MANAGER_ROLE label set");

    // 2. SlotManager
    const SlotManager = await ethers.getContractFactory("SlotManager");
    const slotManager = await upgrades.deployProxy(SlotManager, [
        authority.target,
        initialSlotLimit
    ], { initializer: 'initialize' });

    await slotManager.deploymentTransaction()?.wait();
    console.log("SlotManager proxy deployed to:", slotManager.target);

    // 3. BetContract
    const BetContract = await ethers.getContractFactory("BetContract");
    const betContract = await upgrades.deployProxy(BetContract, [
        authority.target,
        slotManager.target,
        automateAddress,
        initialBetFee
    ], { initializer: 'initialize' }) as unknown as BetContract;
    await betContract.deploymentTransaction()?.wait();
    console.log("BetContract proxy deployed to:", betContract.target);

    tx = await authority.grantRole(SLOT_MANAGER_ROLE, betContract.target, 0);
    await tx.wait();
    console.log("SLOT_MANAGER_ROLE granted to BetContract");

    await setFunctionRole(deployer, authority, slotManager.target, 'redeemSlot(address)', SLOT_MANAGER_ROLE);
    await setFunctionRole(deployer, authority, slotManager.target, 'freeSlot(address)', SLOT_MANAGER_ROLE);

    // 4. Data sources
    const ChainlinkSourceFactory = (await ethers.getContractFactory('ChainlinkSource')) as ChainlinkSource__factory;
    const sourceBTC = await ChainlinkSourceFactory.deploy(chainlinkOracleBTC);
    await sourceBTC.waitForDeployment();
    console.log("ChainlinkSourceBTC deployed to:", sourceBTC.target);

    const sourceETH = await ChainlinkSourceFactory.deploy(chainlinkOracleETH);
    await sourceETH.waitForDeployment();
    console.log("ChainlinkSourceETH deployed to:", sourceETH.target);

    // 5. Set sources
    const pools = [
        {
            src: sourceBTC,
            name: "BTC/USD",
        },
        {
            src: sourceETH,
            name: "ETH/USD"
        }
    ];
    for (let i = 0; i < pools.length; i++) {
        const source = pools[i];

        tx = await betContract.createPool(
            true,
            source.name,
            source.src.target,
            [60, 1800, 3600],
            [300, 9000, 18000]
        );
        await tx.wait();
        console.log("Pool", source.name, "created");
    }

    // Verify contracts
    if (hre.network.name !== "hardhat") {
        const waitBlocks = 20;
        console.log(`Waiting ${waitBlocks} blocks before verification`);
        await tx.wait(waitBlocks);
        console.log("Verifying contracts");

        await hre.run("verify:verify",
            {
                address: authority.target,
                constructorArguments: [deployer.address],
            }
        );

        await hre.run("verify:verify",
            {
                address: await upgrades.erc1967.getImplementationAddress(slotManager.target.toString()),
                constructorArguments: [],
            }
        );

        await hre.run("verify:verify",
            {
                address: await upgrades.erc1967.getImplementationAddress(betContract.target.toString()),
                constructorArguments: [],
            }
        );

        await hre.run("verify:verify",
            {
                address: sourceBTC.target,
                constructorArguments: [chainlinkOracleBTC],
            }
        );

        await hre.run("verify:verify",
            {
                address: sourceETH.target,
                constructorArguments: [chainlinkOracleETH],
            }
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});