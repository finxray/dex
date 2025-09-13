// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../Core/interfaces/internal/quoters/IQuoter.sol";
import "../Core/structs/QuoteParams.sol";

contract MinimalDummyQuoter is IQuoter {
    // Returns a fixed quote without any external calls or data processing
    function quote(QuoteParams memory params, bytes memory) external pure override returns (uint256) {
        // Simple hardcoded formula: return 1000 wei per 1 wei input (1:1000 ratio)
        return params.amount * 1000;
    }
    
    function quoteBatch(QuoteParamsBatch memory params, bytes memory) external pure override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            quotes[i] = params.amount[i] * 1000;
        }
    }
}
