// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Base contract for data adapters that normalize data from different sources
abstract contract BaseDataAdapter {
    
    /// @notice Normalized price data structure
    struct NormalizedPriceData {
        uint256 spot;      // Spot price in 1e18 format
        uint256 twap;      // TWAP price in 1e18 format (0 if not available)
        uint256 timestamp; // Last update timestamp (0 if not available)
        bool isValid;      // Whether the data is valid
    }
    
    /// @notice Normalize raw bridge data to standard format
    /// @param rawData Raw bytes data from the bridge
    /// @return Normalized price data
    function normalizeData(bytes memory rawData) internal view virtual returns (NormalizedPriceData memory);
    
    /// @notice Check if the normalized data is fresh enough
    /// @param data Normalized price data
    /// @param maxAge Maximum age in seconds (0 to skip check)
    /// @return Whether the data is fresh
    function isDataFresh(NormalizedPriceData memory data, uint256 maxAge) internal view returns (bool) {
        if (maxAge == 0) return true;
        if (data.timestamp == 0) return true; // No timestamp available, assume fresh
        return (block.timestamp - data.timestamp) <= maxAge;
    }
}
