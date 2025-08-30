// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Markings} from "./Markings.sol";
import {MarkingHelper} from "../libraries/MarkingHelper.sol";
import {MEVProtectionLevel} from "./MEVProtectionLevel.sol";

/**
 * @title ExtendedMarkings
 * @notice Extended pool configuration including MEV protection preferences
 * @dev Maintains backward compatibility while adding new features
 */
library ExtendedMarkings {
    
    // Extended marking structure (4 bytes total)
    // Byte 0: Original markings (data sources, bucket)
    // Byte 1: MEV protection level
    // Byte 2: Fee tier (0-255 basis points)
    // Byte 3: Reserved for future use
    
    struct ExtendedPoolConfig {
        // Original markings
        bool data0;
        bool data1;
        bool data2;
        bool data3;
        uint16 bucketID;
        
        // MEV protection
        uint8 mevProtection;
        
        // Fee configuration
        uint8 feeTier;        // Base fee in basis points
        
        // Future expansion
        uint8 reserved;
    }
    
    /**
     * @notice Encode extended configuration into bytes4
     * @dev Backward compatible - original markings in first 3 bytes
     */
    function encode(ExtendedPoolConfig memory config) internal pure returns (bytes4) {
        // Encode original markings manually (matching MarkingHelper layout)
        // Layout: [bucketID (12 bits)] [data3 (1)] [data2 (1)] [data1 (1)] [data0 (1)]
        uint24 data = 0;
        if (config.data0) data |= 0x1;
        if (config.data1) data |= 0x2;
        if (config.data2) data |= 0x4;
        if (config.data3) data |= 0x8;
        data |= uint24(config.bucketID) << 4;
        
        bytes3 originalMarkings = bytes3(data);
        
        // Combine with MEV byte
        bytes4 extended = bytes4(uint32(uint24(originalMarkings)) << 8 | uint32(config.mevProtection));
        
        return extended;
    }
    
    /**
     * @notice Decode bytes4 into extended configuration
     */
    function decode(bytes4 extended) internal pure returns (ExtendedPoolConfig memory config) {
        // Extract original markings (first 3 bytes)
        bytes3 originalMarkings = bytes3(extended);
        Markings memory basic = MarkingHelper.decodeMarkings(originalMarkings);
        
        config.data0 = basic.data0;
        config.data1 = basic.data1;
        config.data2 = basic.data2;
        config.data3 = basic.data3;
        config.bucketID = basic.bucketID;
        
        // Extract MEV protection (4th byte)
        config.mevProtection = uint8(extended[3]);
        
        return config;
    }
    
    /**
     * @notice Create configuration for different pool types
     * @dev Convenience functions for common configurations
     */
    function createBasicAMM(uint16 bucketID) internal pure returns (bytes4) {
        return encode(ExtendedPoolConfig({
            data0: false,
            data1: false,
            data2: false,
            data3: false,
            bucketID: bucketID,
            mevProtection: MEVProtectionLevel.NONE,
            feeTier: 30,  // 0.3% default
            reserved: 0
        }));
    }
    
    function createOraclePool(
        bool useChainlink,
        bool useRedstone,
        uint16 bucketID,
        uint8 mevLevel
    ) internal pure returns (bytes4) {
        return encode(ExtendedPoolConfig({
            data0: useChainlink,
            data1: useRedstone,
            data2: false,
            data3: false,
            bucketID: bucketID,
            mevProtection: mevLevel,
            feeTier: 10,  // 0.1% for oracle pools
            reserved: 0
        }));
    }
    
    function createSecurePool(
        bool data0,
        bool data1,
        uint16 bucketID
    ) internal pure returns (bytes4) {
        return encode(ExtendedPoolConfig({
            data0: data0,
            data1: data1,
            data2: false,
            data3: false,
            bucketID: bucketID,
            mevProtection: MEVProtectionLevel.HIGH_PROTECTION,
            feeTier: 50,  // 0.5% for secure pools
            reserved: 0
        }));
    }
    
    function createPrivatePool(
        uint16 bucketID
    ) internal pure returns (bytes4) {
        return encode(ExtendedPoolConfig({
            data0: false,
            data1: false,
            data2: false,
            data3: false,
            bucketID: bucketID,
            mevProtection: MEVProtectionLevel.PRIVATE_POOL,
            feeTier: 5,   // 0.05% for private pools
            reserved: 0
        }));
    }
    
    /**
     * @notice Check if pool requires MEV protection
     */
    function requiresMEVProtection(bytes4 extended) internal pure returns (bool) {
        uint8 mevLevel = uint8(extended[3]);
        return mevLevel != MEVProtectionLevel.NONE;
    }
    
    /**
     * @notice Get human-readable pool type
     */
    function getPoolType(bytes4 extended) internal pure returns (string memory) {
        ExtendedPoolConfig memory config = decode(extended);
        
        if (config.mevProtection == MEVProtectionLevel.PRIVATE_POOL) {
            return "Private Pool";
        }
        
        if (config.mevProtection >= MEVProtectionLevel.HIGH_PROTECTION) {
            return "Secure Pool";
        }
        
        bool hasOracles = config.data0 || config.data1 || config.data2 || config.data3;
        if (hasOracles) {
            return config.mevProtection > 0 ? "Protected Oracle Pool" : "Oracle Pool";
        }
        
        return config.mevProtection > 0 ? "Protected AMM" : "Basic AMM";
    }
    
    /**
     * @notice Estimate total gas cost including MEV protection
     */
    function estimateTotalGas(bytes4 extended) internal pure returns (uint256) {
        ExtendedPoolConfig memory config = decode(extended);
        
        uint256 baseGas = 100000; // Base swap gas
        
        // Add data source costs
        if (config.data0) baseGas += 30000;
        if (config.data1) baseGas += 30000;
        if (config.data2) baseGas += 30000;
        if (config.data3) baseGas += 30000;
        
        // Add MEV protection overhead
        baseGas += MEVProtectionLevel.estimateGasOverhead(config.mevProtection);
        
        return baseGas;
    }
}
