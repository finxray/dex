// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

/// @title BetaMarketData
/// @notice Market data provider that returns only spot price
/// @dev This is a skeleton implementation with dummy data - real market data logic will be added later
contract BetaMarketData is IDataBridge {
    
    /// @notice Returns market data containing only spot price
    /// @return data Encoded market data containing spot price only
    function getData(QuoteParams memory /* params */) external pure override returns (bytes memory data) {
        // Dummy implementation - returns fixed exchange rate
        // asset0/asset1 spot price: 1.35 (1.35 * 1e18)
        uint256 spotPrice = 1350000000000000000;
        
        // Encode only spot price into bytes
        data = abi.encode(spotPrice);
    }
    
    /// @notice Helper function to decode the market data
    /// @param data Encoded market data
    /// @return spotPrice Current spot price
    function decodeData(bytes memory data) external pure returns (uint256 spotPrice) {
        spotPrice = abi.decode(data, (uint256));
    }
}