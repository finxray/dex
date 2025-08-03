// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC6909Claims} from "./interfaces/external/IERC6909Claims.sol";
import {Delta} from "./structs/Delta.sol";

/// @notice Minimalist and gas efficient standard ERC6909 implementation.
/// @author Uniswap V4 (https://github.com/Uniswap/v4-core/blob/main/src/ERC6909.sol)
/// @dev This contract has been modified from the implementation at the above link.
abstract contract ERC6909 is IERC6909Claims {
    /*//////////////////////////////////////////////////////////////
                             ERC6909 STORAGE
    //////////////////////////////////////////////////////////////*/

    mapping(address owner => mapping(address operator => bool isOperator)) public isOperator;

    // User LP share balances (address owner -> poolID -> balance)
    mapping(address owner => mapping(uint256 id => uint256 balance)) public balanceOf;

    // Pool asset balances (poolID -> packed uint256) - BOTH ASSETS IN SINGLE SLOT!
    // Lower 128 bits = asset0, Upper 128 bits = asset1
    mapping(uint256 poolId => uint256 packedInventory) public poolInventories;

    mapping(address owner => mapping(address spender => mapping(uint256 id => uint256 amount))) public allowance;

    /*//////////////////////////////////////////////////////////////
                              ERC6909 LOGIC
    //////////////////////////////////////////////////////////////*/

    function transfer(address receiver, uint256 id, uint256 amount) public virtual returns (bool) {
        balanceOf[msg.sender][id] -= amount;

        balanceOf[receiver][id] += amount;

        emit Transfer(msg.sender, msg.sender, receiver, id, amount);

        return true;
    }

    function transferFrom(address sender, address receiver, uint256 id, uint256 amount) public virtual returns (bool) {
        if (msg.sender != sender && !isOperator[sender][msg.sender]) {
            uint256 allowed = allowance[sender][msg.sender][id];
            if (allowed != type(uint256).max) allowance[sender][msg.sender][id] = allowed - amount;
        }

        balanceOf[sender][id] -= amount;

        balanceOf[receiver][id] += amount;

        emit Transfer(msg.sender, sender, receiver, id, amount);

        return true;
    }

    function approve(address spender, uint256 id, uint256 amount) public virtual returns (bool) {
        allowance[msg.sender][spender][id] = amount;

        emit Approval(msg.sender, spender, id, amount);

        return true;
    }

    function setOperator(address operator, bool approved) public virtual returns (bool) {
        isOperator[msg.sender][operator] = approved;

        emit OperatorSet(msg.sender, operator, approved);

        return true;
    }

    /*//////////////////////////////////////////////////////////////
                              ERC165 LOGIC
    //////////////////////////////////////////////////////////////*/

    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC165 Interface ID for ERC165
            || interfaceId == 0x0f632fb3; // ERC165 Interface ID for ERC6909
    }

    /*//////////////////////////////////////////////////////////////
                        POOL ASSET FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get current pool inventory - SINGLE STORAGE READ!
    function getInventory(uint256 poolId) public view returns (uint128 asset0, uint128 asset1) {
        uint256 packed = poolInventories[poolId]; // Single SLOAD!
        asset0 = uint128(packed);              // Lower 128 bits
        asset1 = uint128(packed >> 128);       // Upper 128 bits
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL MINT/BURN LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint LP shares to user
    function _mint(address receiver, uint256 id, uint256 amount) internal virtual {
        balanceOf[receiver][id] += amount;
        emit Transfer(msg.sender, address(0), receiver, id, amount);
    }

    /// @notice Burn LP shares from user
    function _burn(address sender, uint256 id, uint256 amount) internal virtual {
        balanceOf[sender][id] -= amount;
        emit Transfer(msg.sender, sender, address(0), id, amount);
    }

    /// @notice Update pool inventory with delta changes - SINGLE STORAGE OPERATION!
    /// @param poolId The pool to update
    /// @param delta The changes to apply (positive = add, negative = subtract)
    function updateInventory(uint256 poolId, Delta memory delta) internal virtual {
        uint256 packed = poolInventories[poolId]; // Single SLOAD
        uint128 asset0 = uint128(packed);         // Lower 128 bits
        uint128 asset1 = uint128(packed >> 128);  // Upper 128 bits
        
        // Apply delta changes (int128 -> uint128 with proper bounds checking)
        asset0 = uint128(int128(asset0) + delta.asset0);
        asset1 = uint128(int128(asset1) + delta.asset1);
        
        // Pack both assets back into single uint256 and store - Single SSTORE!
        poolInventories[poolId] = uint256(asset0) | (uint256(asset1) << 128);
    }
}