// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {FixedPoint64x64} from "../../libraries/FixedPoint64x64.sol";

/// @title MockStoixDataBridge
/// @notice Returns hardcoded Q64.64 values based on flags in bucketID upper bits.
contract MockStoixDataBridge is IDataBridge {
    using FixedPoint64x64 for uint128;

    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        uint8 flags = params.functionFlags;
        uint8 mask = 0;
        uint128 v2Q=0; uint128 v3Q=0; uint128 twQ=0; uint128 clQ=0; uint64 ts=0; uint16 sdS=0; uint16 sdL=0;
        if ((flags & 0x01) != 0) { mask |= 0x01; v2Q = FixedPoint64x64.fromFraction(4200 ether, 1 ether); }
        if ((flags & 0x02) != 0) { mask |= 0x02; v3Q = FixedPoint64x64.fromFraction(4300 ether, 1 ether); }
        if ((flags & 0x04) != 0) { mask |= 0x04; twQ = FixedPoint64x64.fromFraction(4250 ether, 1 ether); }
        // Chainlink optimization: generate price and timestamp together if either is requested
        if ((flags & 0x18) != 0) { // 0x08 (price) OR 0x10 (timestamp)
            uint128 clPrice = FixedPoint64x64.fromFraction(4280 ether, 1 ether);
            uint64 clTimestamp = uint64(block.timestamp);
            if ((flags & 0x08) != 0) { mask |= 0x08; clQ = clPrice; }
            if ((flags & 0x10) != 0) { mask |= 0x10; ts = clTimestamp; }
        }
        if ((flags & 0x20) != 0) { mask |= 0x20; sdS = 80; }
        if ((flags & 0x40) != 0) { mask |= 0x40; sdL = 200; }
        return abi.encode(mask, v2Q, v3Q, twQ, clQ, ts, sdS, sdL);
    }
}


