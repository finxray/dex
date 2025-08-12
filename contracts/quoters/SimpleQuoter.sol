// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoterNoData} from "../interfaces/internal/quoters/IQuoterNoData.sol";
import {QuoteParams, QuoteParamsBatch} from "../structs/QuoteParams.sol";

/// @title SimpleQuoter
/// @notice A quoter that doesn't require external market data - uses only on-chain information
/// @dev This is a skeleton implementation with dummy logic - real pricing logic will be added later
contract SimpleQuoter is IQuoterNoData {
    // execution cost around 10,000 gas
    /// @notice Calculate quote using only on-chain data (balances, amounts)
    /// @param params Quote parameters containing asset balances and swap amount
    /// @return quote The calculated quote amount
    function quote(QuoteParams memory params) external pure override returns (uint256 quote) {
        // Dummy implementation: simple constant product formula approximation
        // In real implementation, this would use sophisticated on-chain pricing logic
        
        if (params.zeroForOne) {
            // Selling asset0 for asset1
            // Simple formula: quote = (amount * asset1Balance) / (asset0Balance + amount)
            quote = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            // Selling asset1 for asset0  
            // Simple formula: quote = (amount * asset0Balance) / (asset1Balance + amount)
            quote = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        
        // Apply a small fee (0.3%)
        quote = (quote * 997) / 1000;
    }
    
    /// @notice Calculate quotes for multiple swaps using only on-chain data
    /// @param params Batch quote parameters
    /// @return quotes Array of calculated quote amounts
    function quoteBatch(QuoteParamsBatch memory params) external pure override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        
        for (uint256 i = 0; i < params.amount.length; i++) {
            if (params.zeroForOne) {
                quotes[i] = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]);
            } else {
                quotes[i] = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]);
            }
            // Apply fee
            quotes[i] = (quotes[i] * 997) / 1000;
        }
    }
}