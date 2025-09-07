require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "cancun",
      forking: process.env.MAINNET_RPC
        ? { url: process.env.MAINNET_RPC, blockNumber: process.env.MAINNET_FORK_BLOCK ? Number(process.env.MAINNET_FORK_BLOCK) : undefined }
        : undefined,
    },
  },
  mocha: { timeout: 180000 },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
