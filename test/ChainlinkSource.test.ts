import { ethers } from "hardhat";
import { IChainlinkDataSource, ChainlinkSource, ChainlinkSource__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";

describe("ChainLinkSource", function () {
    let oracle: IChainlinkDataSource;
    let chainlinkSource: ChainlinkSource;
    let addr1: HardhatEthersSigner;

    const oracleAddress = "0xc907E116054Ad103354f2D350FD2514433D57F6f"; // BTC/USD

    before(async () => {
        if (process.env.POLYGON_URL === undefined) {
            throw new Error("Please set POLYGON_URL in .env");
        }

        await reset(
            process.env.POLYGON_URL
        );
    });

    beforeEach(async () => {
        [addr1] = await ethers.getSigners();

        oracle = await ethers.getContractAt(
            "IChainlinkDataSource",
            oracleAddress
        );

        const ChainlinkSource = (await ethers.getContractFactory('ChainlinkSource')) as ChainlinkSource__factory;
        chainlinkSource = await ChainlinkSource.deploy(oracleAddress);
    });

    describe('Initialize', async () => {
        it('should initialize the contract correctly', async () => {
            /* ASSERT */
            expect(await chainlinkSource.oracle()).to.equal(oracleAddress);
        });
    });

    describe("getLatestPrice", async () => {
        it('should get the latest price from the Chainlink oracle', async () => {
            /* EXECUTE */
            const { value, decimals } = await chainlinkSource.getLatestPrice();

            /* ASSERT */
            const [, answer, , ,] = await oracle.latestRoundData()

            expect(value).to.equal(answer);
            expect(decimals).to.equal(await oracle.decimals());
        });
    });

    describe("eventSource", async () => {
        it('should return the Oracle contract address as the event source', async () => {
            /* EXECUTE */
            const oracleAddress = await chainlinkSource.eventSource();

            /* ASSERT */
            expect(oracleAddress).to.equal(await oracle.aggregator());
        });
    });
});
