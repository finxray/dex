// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./BaseDataAdapter.sol";

/// @notice Adapter for Uniswap V3 Data bridges (spot only)
/// @dev Expects data format: abi.encode(spot, spot) where spot is 1e18 scaled
abstract contract V3DataAdapter is BaseDataAdapter {
    
    function normalizeData(bytes memory rawData) internal view override returns (NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        try this.decodeV3Data(rawData) returns (uint256 spot, uint256) {
            return NormalizedPriceData({
                spot: spot,
                twap: 0, // V3Data doesn't provide TWAP
                timestamp: 0, // V3Data doesn't provide timestamp
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
    
    /// @notice External function to safely decode V3Data
    function decodeV3Data(bytes memory rawData) external pure returns (uint256 spot, uint256 spot2) {
        (spot, spot2) = abi.decode(rawData, (uint256, uint256));
    }
}
