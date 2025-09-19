// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Store.sol";

/**
 * @title StoreFactory
 * @dev Deploys Store contracts and maintains registries
 */
contract StoreFactory is Ownable {
    address public immutable platformAuthority;
    address public router; // optional pre-set for new stores

    mapping(address => address[]) private _sellerStores;
    mapping(address => address) public storeToSeller;
    mapping(address => bool) public isStore;

    event StoreCreated(address indexed seller, address indexed store, uint16 feeBps);
    event RouterUpdated(address indexed newRouter);

    error NotSellerOwner();

    constructor(address initialOwner, address authority) Ownable(initialOwner) {
        platformAuthority = authority;
    }

    function setRouter(address newRouter) external onlyOwner {
        router = newRouter;
        emit RouterUpdated(newRouter);
    }

    function createStore(address sellerOwner, uint16 initialFeeBps) external returns (address store) {
        // anyone can request, but ownership is explicit
        Store newStore = new Store(sellerOwner, platformAuthority, initialFeeBps, router);
        store = address(newStore);
        _sellerStores[sellerOwner].push(store);
        storeToSeller[store] = sellerOwner;
        isStore[store] = true;
        emit StoreCreated(sellerOwner, store, initialFeeBps);
    }

    function getStoresBySeller(address sellerOwner) external view returns (address[] memory) {
        return _sellerStores[sellerOwner];
    }
}


