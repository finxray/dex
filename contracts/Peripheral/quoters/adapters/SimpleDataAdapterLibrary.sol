// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./BaseDataAdapter.sol";

/// @notice Simple library for data normalization without external calls
library SimpleDataAdapterLibrary {
    
    /// @notice Normalize V3TWAP data format: abi.encode(spot, twap)
    function normalizeV3TWAP(bytes memory rawData) internal view returns (BaseDataAdapter.NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        (uint256 spot, uint256 twap) = abi.decode(rawData, (uint256, uint256));
        return BaseDataAdapter.NormalizedPriceData({
            spot: spot,
            twap: twap,
            timestamp: 0,
            isValid: spot > 0 && twap > 0
        });
    }
    
    /// @notice Normalize Chainlink data format: abi.encode(spot, updatedAt)
    function normalizeChainlink(bytes memory rawData) internal view returns (BaseDataAdapter.NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        (uint256 spot, uint256 updatedAt) = abi.decode(rawData, (uint256, uint256));
        return BaseDataAdapter.NormalizedPriceData({
            spot: spot,
            twap: 0,
            timestamp: updatedAt,
            isValid: spot > 0
        });
    }
    
    /// @notice Normalize V3Data format: abi.encode(spot, spot)
    function normalizeV3Data(bytes memory rawData) internal view returns (BaseDataAdapter.NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        (uint256 spot,) = abi.decode(rawData, (uint256, uint256));
        return BaseDataAdapter.NormalizedPriceData({
            spot: spot,
            twap: 0,
            timestamp: 0,
            isValid: spot > 0
        });
    }
    
    /// @notice Normalize RedStone data format: abi.encode(spot, updatedAt)
    function normalizeRedStone(bytes memory rawData) internal view returns (BaseDataAdapter.NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        (uint256 spot, uint256 updatedAt) = abi.decode(rawData, (uint256, uint256));
        return BaseDataAdapter.NormalizedPriceData({
            spot: spot,
            twap: 0,
            timestamp: updatedAt,
            isValid: spot > 0
        });
    }
    
    /// @notice Normalize V2 data format: abi.encode(spot, twap)
    function normalizeV2Data(bytes memory rawData) internal view returns (BaseDataAdapter.NormalizedPriceData memory) {
        if (rawData.length == 0) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
        
        (uint256 spot, uint256 twap) = abi.decode(rawData, (uint256, uint256));
        return BaseDataAdapter.NormalizedPriceData({
            spot: spot,
            twap: twap,
            timestamp: 0,
            isValid: spot > 0
        });
    }
    
    /// @notice Check if the normalized data is fresh enough
    function isDataFresh(BaseDataAdapter.NormalizedPriceData memory data, uint256 maxAge) internal view returns (bool) {
        if (maxAge == 0) return true;
        if (data.timestamp == 0) return true; // No timestamp available, assume fresh
        return (block.timestamp - data.timestamp) <= maxAge;
    }
}
