// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Helper contract for safe data decoding
contract DataAdapterHelper {
    function decodeV3TWAP(bytes memory rawData) external pure returns (uint256 spot, uint256 twap) {
        (spot, twap) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeChainlink(bytes memory rawData) external pure returns (uint256 spot, uint256 updatedAt) {
        (spot, updatedAt) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeV3Data(bytes memory rawData) external pure returns (uint256 spot, uint256 spot2) {
        (spot, spot2) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeRedStone(bytes memory rawData) external pure returns (uint256 spot, uint256 updatedAt) {
        (spot, updatedAt) = abi.decode(rawData, (uint256, uint256));
    }
    
    function decodeV2Data(bytes memory rawData) external pure returns (uint256 spot, uint256 twap) {
        (spot, twap) = abi.decode(rawData, (uint256, uint256));
    }
}
