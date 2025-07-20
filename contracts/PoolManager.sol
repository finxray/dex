// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;  

import {QuoteRequester} from "./QuoteRequester.sol";
import {ERC6909Claims} from "./ERC6909Claims.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {Delta} from "./structs/Delta.sol";
import {ExecutionParams} from "./structs/ExecutionParams.sol";
import {Pool} from "./structs/Pool.sol";
import {Inventory} from "./structs/Inventory.sol";
import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";

// ----------------- KISS developed using cursor-------------- Keep it simple, stupit!----------------- KISS -------------------- Keep it simple, stupit

abstract contract PoolManager is ERC6909Claims, QuoteRequester{ 
    mapping(uint256 => Pool) internal pools; 

    constructor(address defaultAlpha, address defaultBeta) QuoteRequester(defaultAlpha, defaultBeta) {}

    function swap(SwapParams[] calldata p) public  {
        ExecutionParams[] memory exeParams = new ExecutionParams[](p.length);
        exeParams = executionParams(p);
        for (uint256 i; i < p.length; i++) {
            // executeSwap(exeParams[i]);

            // swap logic goes here
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
            (uint256 quote, uint256 poolID) = getQuote(p);
            exeParams[0] = ExecutionParams({
                asset0: p.asset0,
                asset1: p.asset1,
                poolID: poolID,
                delta: PoolManagerLib.calculateDelta(p.amount[0], p.zeroForOne, quote),
                quote: quote
            });
        } else if (p.marking.length > 1) {
            (uint256[] memory quote, uint256[] memory poolID) = getQuoteBatch(p);
            for (uint256 i; i < quote.length; i++) {
                ExecutionParams memory exeParamsSingle = ExecutionParams({
                    asset0: p.asset0,
                    asset1: p.asset1,
                    poolID: poolID[i],
                    delta: PoolManagerLib.calculateDelta(p.amount[i], p.zeroForOne, quote[i]),
                    quote: quote[i]
                });
                exeParams[i] = exeParamsSingle;
            }
            return exeParams;
        } else {
            revert();
        }
    }

    function addLiquidity() internal returns (uint256 shares) {}

    function removeLiquidity() internal returns (uint256 amount0, uint256 amount1) {}

}