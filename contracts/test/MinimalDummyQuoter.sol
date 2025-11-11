// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../Core/interfaces/internal/quoters/IQuoter.sol";
import "../Core/structs/QuoteParams.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract MinimalDummyQuoter is IQuoter {
    // Returns a quote based on the pool rate: 1 sWETH = 3,000 sUSDC
    // Pool: 5,000 sWETH / 15,000,000 sUSDC = 3,000:1 ratio
    function quote(QuoteParams memory params, bytes memory) external view override returns (uint256) {
        // Get token decimals
        uint8 decIn = IERC20Metadata(params.zeroForOne ? params.asset0 : params.asset1).decimals();
        uint8 decOut = IERC20Metadata(params.zeroForOne ? params.asset1 : params.asset0).decimals();
        
        // Exchange rate: 1 sWETH = 3,000 sUSDC
        // If swapping sWETH -> sUSDC (zeroForOne = true): multiply by 3000
        // If swapping sUSDC -> sWETH (zeroForOne = false): divide by 3000
        
        // Calculate: amountOut = amountIn * rate, accounting for decimal differences
        // Example: 0.1 sWETH (18 decimals) -> 300 sUSDC (6 decimals)
        // amountIn = 0.1 * 10^18 = 100000000000000000
        // rate = 3000
        // amountOut = (100000000000000000 * 3000) / 10^18 * 10^6 = 300 * 10^6 = 300000000
        
        uint256 rate = params.zeroForOne ? 3000 : 1;
        uint256 divisor = params.zeroForOne ? 1 : 3000;
        
        // Calculate output with proper decimal scaling
        // We need to: (amountIn * rate) * 10^decOut / (10^decIn * divisor)
        uint256 numerator = params.amount * rate;
        uint256 denominator = divisor;
        
        // Scale by output decimals
        if (decOut > 0) {
            numerator = numerator * (10 ** decOut);
        }
        
        // Scale down by input decimals
        if (decIn > 0) {
            denominator = denominator * (10 ** decIn);
        }
        
        return numerator / denominator;
    }
    
    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external view override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            QuoteParams memory single = QuoteParams({
                asset0: params.asset0,
                asset1: params.asset1,
                quoter: params.quoter,
                amount: params.amount[i],
                asset0Balance: params.asset0Balances[i],
                asset1Balance: params.asset1Balances[i],
                bucketID: params.bucketID[i],
                zeroForOne: params.zeroForOne,
                functionFlags: params.functionFlags
            });
            quotes[i] = this.quote(single, data);
        }
    }
}
