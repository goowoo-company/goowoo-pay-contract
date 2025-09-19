const { ethers } = require("hardhat");

async function main() {
  console.log("🔧 Goowoo Pay 컨트랙트 배포 및 상호작용 예시\n");

  // 계정 가져오기
  const [owner, user1, user2, merchant] = await ethers.getSigners();
  console.log("📋 계정 정보:");
  console.log("   소유자:", owner.address);
  console.log("   사용자1:", user1.address);
  console.log("   사용자2:", user2.address);
  console.log("   상인:", merchant.address);
  console.log();

  // 1. 컨트랙트 배포
  console.log("🚀 컨트랙트 배포 중...\n");

  // GoowooToken 배포
  console.log("1️⃣ GoowooToken 배포 중...");
  const GoowooToken = await ethers.getContractFactory("GoowooToken");
  const token = await GoowooToken.deploy(owner.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ GoowooToken 배포 완료!");
  console.log("📍 컨트랙트 주소:", tokenAddress);

  // PaymentProcessor 배포
  console.log("\n2️⃣ PaymentProcessor 배포 중...");
  const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
  const processor = await PaymentProcessor.deploy(tokenAddress, owner.address);
  await processor.waitForDeployment();
  const processorAddress = await processor.getAddress();
  console.log("✅ PaymentProcessor 배포 완료!");
  console.log("📍 컨트랙트 주소:", processorAddress);

  // 초기 설정
  console.log("\n3️⃣ 초기 설정 중...");
  await token.addMinter(processorAddress);
  console.log("   ✅ PaymentProcessor를 토큰 민터로 추가 완료!");

  console.log("\n🪙 토큰 정보:");
  console.log("   이름:", await token.name());
  console.log("   심볼:", await token.symbol());
  console.log("   총 공급량:", ethers.formatEther(await token.totalSupply()));
  console.log("   소유자:", await token.owner());
  console.log();

  // 2. 사용자에게 토큰 지급
  console.log("4️⃣ 사용자에게 토큰 지급...");
  const mintAmount = ethers.parseEther("1000");
  await token.connect(owner).mint(user1.address, mintAmount);
  console.log(`   ✅ ${user1.address}에게 ${ethers.formatEther(mintAmount)} GOO 지급 완료`);
  console.log(`   💰 사용자1 잔액: ${ethers.formatEther(await token.balanceOf(user1.address))} GOO`);
  console.log();

  // 3. 상인 등록
  console.log("5️⃣ 상인 등록...");
  await processor.connect(owner).registerMerchant(merchant.address, "Test Store", 100);
  console.log(`   ✅ 상인 ${merchant.address} 등록 완료`);
  console.log(`   🏪 상인 이름: Test Store`);
  console.log(`   💸 수수료: 1%`);
  console.log();

  // 4. 결제 생성
  console.log("6️⃣ 결제 생성...");
  const paymentAmount = ethers.parseEther("100");
  const orderId = "ORDER_" + Date.now();
  
  const createPaymentTx = await processor.connect(user1).createPayment(merchant.address, paymentAmount, orderId);
  const receipt = await createPaymentTx.wait();
  
  // PaymentCreated 이벤트에서 paymentId 추출
  const event = receipt.logs.find(log => {
    try {
      const parsed = processor.interface.parseLog(log);
      return parsed.name === "PaymentCreated";
    } catch {
      return false;
    }
  });
  
  if (!event) {
    throw new Error("PaymentCreated 이벤트를 찾을 수 없습니다.");
  }
  
  const paymentId = event.args[0]; // paymentId는 첫 번째 인자
  
  console.log(`   ✅ 결제 생성 완료`);
  console.log(`   💰 결제 금액: ${ethers.formatEther(paymentAmount)} GOO`);
  console.log(`   📋 주문 ID: ${orderId}`);
  console.log(`   🔑 결제 ID: ${paymentId}`);
  console.log();

  // 5. 토큰 사용 허용
  console.log("7️⃣ 토큰 사용 허용...");
  await token.connect(user1).approve(processorAddress, paymentAmount);
  console.log(`   ✅ PaymentProcessor에 ${ethers.formatEther(paymentAmount)} GOO 사용 허용`);
  console.log();

  // 6. 결제 완료
  console.log("8️⃣ 결제 완료...");
  
  const initialUserBalance = await token.balanceOf(user1.address);
  const initialMerchantBalance = await token.balanceOf(merchant.address);
  
  await processor.connect(user1).completePayment(paymentId);
  console.log(`   ✅ 결제 완료`);
  console.log(`   💰 사용자1 잔액: ${ethers.formatEther(await token.balanceOf(user1.address))} GOO (변경: ${ethers.formatEther(initialUserBalance - await token.balanceOf(user1.address))} GOO)`);
  console.log(`   💰 상인 잔액: ${ethers.formatEther(await token.balanceOf(merchant.address))} GOO (변경: ${ethers.formatEther(await token.balanceOf(merchant.address) - initialMerchantBalance)} GOO)`);
  console.log();

  // 7. 결제 정보 조회
  console.log("9️⃣ 결제 정보 조회...");
  const payment = await processor.getPayment(paymentId);
  console.log(`   📋 결제 ID: ${paymentId}`);
  console.log(`   👤 결제자: ${payment.payer}`);
  console.log(`   🏪 상인: ${payment.payee}`);
  console.log(`   💰 금액: ${ethers.formatEther(payment.amount)} GOO`);
  console.log(`   📅 시간: ${new Date(Number(payment.timestamp) * 1000).toLocaleString()}`);
  console.log(`   ✅ 완료 여부: ${payment.completed}`);
  console.log(`   📋 주문 ID: ${payment.orderId}`);
  console.log();

  // 8. 상인 정보 조회
  console.log("🔟 상인 정보 조회...");
  const merchantInfo = await processor.getMerchant(merchant.address);
  console.log(`   🏪 상인 주소: ${merchantInfo.wallet}`);
  console.log(`   📝 상인 이름: ${merchantInfo.name}`);
  console.log(`   ✅ 활성 상태: ${merchantInfo.isActive}`);
  console.log(`   💰 총 수익: ${ethers.formatEther(merchantInfo.totalRevenue)} GOO`);
  console.log(`   💸 수수료 비율: ${merchantInfo.feePercentage} basis points`);
  console.log();

  // 9. 플랫폼 수수료 확인
  console.log("1️⃣1️⃣ 플랫폼 수수료 확인...");
  const platformFee = await processor.userBalances(owner.address);
  console.log(`   💰 플랫폼 수수료: ${ethers.formatEther(platformFee)} GOO`);
  console.log();

  console.log("🎉 모든 상호작용이 성공적으로 완료되었습니다!");
  console.log("\n📊 최종 상태:");
  console.log(`   사용자1 잔액: ${ethers.formatEther(await token.balanceOf(user1.address))} GOO`);
  console.log(`   상인 잔액: ${ethers.formatEther(await token.balanceOf(merchant.address))} GOO`);
  console.log(`   플랫폼 수수료: ${ethers.formatEther(await processor.userBalances(owner.address))} GOO`);
  console.log("\n📍 컨트랙트 주소:");
  console.log(`   GoowooToken: ${tokenAddress}`);
  console.log(`   PaymentProcessor: ${processorAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  });
