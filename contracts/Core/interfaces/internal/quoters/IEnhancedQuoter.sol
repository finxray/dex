// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteParamsWithContext, QuoteParamsBatchWithContext} from "../../../structs/TraderContext.sol";

/// @title IEnhancedQuoter
/// @notice Interface for quoters that support enhanced trader context
/// @dev Only implemented by quoters that need trader/transaction context for LP protection features
interface IEnhancedQuoter {
    
    /// @notice Get quote with enhanced trader context
    /// @param params Quote parameters including trader context
    /// @param marketData Encoded market data from data bridges
    /// @return quote Output amount for the swap
    function quoteWithContext(
        QuoteParamsWithContext memory params,
        bytes memory marketData
    ) external returns (uint256 quote);
    
    /// @notice Get batch quotes with enhanced trader context  
    /// @param params Batch quote parameters including trader context
    /// @param marketData Encoded market data from data bridges
    /// @return quotes Array of output amounts for each swap
    function quoteBatchWithContext(
        QuoteParamsBatchWithContext memory params,
        bytes memory marketData
    ) external returns (uint256[] memory quotes);
}
