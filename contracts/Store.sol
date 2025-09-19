// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IPlatformAuthority {
    function isOperator(address account) external view returns (bool);
}

/**
 * @title Store
 * @dev Store contract owned by the seller; platform operators can update fee and router
 */
contract Store is Ownable, Pausable {
    struct PurchaseRecord {
        address buyer;
        uint256 amount;
        uint256 fee;
        uint256 timestamp;
        bool refunded;
    }

    address public immutable platformAuthority;
    address public router; // set by platform operator
    uint16 private _feeBps; // fee in basis points; controlled by platform operators

    mapping(bytes32 => PurchaseRecord) private _purchases;

    event RouterUpdated(address indexed newRouter);
    event FeeBpsUpdated(uint16 newFeeBps);
    event PurchaseRecorded(bytes32 indexed purchaseId, address indexed buyer, uint256 amount, uint256 fee, uint256 timestamp);
    event RefundRecorded(bytes32 indexed purchaseId, uint256 amount, uint256 timestamp);

    error OnlyRouter();
    error AlreadyRecorded();
    error NotRecorded();
    error AlreadyRefunded();
    error NotPlatformOperator();

    constructor(address sellerOwner, address authority, uint16 initialFeeBps, address initialRouter) Ownable(sellerOwner) {
        platformAuthority = authority;
        _feeBps = initialFeeBps;
        router = initialRouter;
    }

    modifier onlyRouter() {
        if (msg.sender != router) {
            revert OnlyRouter();
        }
        _;
    }

    modifier onlyPlatform() {
        if (!IPlatformAuthority(platformAuthority).isOperator(msg.sender)) {
            revert NotPlatformOperator();
        }
        _;
    }

    function feeBps() external view returns (uint16) {
        return _feeBps;
    }

    function setRouter(address newRouter) external onlyPlatform {
        router = newRouter;
        emit RouterUpdated(newRouter);
    }

    function setFeeBps(uint16 newFeeBps) external onlyPlatform {
        _feeBps = newFeeBps;
        emit FeeBpsUpdated(newFeeBps);
    }

    function recordPurchase(
        bytes32 purchaseId,
        address buyer,
        uint256 amount,
        uint256 fee,
        uint256 timestamp
    ) external onlyRouter whenNotPaused {
        if (_purchases[purchaseId].buyer != address(0)) {
            revert AlreadyRecorded();
        }
        _purchases[purchaseId] = PurchaseRecord({
            buyer: buyer,
            amount: amount,
            fee: fee,
            timestamp: timestamp,
            refunded: false
        });
        emit PurchaseRecorded(purchaseId, buyer, amount, fee, timestamp);
    }

    function recordRefund(bytes32 purchaseId, uint256 amount, uint256 timestamp) external onlyRouter {
        PurchaseRecord storage rec = _purchases[purchaseId];
        if (rec.buyer == address(0)) revert NotRecorded();
        if (rec.refunded) revert AlreadyRefunded();
        // MVP: full refund only
        require(amount == rec.amount, "FULL_REFUND_ONLY");
        rec.refunded = true;
        emit RefundRecorded(purchaseId, amount, timestamp);
    }

    function getPurchase(bytes32 purchaseId) external view returns (PurchaseRecord memory) {
        return _purchases[purchaseId];
    }

    function getPurchaseFields(bytes32 purchaseId)
        external
        view
        returns (
            address buyer,
            uint256 amount,
            uint256 fee,
            uint256 timestamp,
            bool refunded
        )
    {
        PurchaseRecord storage rec = _purchases[purchaseId];
        return (rec.buyer, rec.amount, rec.fee, rec.timestamp, rec.refunded);
    }

    // Allow both seller(owner) and platform to pause/unpause
    function pause() external {
        if (msg.sender != owner() && !IPlatformAuthority(platformAuthority).isOperator(msg.sender)) {
            revert NotPlatformOperator();
        }
        _pause();
    }

    function unpause() external {
        if (msg.sender != owner() && !IPlatformAuthority(platformAuthority).isOperator(msg.sender)) {
            revert NotPlatformOperator();
        }
        _unpause();
    }
}


