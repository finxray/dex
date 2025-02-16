// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {QuoteRequester} from "./QuoteRequester.sol";
import {ERC6909Claims} from "./ERC6909Claims.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {Delta} from "./structs/Delta.sol";
import {ExecutionParams} from "./structs/ExecutionParams.sol";
import {Pool} from "./structs/Pool.sol";
import {Inventory} from "./structs/Inventory.sol";

abstract contract Swapper is ERC6909Claims, QuoteRequester {
    constructor(address defaultAlpha, address defaultBeta) QuoteRequester(defaultAlpha, defaultBeta) {}
    
    function updateInventory(uint256 poolID, Delta memory delta) internal virtual;

    // function inventory(uint256 poolID) public view override returns (Inventory memory) {
    //     return pools[poolID].inventory;
    // }

    function swap(SwapParams[] calldata p) public  {
        ExecutionParams[] memory exeParams = new ExecutionParams[](p.length);
        exeParams = executionParams(p);
        for (uint256 i; i < p.length; i++) {
            // executeSwap(exeParams[i]);
        }
    }

    function executionParams(SwapParams[] calldata p) public returns (ExecutionParams[] memory exeParams) {
        uint256 totalLength = 0; 
        uint256 index = 0;
        // Calculate total number of elements 
        for (uint256 i = 0; i < p.length; i++) {
            totalLength += p[i].marking.length; 
        }
        exeParams = new ExecutionParams[](totalLength);
        // Copy elements into new array
        for (uint256 i; i < p.length; i++) {
            for (uint256 j = 0; j < p[i].marking.length; j++) {
                exeParams[index] = executionParamsFromSingle(p[i])[j];
                index++;
            }
        }
    }
    // QuoteBatch are used to save gas on obtaining quotes. After quotes are received normal swap for each pool is done. 
    

    function executionParamsFromSingle(SwapParams calldata p) private returns (ExecutionParams[] memory exeParams) {
        exeParams = new ExecutionParams[](p.marking.length);
        if (p.marking.length == 1) {
            (uint256 quote, uint256 poolID) = qetQuote(p);
            exeParams[0] = ExecutionParams({
                poolID: poolID,
                quote: quote,
                delta: _calculateDelta(p.amount[0], p.zeroForOne, quote)
            });
        } else if (p.marking.length > 1) {
            (uint256[] memory quote, uint256[] memory poolID) = getQuoteBatch(p);
            for (uint256 i; i < quote.length; i++) {
                ExecutionParams memory exeParamsSingle = ExecutionParams({
                    poolID: poolID[i],
                    quote: quote[i],
                    delta: _calculateDelta(p.amount[i], p.zeroForOne, quote[i])
                });
                exeParams[i] = exeParamsSingle;
            }
            return exeParams;
        } else {
            revert();
        }
    }

    function _calculateDelta(
        uint256 amount,
        bool zeroForOne,
        uint256 quote
    ) private pure returns (Delta memory delta) {
        // Calculate asset0 and.asset1 based on the swap direction
        if (zeroForOne) {
            // Swap asset0 for asset1: asset0 = +amountIn,.asset1 = -amountOut
            delta.asset0 = int256(amount);
            delta.asset1 = -int256(amount * quote);
        } else {
            // Swap asset1 for asset0:.asset1 = +amountIn, asset0 = -amountOut
            delta.asset1 = int256(amount);
            delta.asset0 = -int256(amount * quote);
        }
    }



    // function executeSwap(ExecutionParams memory params) internal {
    //     // Pool storage pool = pools[params.poolID];

    //     _validateSwap(pool, params.delta);

    //     _executeTransfers(params.delta, params.poolID);

    //     updateInventory(params.poolID, params.delta);
    // }

    function _validateSwap(Pool storage pool, Delta memory delta) private view {
        // Ensure the pool has sufficient liquidity for the swap
        if (delta.asset0 < 0) {
            require(uint256(-delta.asset0) <= pool.inventory.asset0, "Insufficient asset0");
        }
        if (delta.asset1 < 0) {
            require(uint256(-delta.asset1) <= pool.inventory.asset1, "Insufficient asset1");
        }
    }

    function _executeTransfers(Delta memory delta, uint256 poolID) private {
        if (delta.asset0 > 0) {
            // Transfer asset0 into the pool
            transferFrom(msg.sender, address(this), poolID, uint256(delta.asset0));
        } else if (delta.asset0 < 0) {
            // Transfer asset0 out of the pool
            transfer(msg.sender, poolID, uint256(-delta.asset0));
        }

        if (delta.asset1 > 0) {
            // Transfer asset1 into the pool
            transferFrom(msg.sender, address(this), poolID, uint256(delta.asset1));
        } else if (delta.asset1 < 0) {
            // Transfer asset1 out of the pool
            transfer(msg.sender, poolID, uint256(-delta.asset1));
        }
    }

   
}