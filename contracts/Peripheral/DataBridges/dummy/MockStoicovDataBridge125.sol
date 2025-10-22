// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {FixedPoint64x64} from "../../libraries/FixedPoint64x64.sol";

/// @title MockStoicovDataBridge125
/// @notice Returns fixed Q64.64 mid price and short-term stdev suitable for Stoicov tests
contract MockStoicovDataBridge125 is IDataBridge {
    using FixedPoint64x64 for uint128;

    // Fixed parameters for tests
    // Mid price: 0.001 (asset1 per asset0) in Q64.64
    uint128 public immutable midQ = FixedPoint64x64.fromFraction(1e15, 1e18);
    // Short-term standard deviation in bps × 100 (StoixDataLib format)
    // 125 bps = 12500 in the encoded format
    uint16 public immutable stdevShortBps = 12500; // 125 bps × 100

    function getData(QuoteParams memory /* params */) external view override returns (bytes memory) {
        // We always return Chainlink price (mask bit 0x08) and short-term stdev (0x20)
        uint8 mask = 0x28; // 0b0010_1000 => clQ + sdShort
        uint128 v2Q = 0; uint128 v3Q = 0; uint128 twQ = 0; uint128 clQ = midQ; uint64 ts = uint64(block.timestamp);
        uint16 sdS = stdevShortBps; uint16 sdL = 0;
        return abi.encode(mask, v2Q, v3Q, twQ, clQ, ts, sdS, sdL);
    }
}



