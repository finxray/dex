// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Markings} from "../structs/Markings.sol";

library MarkingHelper {
    // New simple bit layout: [bucketID (12 bits)] [data3 (1)] [data2 (1)] [data1 (1)] [data0 (1)]
    // We decode into booleans for data0..data3 and bucketID
    function decodeMarkings(bytes3 markings) internal pure returns (Markings memory result) {
        uint24 data = uint24(markings);
        result.data0 = (data & 0x1) != 0;
        result.data1 = ((data >> 1) & 0x1) != 0;
        result.data2 = ((data >> 2) & 0x1) != 0;
        result.data3 = ((data >> 3) & 0x1) != 0;
        result.bucketID = uint16((data >> 4) & 0xFFF);
        return result;
    }
}

