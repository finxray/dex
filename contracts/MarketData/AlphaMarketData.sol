// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

/// @title AlphaMarketData
/// @notice Market data provider that returns both spot price and TWAP price
/// @dev This is a skeleton implementation with dummy data - real market data logic will be added later
contract AlphaMarketData is IDataBridge {
    
    /// @notice Returns market data containing both spot price and TWAP price
    /// @return data Encoded market data containing spot price and TWAP price
    function getData(QuoteParams memory /* params */) external pure override returns (bytes memory data) {
        // Dummy implementation - returns fixed exchange rates
        // asset0/asset1 spot price: 1.25 (1.25 * 1e18)
        uint256 spotPrice = 1250000000000000000;
        
        // asset0/asset1 TWAP price: 1.23 (1.23 * 1e18) 
        uint256 twapPrice = 1230000000000000000;
        
        // Encode both prices into bytes
        data = abi.encode(spotPrice, twapPrice);
    }
    
    /// @notice Helper function to decode the market data
    /// @param data Encoded market data
    /// @return spotPrice Current spot price
    /// @return twapPrice Time-weighted average price
    function decodeData(bytes memory data) external pure returns (uint256 spotPrice, uint256 twapPrice) {
        (spotPrice, twapPrice) = abi.decode(data, (uint256, uint256));
    }
}