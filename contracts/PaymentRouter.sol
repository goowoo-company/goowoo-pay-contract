// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IStore {
    function feeBps() external view returns (uint16);
    function owner() external view returns (address);
    function recordPurchase(bytes32 purchaseId, address buyer, uint256 amount, uint256 fee, uint256 timestamp) external;
    function recordRefund(bytes32 purchaseId, uint256 amount, uint256 timestamp) external;
    function getPurchaseFields(bytes32 purchaseId) external view returns (address buyer, uint256 amount, uint256 fee, uint256 timestamp, bool refunded);
}

interface IStoreFactoryView {
    function isStore(address store) external view returns (bool);
}

/**
 * @title PaymentRouter
 * @dev Orchestrates purchases and refunds using allowances; no custody.
 */
contract PaymentRouter is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    address public platformWallet; // receives fees on purchase; refunds send back from here in A-policy
    address public factory; // registry to validate store addresses

    // idempotency flags
    mapping(bytes32 => bool) public consumedPurchases;
    mapping(bytes32 => bool) public consumedRefunds;

    event Purchased(address indexed store, address indexed buyer, address indexed seller, address token, uint256 amount, uint256 fee, bytes32 purchaseId, uint256 timestamp);
    event Refunded(address indexed store, address indexed buyer, address indexed seller, address token, uint256 amount, uint256 fee, bytes32 purchaseId, uint256 timestamp);
    event PlatformWalletUpdated(address indexed wallet);
    event FactoryUpdated(address indexed factory);
    event RouterPaused(address indexed by);
    event RouterUnpaused(address indexed by);

    error InvalidStore();
    error AlreadyConsumed();
    error NotStoreOwner();

    constructor(address usdtToken, address platformWallet_) {
        usdt = IERC20(usdtToken);
        platformWallet = platformWallet_;
    }

    function setPlatformWallet(address wallet) external {
        // simple admin: platform wallet itself manages; could be upgraded to Ownable if needed
        require(msg.sender == platformWallet, "ONLY_PLATFORM_WALLET");
        platformWallet = wallet;
        emit PlatformWalletUpdated(wallet);
    }

    function setFactory(address factoryAddress) external {
        require(msg.sender == platformWallet, "ONLY_PLATFORM_WALLET");
        factory = factoryAddress;
        emit FactoryUpdated(factoryAddress);
    }

    // Global pause: controlled by platform wallet
    function pause() external {
        require(msg.sender == platformWallet, "ONLY_PLATFORM_WALLET");
        _pause();
        emit RouterPaused(msg.sender);
    }

    function unpause() external {
        require(msg.sender == platformWallet, "ONLY_PLATFORM_WALLET");
        _unpause();
        emit RouterUnpaused(msg.sender);
    }

    function purchase(address store, uint256 amount, bytes32 purchaseId) external nonReentrant whenNotPaused {
        if (consumedPurchases[purchaseId]) revert AlreadyConsumed();
        if (store == address(0)) revert InvalidStore();
        if (factory != address(0)) {
            require(IStoreFactoryView(factory).isStore(store), "UNREGISTERED_STORE");
        }
        address seller = IStore(store).owner();
        uint16 feeBps = IStore(store).feeBps();
        uint256 fee = (amount * feeBps) / 10000;
        uint256 net = amount - fee;

        consumedPurchases[purchaseId] = true;

        // transferFrom buyer -> seller and platform
        usdt.safeTransferFrom(msg.sender, seller, net);
        if (fee > 0) {
            usdt.safeTransferFrom(msg.sender, platformWallet, fee);
        }

        IStore(store).recordPurchase(purchaseId, msg.sender, amount, fee, block.timestamp);
        emit Purchased(store, msg.sender, seller, address(usdt), amount, fee, purchaseId, block.timestamp);
    }

    // Full-refund-only: Router pulls funds from seller and platform back to buyer
    function refund(address store, bytes32 purchaseId) external nonReentrant whenNotPaused {
        if (consumedRefunds[purchaseId]) revert AlreadyConsumed();
        if (store == address(0)) revert InvalidStore();
        if (factory != address(0)) {
            require(IStoreFactoryView(factory).isStore(store), "UNREGISTERED_STORE");
        }
        address seller = IStore(store).owner();
        if (msg.sender != seller) revert NotStoreOwner();

        (address buyer, uint256 amount, uint256 fee,, bool refunded) = IStore(store).getPurchaseFields(purchaseId);
        require(buyer != address(0), "NOT_FOUND");
        require(!refunded, "ALREADY_REFUNDED");

        consumedRefunds[purchaseId] = true;

        uint256 net = amount - fee;
        if (net > 0) {
            usdt.safeTransferFrom(seller, buyer, net);
        }
        if (fee > 0) {
            usdt.safeTransferFrom(platformWallet, buyer, fee);
        }

        IStore(store).recordRefund(purchaseId, amount, block.timestamp);
        emit Refunded(store, buyer, seller, address(usdt), amount, fee, purchaseId, block.timestamp);
    }
}


