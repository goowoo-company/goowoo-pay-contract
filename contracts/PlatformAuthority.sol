// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PlatformAuthority
 * @dev Manages platform operators which are allowed to manage platform-level roles on stores
 */
contract PlatformAuthority is Ownable {
    mapping(address => bool) private _operators;

    event OperatorAdded(address indexed account);
    event OperatorRemoved(address indexed account);

    error NotOperator();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function addOperator(address account) external onlyOwner {
        _operators[account] = true;
        emit OperatorAdded(account);
    }

    function removeOperator(address account) external onlyOwner {
        _operators[account] = false;
        emit OperatorRemoved(account);
    }

    function isOperator(address account) external view returns (bool) {
        return _operators[account];
    }

    modifier onlyOperator() {
        if (!_operators[msg.sender]) {
            revert NotOperator();
        }
        _;
    }
}


