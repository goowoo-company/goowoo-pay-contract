const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting Goowoo Pay contract deployment...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📋 Deployer address:", deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "KLAY\n");

  // Environment configuration
  const USDT_ADDRESS = process.env.USDT_ADDRESS;
  const PLATFORM_WALLET = process.env.PLATFORM_WALLET ;
  const DEFAULT_FEE_BPS = parseInt(process.env.DEFAULT_FEE_BPS || "100", 10); // 1%
  const SELLER_ADDRESS = process.env.SELLER_ADDRESS;

  // 1. Deploy PlatformAuthority
  console.log("1️⃣ Deploying PlatformAuthority...");
  const PlatformAuthority = await ethers.getContractFactory("PlatformAuthority");
  const authority = await PlatformAuthority.deploy(deployer.address);
  await authority.waitForDeployment();
  const authorityAddress = await authority.getAddress();
  console.log("✅ PlatformAuthority deployed successfully!", authorityAddress);

  // 2. Deploy PaymentRouter
  console.log("2️⃣ Deploying PaymentRouter...");
  const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
  const router = await PaymentRouter.deploy(USDT_ADDRESS, PLATFORM_WALLET);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("✅ PaymentRouter deployed successfully!", routerAddress);

  // 3. Deploy StoreFactory
  console.log("3️⃣ Deploying StoreFactory...");
  const StoreFactory = await ethers.getContractFactory("StoreFactory");
  const factory = await StoreFactory.deploy(deployer.address, authorityAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ StoreFactory deployed successfully!", factoryAddress);

  // 4. Initial setup: Grant platform operator permissions and connect factory-router
  console.log("4️⃣ Initial setup...");
  const addOpTx = await authority.addOperator(deployer.address);
  await addOpTx.wait();
  if (deployer.address.toLowerCase() !== PLATFORM_WALLET.toLowerCase()) {
    const addPlatOpTx = await authority.addOperator(PLATFORM_WALLET);
    await addPlatOpTx.wait();
  }
  const setRouterTx = await factory.setRouter(routerAddress);
  await setRouterTx.wait();
  if (deployer.address.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
    const setFactoryTx = await router.setFactory(factoryAddress);
    await setFactoryTx.wait();
    console.log("   ▶ Operator addition and router setup completed (including factory connection)");
  } else {
    console.log("   ▶ Operator addition and router setup completed (Note: router.setFactory must be called from platform wallet)");
    console.log(`     👉 Execute the following from platform wallet: router.setFactory(${factoryAddress})`);
  }

  // 5. Create sample store (specified seller, initial fee DEFAULT_FEE_BPS)
  console.log("5️⃣ Creating seller store...");
  const createStoreTx = await factory.createStore(SELLER_ADDRESS, DEFAULT_FEE_BPS);
  const createReceipt = await createStoreTx.wait();
  let newStoreAddress = null;
  for (const log of createReceipt.logs || []) {
    try {
      const parsed = factory.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === 'StoreCreated') {
        newStoreAddress = parsed.args.store;
        break;
      }
    } catch (e) {}
  }
  if (!newStoreAddress) {
    const stores = await factory.getStoresBySeller(SELLER_ADDRESS);
    newStoreAddress = stores[stores.length - 1];
  }
  console.log("   ✅ Store creation completed:", newStoreAddress);

  // (Note) No additional initial setup required

  // 4. Output deployment information
  console.log("🎉 Deployment completed!");
  console.log("\n📊 Deployment Information:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🌐 Network:", network.name);
  console.log("🔗 RPC URL:", network.config.url || "Hardhat Network");
  console.log("📋 Deployer:", deployer.address);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏛️ PlatformAuthority:");
  console.log("   Address:", authorityAddress);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔀 PaymentRouter:");
  console.log("   Address:", routerAddress);
  console.log("   Token:", USDT_ADDRESS);
  console.log("   Platform Wallet:", PLATFORM_WALLET);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏭 StoreFactory:");
  console.log("   Address:", factoryAddress);
  console.log("   Router:", await factory.router());
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🛍️ Store:");
  console.log("   Owner (Seller):", SELLER_ADDRESS);
  console.log("   Address:", newStoreAddress);
  console.log("   Initial Fee (bps):", DEFAULT_FEE_BPS);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 5. Contract verification information
  if (network.name !== "hardhat") {
    console.log("\n🔍 Contract verification information:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("PlatformAuthority verification:");
    console.log(`npx hardhat verify --network ${network.name} ${authorityAddress} "${deployer.address}"`);
    console.log("\nPaymentRouter verification:");
    console.log(`npx hardhat verify --network ${network.name} ${routerAddress} "${USDT_ADDRESS}" "${PLATFORM_WALLET}"`);
    console.log("\nStoreFactory verification:");
    console.log(`npx hardhat verify --network ${network.name} ${factoryAddress} "${deployer.address}" "${authorityAddress}"`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  // 6. Verification/Link guidance
  if (network.name !== "hardhat") {
    console.log("\n🔗 Kaiascan links:");
    console.log(`   Authority: https://kaiascan.io/address/${authorityAddress}`);
    console.log(`   Router:    https://kaiascan.io/address/${routerAddress}`);
    console.log(`   Factory:   https://kaiascan.io/address/${factoryAddress}`);
  }

  return {
    authority: authorityAddress,
    router: routerAddress,
    factory: factoryAddress,
    deployer: deployer.address
  };
}

// Error handling
main()
  .then((result) => {
    console.log("\n✅ Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ An error occurred during deployment:");
    console.error(error);
    process.exit(1);
  });
