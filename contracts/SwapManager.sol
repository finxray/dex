// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC6909} from "./ERC6909.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {AssetTransferLib} from "./libraries/AssetTransferLib.sol";
import {Inventory} from "./structs/Inventory.sol";
import {Delta} from "./structs/Delta.sol";

// Clean abstract contract inheriting ERC6909 directly
abstract contract SwapManager is ERC6909, QuoteRequester {
    // Swap assets in a pool
    function swap(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut) {
        
        // Transfer in the input asset
        address assetIn = zeroForOne ? asset0 : asset1;
        address assetOut = zeroForOne ? asset1 : asset0;
        
        AssetTransferLib.transferIn(assetIn, msg.sender, amountIn, msg.value);
        
        // Use dummy quoter for testing - returns fixed rate of 1.3
        // Later will be replaced with real quoter via getQuote()
        uint256 rate = dummyQuoter(asset0, asset1); // Fixed: 1.3 * 1e18
        
        if (zeroForOne) {
            // Swap asset0 for asset1: multiply by rate
            amountOut = (amountIn * rate) / 1e18;
        } else {
            // Swap asset1 for asset0: divide by rate
            amountOut = (amountIn * 1e18) / rate;
        }
        
        require(amountOut >= minAmountOut, "Insufficient output amount");

        // Update pool inventory with swap delta (single storage operation!)
        Delta memory swapDelta = Delta({
            asset0: zeroForOne ? int128(uint128(amountIn)) : -int128(uint128(amountOut)),
            asset1: zeroForOne ? -int128(uint128(amountOut)) : int128(uint128(amountIn))
        });
        updateInventory(poolID, swapDelta);
        
        // Transfer out the output asset
        AssetTransferLib.transferOut(assetOut, msg.sender, amountOut);
        
        return amountOut;
    }

    // Virtual inventory function - to be implemented by concrete contracts
    function inventory(uint256 poolID) public view virtual override returns (Inventory memory);
}