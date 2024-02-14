import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-toolbox";
dotenv.config();

const defaultMnemonic = "test test test test test test test test test test test junk";
const defaultRpc = "http://127.0.0.1"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.23",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
    },
  },
  networks: {
    hardhat:{
      forking: {
        enabled: false,
        url: process.env.POLYGON_URL || defaultRpc,
      }
    },
    polygon: {
      url: process.env.POLYGON_URL || defaultRpc,
      accounts: { mnemonic: process.env.MNEMONIC || defaultMnemonic },
    },
    mumbai: {
      url: process.env.MUMBAI_URL || defaultRpc,
      accounts: { mnemonic: process.env.MNEMONIC || defaultMnemonic },
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || defaultRpc,
      accounts: { mnemonic: process.env.MNEMONIC || defaultMnemonic },
    },
    bsc: {
      url: process.env.BSC_URL || defaultRpc,
      accounts: { mnemonic: process.env.MNEMONIC || defaultMnemonic },
    },
    arbitrum: {
      url: process.env.ARBITRUM_URL || defaultRpc,
      accounts: { mnemonic: process.env.MNEMONIC || defaultMnemonic },
    },
    optimism: {
      url: process.env.OPTIMISM_URL || defaultRpc,
      accounts: { mnemonic: process.env.MNEMONIC || defaultMnemonic },
    },
    node: {
      url: "http://127.0.0.1:8545/"
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      mumbai: process.env.POLYGONSCAN_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || "",
      arbitrumOne: process.env.ARBITRUMSCAN_API_KEY || "",
      optimisticEthereum: process.env.OPTIMISMSCAN_API_KEY || "",
    }
  },
};

export default config;
