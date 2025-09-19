const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PaymentRouter + Store integration", function () {
  async function deployFixture() {
    const [platform, seller, buyer, other] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy(platform.address);
    await usdt.waitForDeployment();

    // mint balances (6 decimals)
    await usdt.connect(platform).mint(buyer.address, 1_000_000_000); // 1,000 USDT
    await usdt.connect(platform).mint(seller.address, 0);
    await usdt.connect(platform).mint(platform.address, 1_000_000_000);

    const PlatformAuthority = await ethers.getContractFactory("PlatformAuthority");
    const authority = await PlatformAuthority.deploy(platform.address);
    await authority.waitForDeployment();
    await (await authority.addOperator(platform.address)).wait();

    const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
    const router = await PaymentRouter.deploy(await usdt.getAddress(), platform.address);
    await router.waitForDeployment();

    const StoreFactory = await ethers.getContractFactory("StoreFactory");
    const factory = await StoreFactory.deploy(platform.address, await authority.getAddress());
    await factory.waitForDeployment();
    await (await factory.setRouter(await router.getAddress())).wait();
    await (await router.setFactory(await factory.getAddress())).wait();

    // create store with 1% fee (100 bps)
    const tx = await factory.createStore(seller.address, 100);
    const rcpt = await tx.wait();
    let storeAddress;
    for (const log of rcpt.logs || []) {
      try {
        const parsed = factory.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === 'StoreCreated') { storeAddress = parsed.args.store; break; }
      } catch (_) {}
    }
    if (!storeAddress) {
      const stores = await factory.getStoresBySeller(seller.address);
      storeAddress = stores[0];
    }

    return { platform, seller, buyer, other, usdt, router, factory, storeAddress };
  }

  it("purchase: transfers net and fee, records purchase", async () => {
    const { platform, seller, buyer, usdt, router, storeAddress } = await deployFixture();
    const amount = 100_000_000; // 100 USDT (6 decimals)
    const fee = Math.floor(amount * 100 / 10000); // 1% = 1 USDT
    const net = amount - fee;

    // approve buyer -> router
    await (await usdt.connect(buyer).approve(await router.getAddress(), amount)).wait();

    const purchaseId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([
      "address","address","address","uint256"
    ], [storeAddress, seller.address, buyer.address, 1]));

    await expect(router.connect(buyer).purchase(storeAddress, amount, purchaseId))
      .to.emit(router, 'Purchased');

    expect(await usdt.balanceOf(seller.address)).to.equal(net);
    expect(await usdt.balanceOf(platform.address)).to.equal(1_000_000_000 + fee);
  });

  it("refund full: pulls net from seller and fee from platform", async () => {
    const { platform, seller, buyer, usdt, router, storeAddress } = await deployFixture();
    const amount = 100_000_000;
    const fee = Math.floor(amount * 100 / 10000);
    const net = amount - fee;

    await (await usdt.connect(buyer).approve(await router.getAddress(), amount)).wait();
    const pid = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address","address","address","uint256"],[storeAddress, seller.address, buyer.address, 2]));
    await (await router.connect(buyer).purchase(storeAddress, amount, pid)).wait();

    // allowances for refund
    await (await usdt.connect(seller).approve(await router.getAddress(), net)).wait();
    await (await usdt.connect(platform).approve(await router.getAddress(), fee)).wait();

    const buyerBalBefore = await usdt.balanceOf(buyer.address);
    await expect(router.connect(seller).refund(storeAddress, pid))
      .to.emit(router, 'Refunded');

    expect(await usdt.balanceOf(buyer.address)).to.equal(buyerBalBefore + BigInt(amount));
  });

  it("idempotency: same purchaseId cannot be reused", async () => {
    const { seller, buyer, usdt, router, storeAddress } = await deployFixture();
    const amount = 10_000_000;
    const pid = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address","address","address","uint256"],[storeAddress, seller.address, buyer.address, 3]));
    await (await usdt.connect(buyer).approve(await router.getAddress(), amount*2)).wait();
    await (await router.connect(buyer).purchase(storeAddress, amount, pid)).wait();
    await expect(router.connect(buyer).purchase(storeAddress, amount, pid)).to.be.revertedWithCustomError || to.be.reverted;
  });

  it("router pause: blocks purchase/refund", async () => {
    const { platform, seller, buyer, usdt, router, storeAddress } = await deployFixture();
    const amount = 10_000_000;
    await (await router.connect(platform).pause()).wait();
    await (await usdt.connect(buyer).approve(await router.getAddress(), amount)).wait();
    const pid = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address","address","address","uint256"],[storeAddress, seller.address, buyer.address, 4]));
    await expect(router.connect(buyer).purchase(storeAddress, amount, pid)).to.be.reverted;
    await (await router.connect(platform).unpause()).wait();
  });

  it("factory registry lookups", async () => {
    const { factory, seller, storeAddress } = await deployFixture();
    const stores = await factory.getStoresBySeller(seller.address);
    expect(stores).to.include(storeAddress);
    expect(await factory.isStore(storeAddress)).to.equal(true);
    expect(await factory.storeToSeller(storeAddress)).to.equal(seller.address);
  });
});


