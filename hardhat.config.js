require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // 로컬 개발 네트워크
    hardhat: {
      chainId: 1337,
    },
    // 카이아 메인넷
    mainnet: {
      url: "https://public-en.node.kaia.io",
      chainId: 8217,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 25000000000, // 25 Gwei
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.KAIASCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "mainnet",
        chainId: 8217,
        urls: {
          apiURL: "https://api.kaiascan.io/api",
          browserURL: "https://kaiascan.io",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
