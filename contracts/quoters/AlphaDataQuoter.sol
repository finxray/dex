// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../structs/QuoteParams.sol";

/// @title AlphaDataQuoter
/// @notice A quoter that requires alpha market data (spot price and TWAP)
/// @dev This is a skeleton implementation with dummy logic - real pricing logic will be added later
contract AlphaDataQuoter is IQuoter {
    // execution cost around 13,000 gas
    /// @notice Calculate quote using alpha market data
    /// @param params Quote parameters containing asset balances and swap amount
    /// @param data Encoded alpha market data (spot price and TWAP)
    /// @return quote The calculated quote amount
    function quote(QuoteParams memory params, bytes memory data) external pure override returns (uint256 quote) {
        // Decode arrays and average
        // Data may arrive as raw arrays or wrapped (alphaData, betaData). Handle both.
        (bytes memory alphaData, ) = abi.decode(data, (bytes, bytes));
        if (alphaData.length == 0) {
            // Fallback to simple proportion when no data
            if (params.zeroForOne) {
                return (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount) * 997 / 1000;
            } else {
                return (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount) * 997 / 1000;
            }
        }
        uint256 spotPrice;
        uint256 twapPrice;
        if (alphaData.length == 64) {
            (spotPrice, twapPrice) = abi.decode(alphaData, (uint256, uint256));
        } else {
            (uint256[] memory spots, uint256[] memory twaps) = abi.decode(alphaData, (uint256[], uint256[]));
            spotPrice = (spots[0] + spots[1] + spots[2]) / 3;
            twapPrice = (twaps[0] + twaps[1] + twaps[2]) / 3;
        }
        
        // Dummy implementation: use weighted average of spot and TWAP prices
        // 70% spot price, 30% TWAP price
        uint256 weightedPrice = (spotPrice * 70 + twapPrice * 30) / 100;
        
        if (params.zeroForOne) {
            // Selling asset0 for asset1: multiply by price
            quote = (params.amount * weightedPrice) / 1e18;
        } else {
            // Selling asset1 for asset0: divide by price
            quote = (params.amount * 1e18) / weightedPrice;
        }
        
        // Apply slippage based on amount size
        uint256 slippageFactor = params.amount > 1000e18 ? 995 : 998; // Higher slippage for larger trades
        quote = (quote * slippageFactor) / 1000;
    }
    
    /// @notice Calculate quotes for multiple swaps using alpha market data
    /// @param params Batch quote parameters
    /// @param data Encoded alpha market data (same for all quotes in batch)
    /// @return quotes Array of calculated quote amounts
    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external pure override returns (uint256[] memory quotes) {
        (bytes memory alphaData, ) = abi.decode(data, (bytes, bytes));
        if (alphaData.length == 0) {
            uint256[] memory out = new uint256[](params.amount.length);
            for (uint256 i = 0; i < params.amount.length; i++) {
                if (params.zeroForOne) {
                    out[i] = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]) * 997 / 1000;
                } else {
                    out[i] = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]) * 997 / 1000;
                }
            }
            return out;
        }
        uint256 spotPrice;
        uint256 twapPrice;
        if (alphaData.length == 64) {
            (spotPrice, twapPrice) = abi.decode(alphaData, (uint256, uint256));
        } else {
            (uint256[] memory spots, uint256[] memory twaps) = abi.decode(alphaData, (uint256[], uint256[]));
            spotPrice = (spots[0] + spots[1] + spots[2]) / 3;
            twapPrice = (twaps[0] + twaps[1] + twaps[2]) / 3;
        }
        uint256 weightedPrice = (spotPrice * 70 + twapPrice * 30) / 100;
        
        quotes = new uint256[](params.amount.length);
        
        for (uint256 i = 0; i < params.amount.length; i++) {
            if (params.zeroForOne) {
                quotes[i] = (params.amount[i] * weightedPrice) / 1e18;
            } else {
                quotes[i] = (params.amount[i] * 1e18) / weightedPrice;
            }
            
            // Apply slippage
            uint256 slippageFactor = params.amount[i] > 1000e18 ? 995 : 998;
            quotes[i] = (quotes[i] * slippageFactor) / 1000;
        }
    }
}