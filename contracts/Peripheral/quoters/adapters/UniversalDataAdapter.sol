// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../../../Core/interfaces/internal/IDataBridge.sol";
import "../../../Core/structs/QuoteParams.sol";

/// @notice Universal data adapter that automatically handles price inversion
/// @dev Ensures all prices are returned as asset0 per asset1 (e.g., USDC per WETH)
library UniversalDataAdapter {
    
    /// @notice Normalized price data structure
    struct NormalizedPriceData {
        uint256 spot;      // Spot price in 1e18 format (asset0 per asset1)
        uint256 twap;      // TWAP price in 1e18 format (asset0 per asset1) 
        uint256 timestamp; // Timestamp of the data
        bool isValid;      // Whether the data is valid
    }
    
    /// @notice Fetches and normalizes data from any bridge, ensuring correct price orientation
    /// @param bridge The data bridge to fetch from
    /// @param params Quote parameters
    /// @return Normalized price data with consistent orientation
    function fetchAndNormalize(
        IDataBridge bridge,
        QuoteParams memory params
    ) internal returns (NormalizedPriceData memory) {
        try bridge.getData(params) returns (bytes memory rawData) {
            return normalizeRawData(rawData, params);
        } catch {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: block.timestamp,
                isValid: false
            });
        }
    }
    
    /// @notice Normalizes raw data and ensures correct price orientation
    /// @param rawData Raw bytes data from bridge
    /// @param params Quote parameters for context
    /// @return Normalized price data
    function normalizeRawData(
        bytes memory rawData,
        QuoteParams memory params
    ) internal view returns (NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: block.timestamp,
                isValid: false
            });
        }
        
        // Try to decode as (uint256, uint256) - most common format
        if (rawData.length == 64) {
            (uint256 price1, uint256 price2) = abi.decode(rawData, (uint256, uint256));
            return processDoublePrice(price1, price2, params);
        }
        
        // Try to decode as single uint256
        if (rawData.length == 32) {
            uint256 price = abi.decode(rawData, (uint256));
            return processSinglePrice(price, params);
        }
        
        // If we can't decode, return invalid data
        return NormalizedPriceData({
            spot: 0,
            twap: 0,
            timestamp: block.timestamp,
            isValid: false
        });
    }
    
    /// @notice Processes double price data (spot, twap) or (spot, timestamp)
    function processDoublePrice(
        uint256 price1,
        uint256 price2,
        QuoteParams memory params
    ) internal view returns (NormalizedPriceData memory) {
        // Detect if price2 is a timestamp (> 1e15) or a price
        bool price2IsTimestamp = price2 > 1e15 && price2 < 2e10; // Reasonable timestamp range
        
        uint256 spot = price1;
        uint256 twap = price2IsTimestamp ? price1 : price2; // Use spot as twap if price2 is timestamp
        uint256 timestamp = price2IsTimestamp ? price2 : block.timestamp;
        
        // Auto-correct price orientation based on expected ranges
        (spot, twap) = autoCorrectPriceOrientation(spot, twap, params);
        
        return NormalizedPriceData({
            spot: spot,
            twap: twap,
            timestamp: timestamp,
            isValid: spot > 0
        });
    }
    
    /// @notice Processes single price data
    function processSinglePrice(
        uint256 price,
        QuoteParams memory params
    ) internal view returns (NormalizedPriceData memory) {
        // Auto-correct price orientation
        (uint256 correctedPrice,) = autoCorrectPriceOrientation(price, price, params);
        
        return NormalizedPriceData({
            spot: correctedPrice,
            twap: correctedPrice,
            timestamp: block.timestamp,
            isValid: correctedPrice > 0
        });
    }
    
    /// @notice Automatically detects and corrects price orientation
    /// @dev Uses heuristics to determine if prices should be inverted
    function autoCorrectPriceOrientation(
        uint256 spot,
        uint256 twap,
        QuoteParams memory /* params */
    ) internal pure returns (uint256 correctedSpot, uint256 correctedTwap) {
        // If prices are 0, return as-is
        if (spot == 0 || twap == 0) {
            return (spot, twap);
        }
        
        // Heuristic: For major pairs like WETH/USDC, WBTC/USDC, etc.
        // If price is very small (< 1.0), it's likely inverted
        // USDC per WETH should be ~1000-10000, not ~0.0001-0.001
        bool shouldInvert = spot < 1e18; // Less than 1.0 in 1e18 format
        
        if (shouldInvert) {
            // Invert both prices: new_price = 1e36 / old_price
            correctedSpot = spot > 0 ? (1e36 / spot) : 0;
            correctedTwap = twap > 0 ? (1e36 / twap) : 0;
        } else {
            correctedSpot = spot;
            correctedTwap = twap;
        }
        
        return (correctedSpot, correctedTwap);
    }
    
    /// @notice Calculates weighted average of multiple price sources
    /// @param prices Array of normalized price data
    /// @param weights Array of weights (must sum to 1e18)
    /// @return Weighted average price data
    function calculateWeightedAverage(
        NormalizedPriceData[] memory prices,
        uint256[] memory weights
    ) internal view returns (NormalizedPriceData memory) {
        if (prices.length != weights.length) revert();
        
        uint256 totalSpot = 0;
        uint256 totalTwap = 0;
        uint256 totalWeight = 0;
        uint256 latestTimestamp = 0;
        bool hasValidData = false;
        
        for (uint256 i = 0; i < prices.length; i++) {
            if (prices[i].isValid && weights[i] > 0) {
                totalSpot += (prices[i].spot * weights[i]) / 1e18;
                totalTwap += (prices[i].twap * weights[i]) / 1e18;
                totalWeight += weights[i];
                
                if (prices[i].timestamp > latestTimestamp) {
                    latestTimestamp = prices[i].timestamp;
                }
                hasValidData = true;
            }
        }
        
        return NormalizedPriceData({
            spot: totalWeight > 0 ? totalSpot : 0,
            twap: totalWeight > 0 ? totalTwap : 0,
            timestamp: latestTimestamp > 0 ? latestTimestamp : block.timestamp,
            isValid: hasValidData && totalWeight > 0
        });
    }
}
