// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

library PoolIDHelper { 
    function poolID(address quoterAddress, uint16 bucketID, uint80 currencyID) internal pure returns (uint256 _poolID) {
        assembly {
            // Load the quoterAddress into the first 20 bytes of the poolID (left-alighed in 32 bytes) 
            _poolID := quoterAddress
            // Shift quoterAddress 12 bytes to the left to align it correctly as the higher 20 bytes 
            _poolID := shl(96, _poolID)
            _poolID := or(_poolID, shl(80, bucketID))
            _poolID := or(_poolID, currencyID)
        }
    }
}