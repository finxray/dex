// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./BaseDataAdapter.sol";
import "./DataAdapterHelper.sol";

/// @notice Library containing static functions for data normalization
library DataAdapterLibrary {
    using DataAdapterLibrary for bytes;
    
    DataAdapterHelper private constant HELPER = DataAdapterHelper(address(0x1)); // Placeholder, will be deployed
    
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
        
        try HELPER.decodeV3TWAP(rawData) returns (uint256 spot, uint256 twap) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: spot,
                twap: twap,
                timestamp: 0,
                isValid: spot > 0 && twap > 0
            });
        } catch {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
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
        
        try HELPER.decodeChainlink(rawData) returns (uint256 spot, uint256 updatedAt) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: spot,
                twap: 0,
                timestamp: updatedAt,
                isValid: spot > 0
            });
        } catch {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
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
        
        try HELPER.decodeV3Data(rawData) returns (uint256 spot, uint256) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: spot,
                twap: 0,
                timestamp: 0,
                isValid: spot > 0
            });
        } catch {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
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
        
        try HELPER.decodeRedStone(rawData) returns (uint256 spot, uint256 updatedAt) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: spot,
                twap: 0,
                timestamp: updatedAt,
                isValid: spot > 0
            });
        } catch {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
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
        
        try HELPER.decodeV2Data(rawData) returns (uint256 spot, uint256 twap) {
            return BaseDataAdapter.NormalizedPriceData({
                spot: spot,
                twap: twap,
                timestamp: 0,
                isValid: spot > 0
            });
        } catch {
            return BaseDataAdapter.NormalizedPriceData({
                spot: 0,
                twap: 0,
                timestamp: 0,
                isValid: false
            });
        }
    }
    
    /// @notice Check if the normalized data is fresh enough
    function isDataFresh(BaseDataAdapter.NormalizedPriceData memory data, uint256 maxAge) internal view returns (bool) {
        if (maxAge == 0) return true;
        if (data.timestamp == 0) return true; // No timestamp available, assume fresh
        return (block.timestamp - data.timestamp) <= maxAge;
    }
    
    // Decode functions
    function decodeV3TWAP(bytes memory rawData) internal pure returns (uint256 spot, uint256 twap) {
        (spot, twap) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeChainlink(bytes memory rawData) internal pure returns (uint256 spot, uint256 updatedAt) {
        (spot, updatedAt) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeV3Data(bytes memory rawData) internal pure returns (uint256 spot, uint256 spot2) {
        (spot, spot2) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeRedStone(bytes memory rawData) internal pure returns (uint256 spot, uint256 updatedAt) {
        (spot, updatedAt) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeV2Data(bytes memory rawData) internal pure returns (uint256 spot, uint256 twap) {
        (spot, twap) = abi.decode(rawData, (uint256, uint256));
    }
}
