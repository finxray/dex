// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import {Marking} from "../structs/Marking.sol";

library MarkingsHelper {
   

    function decodeMarkings(bytes3 markings) external pure returns (Marking memory result) {

        assembly {
            // Load the first 3 bytes of the markings into a 24-bit integer
            let data := and(mload(add(markings, 0x20)), 0xFFFFFF)

            // Decode boolean values (1 bit each)
            mstore(result, and(data, 0x1))                          // isDexMarket
            mstore(add(result, 0x20), and(shr(1, data), 0x1))       // isOracleMarket
            mstore(add(result, 0x40), and(shr(2, data), 0x1))       // isDexDefault
            mstore(add(result, 0x60), and(shr(3, data), 0x1))       // isOracleDefault

            // Decode 4-bit dexStorageAddress
            mstore(add(result, 0x80), and(shr(4, data), 0xF))

            // Decode 4-bit oracleStorageAddress
            mstore(add(result, 0xA0), and(shr(8, data), 0xF))

            // Decode 12-bit bucketID
            mstore(add(result, 0xC0), and(shr(12, data), 0xFFF))
        }

        return result;
    }
    
}

