// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {StoixDataLib} from "../../libraries/StoixDataLib.sol";

/// @title StoixDataBridge (consolidated real bridges)
/// @notice Single external call returning packed per-flag payloads. Formatting at bridge level (Q64.64).
contract StoixDataBridge is IDataBridge {
    using StoixDataLib for uint256;

    // Function flags (lower 8 bits after the "use Stoix Bridge" bit)
    // bit0: UniV2 spot, bit1: UniV3 spot, bit2: UniV3 TWAP, bit3: Chainlink spot, bit4: Chainlink ts
    // bit5: V3 stdev short, bit6: V3 stdev long

    // Immutable addresses for direct protocol calls (no intermediate bridges)
    address public immutable uniV2Factory;
    address public immutable uniV3Factory;
    address public immutable chainlinkFeed;
    address public immutable token0; // Canonical token0 (lower address)
    address public immutable token1; // Canonical token1 (higher address)

    constructor(address _uniV2Factory, address _uniV3Factory, address _chainlinkFeed, address _token0, address _token1) {
        uniV2Factory = _uniV2Factory;
        uniV3Factory = _uniV3Factory;
        chainlinkFeed = _chainlinkFeed;
        // Ensure canonical ordering
        if (_token0 < _token1) {
            token0 = _token0;
            token1 = _token1;
        } else {
            token0 = _token1;
            token1 = _token0;
        }
    }

    // No storage caches - rely on router-level transient caching for gas efficiency

    function getData(QuoteParams memory params) external override returns (bytes memory) {
        uint8 flags = params.functionFlags;
        uint8 mask = 0;
        uint128 v2Q; uint128 v3Q; uint128 twQ; uint128 clQ;
        uint64 ts; uint16 sdShort; uint16 sdLong;

        if ((flags & 0x01) != 0) { 
            v2Q = StoixDataLib.getV2SpotQ64(uniV2Factory, params.asset0, params.asset1, params.zeroForOne);
            if (v2Q > 0) mask |= 0x01;
        }
        if ((flags & 0x02) != 0) { 
            v3Q = StoixDataLib.getV3SpotQ64(uniV3Factory, params.asset0, params.asset1, 3000, params.zeroForOne);
            if (v3Q > 0) mask |= 0x02;
        }
        // V3 TWAP optimization: if std dev is requested, get TWAP for free
        if ((flags & 0x04) != 0) { 
            if ((flags & 0x60) != 0) {
                // Std dev requested - get TWAP for free from std dev calculation
                if ((flags & 0x20) != 0) {
                    // Short-term std dev requested - use its TWAP (15 min)
                    twQ = _getStdvShortTwap(params);
                } else {
                    // Long-term std dev requested - use its TWAP (1 day)  
                    twQ = _getStdvLongTwap(params);
                }
                if (twQ > 0) mask |= 0x04;
            } else {
                // No std dev requested - use regular TWAP call
                twQ = StoixDataLib.getV3TWAPQ64(uniV3Factory, params.asset0, params.asset1, 3000, 900, params.zeroForOne);
                if (twQ > 0) mask |= 0x04; 
            }
        }
        // Chainlink optimization: fetch price and timestamp in single call if either is requested
        if ((flags & 0x18) != 0) { // 0x08 (price) OR 0x10 (timestamp)
            (uint128 clPrice, uint64 clTimestamp) = StoixDataLib.getChainlinkQ64(chainlinkFeed, params.zeroForOne);
            if ((flags & 0x08) != 0) { mask |= 0x08; clQ = clPrice; }
            if ((flags & 0x10) != 0) { mask |= 0x10; ts = clTimestamp; }
        }
        if ((flags & 0x20) != 0) { 
            sdShort = _getStdvShortVal(params); 
            if (sdShort > 0) mask |= 0x20;
        }
        if ((flags & 0x40) != 0) { 
            sdLong = _getStdvLongVal(params); 
            if (sdLong > 0) mask |= 0x40;
        }

        return abi.encode(mask, v2Q, v3Q, twQ, clQ, ts, sdShort, sdLong);
    }

    // All logic moved to StoixDataLib for gas efficiency

    // Standard deviation calculation using V3 historical tick data
    // Returns (stdDev, mostRecentTwap) - the TWAP comes "free" from the calculation
    function _getStdvShortVal(QuoteParams memory params) internal view returns (uint16) {
        (uint16 stdDev, ) = StoixDataLib.calculateStdDevAndTwap(uniV3Factory, params.asset0, params.asset1, 3000, 900, params.zeroForOne);
        return stdDev;
    }
    
    function _getStdvLongVal(QuoteParams memory params) internal view returns (uint16) {
        (uint16 stdDev, ) = StoixDataLib.calculateStdDevAndTwap(uniV3Factory, params.asset0, params.asset1, 3000, 86400, params.zeroForOne);
        return stdDev;
    }
    
    // Get the TWAP that comes free with std dev calculation
    function _getStdvShortTwap(QuoteParams memory params) internal view returns (uint128) {
        (, uint128 twap) = StoixDataLib.calculateStdDevAndTwap(uniV3Factory, params.asset0, params.asset1, 3000, 900, params.zeroForOne);
        return twap;
    }
    
    function _getStdvLongTwap(QuoteParams memory params) internal view returns (uint128) {
        (, uint128 twap) = StoixDataLib.calculateStdDevAndTwap(uniV3Factory, params.asset0, params.asset1, 3000, 86400, params.zeroForOne);
        return twap;
    }
    
    // All calculation logic moved to StoixDataLib for reusability and gas optimization
}


