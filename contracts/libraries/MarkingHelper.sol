// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Marking} from "../structs/Marking.sol";

library MarkingHelper {

    function decodeMarkings(bytes3 markings) internal pure returns (Marking memory result) {
        uint24 data = uint24(markings);
        // Bit layout (LSB → MSB): isBeta(0), isAlpha(1), isAlphaDefault(2), isBetaDefault(3), alphaPtr(4..7), betaPtr(8..11), bucketID(12..23)
        result.isAlpha = ((data >> 1) & 0x1) != 0;
        result.isBeta = (data & 0x1) != 0;
        result.isAlphaDefault = ((data >> 2) & 0x1) != 0;
        result.isBetaDefault = ((data >> 3) & 0x1) != 0;
        result.alphaAddressPointer = uint8((data >> 4) & 0xF);
        result.betaAddressPointer = uint8((data >> 8) & 0xF);
        result.bucketID = uint16((data >> 12) & 0xFFF);
        return result;
    }
}

