import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-toolbox";
dotenv.config();

const defaultPk = "0x0000000000000000000000000000000000000000000000000000000000000000";
const defaultRpc = "http://127.0.0.1"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
    },
  },
  networks: {
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC_URL || defaultRpc,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || defaultPk],
    },
    mumbai: {
      url: process.env.POLYGON_TESTNET_RPC_URL || defaultRpc,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || defaultPk],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY || ""
  },
};

export default config;
