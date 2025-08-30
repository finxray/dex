// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./BaseDataAdapter.sol";

/// @notice Adapter for Chainlink data bridges
/// @dev Expects data format: abi.encode(spot, updatedAt) where spot is 1e18 scaled
abstract contract ChainlinkAdapter is BaseDataAdapter {
    
    function normalizeData(bytes memory rawData) internal view override returns (NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        try this.decodeChainlinkData(rawData) returns (uint256 spot, uint256 updatedAt) {
            return NormalizedPriceData({
                spot: spot,
                twap: 0, // Chainlink doesn't provide TWAP
                timestamp: updatedAt,
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
    
    /// @notice External function to safely decode Chainlink data
    function decodeChainlinkData(bytes memory rawData) external pure returns (uint256 spot, uint256 updatedAt) {
        (spot, updatedAt) = abi.decode(rawData, (uint256, uint256));
    }
}
