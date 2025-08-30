// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./BaseDataAdapter.sol";

/// @notice Adapter for Uniswap V2/Sushi V2 data bridges
/// @dev Expects data format: abi.encode(spot, twap) where both are 1e18 scaled
abstract contract V2DataAdapter is BaseDataAdapter {
    
    function normalizeData(bytes memory rawData) internal view override returns (NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        try this.decodeV2Data(rawData) returns (uint256 spot, uint256 twap) {
            return NormalizedPriceData({
                spot: spot,
                twap: twap,
                timestamp: 0, // V2 doesn't provide timestamp in basic implementation
                isValid: spot > 0
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
    
    /// @notice External function to safely decode V2 data
    function decodeV2Data(bytes memory rawData) external pure returns (uint256 spot, uint256 twap) {
        (spot, twap) = abi.decode(rawData, (uint256, uint256));
    }
}
