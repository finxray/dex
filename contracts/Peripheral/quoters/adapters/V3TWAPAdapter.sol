// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./BaseDataAdapter.sol";

/// @notice Adapter for Uniswap V3 TWAP data bridges
/// @dev Expects data format: abi.encode(spot, twap) where both are 1e18 scaled
abstract contract V3TWAPAdapter is BaseDataAdapter {
    
    function normalizeData(bytes memory rawData) internal view override returns (NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        try this.decodeV3TWAPData(rawData) returns (uint256 spot, uint256 twap) {
            return NormalizedPriceData({
                spot: spot,
                twap: twap,
                timestamp: 0, // V3TWAP doesn't provide timestamp
                isValid: spot > 0 && twap > 0
            });
        } catch {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
    }
    
    /// @notice External function to safely decode V3TWAP data
    function decodeV3TWAPData(bytes memory rawData) external pure returns (uint256 spot, uint256 twap) {
        (spot, twap) = abi.decode(rawData, (uint256, uint256));
    }
}
