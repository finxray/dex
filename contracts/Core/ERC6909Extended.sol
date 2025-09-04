// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ERC6909Extended
/// @notice Extended ERC6909 implementation for multi-token support
/// @dev This is a minimal implementation for testing purposes
contract ERC6909Extended {
    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    
    // Pool inventories mapping for testing
    mapping(uint256 => uint256) public poolInventories;
    
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed id,
        uint256 amount
    );
    
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );
    
    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }
    
    error ERC6909__InsufficientBalance();
    error ERC6909__NotApproved();

    function transfer(
        address to,
        uint256 id,
        uint256 amount
    ) external returns (bool) {
        if (balanceOf[id][msg.sender] < amount) revert ERC6909__InsufficientBalance();
        balanceOf[id][msg.sender] -= amount;
        balanceOf[id][to] += amount;
        emit Transfer(msg.sender, to, id, amount);
        return true;
    }
    
    function transferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount
    ) external returns (bool) {
        if (!(from == msg.sender || isApprovedForAll[from][msg.sender])) revert ERC6909__NotApproved();
        if (balanceOf[id][from] < amount) revert ERC6909__InsufficientBalance();
        
        balanceOf[id][from] -= amount;
        balanceOf[id][to] += amount;
        emit Transfer(from, to, id, amount);
        return true;
    }
    
    function _mint(address to, uint256 id, uint256 amount) internal {
        balanceOf[id][to] += amount;
        emit Transfer(address(0), to, id, amount);
    }
    
    function _burn(address from, uint256 id, uint256 amount) internal {
        if (balanceOf[id][from] < amount) revert ERC6909__InsufficientBalance();
        balanceOf[id][from] -= amount;
        emit Transfer(from, address(0), id, amount);
    }
    
    // Helper functions for inventory management
    function _packInventory(uint128 asset0, uint128 asset1) internal pure returns (uint256) {
        return uint256(asset0) | (uint256(asset1) << 128);
    }
    
    function getInventory(uint256 poolId) public view returns (uint128 asset0, uint128 asset1) {
        uint256 packed = poolInventories[poolId];
        asset0 = uint128(packed);
        asset1 = uint128(packed >> 128);
    }
}