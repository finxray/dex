// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

library PoolIDHelper { 
    function poolID(address quoterAddress, uint16 bucketID, uint80 currencyID) internal pure returns (uint256 poolID) {
        assembly {
            // Load the quoterAddress into the first 20 bytes of the poolID (left-alighed in 32 bytes) 
            poolID := quoterAddress
            // Shift quoterAddress 12 bytes to the left to align it correctly as the higher 20 bytes 
            poolID := shl(96, poolID)
            poolID := or(poolID, shl(80, bucketID))
            poolID := or(poolID, currencyID)
        }
    }
}