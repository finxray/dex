// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Markings} from "../structs/Markings.sol";

library MarkingHelper {
    // Bit layout in bytes3 (low to high):
    // [0]=data0 [1]=data1 [2]=data2 [3]=data3 [4..15]=bucketID (12 bits) [16..19]=reserved [20..23]=extraBridgeSlot (4 bits)
    function decodeMarkings(bytes3 markings) internal pure returns (Markings memory result) {
        uint24 data = uint24(markings);
        result.data0 = (data & 0x1) != 0;
        result.data1 = ((data >> 1) & 0x1) != 0;
        result.data2 = ((data >> 2) & 0x1) != 0;
        result.data3 = ((data >> 3) & 0x1) != 0;
        result.bucketID = uint16((data >> 4) & 0xFFF);
        uint8 extra = uint8((data >> 20) & 0xF);
        result.extraBridgeSlot = extra; // 0 means none; 4..15 indicate overall slot index
        return result;
    }
}

