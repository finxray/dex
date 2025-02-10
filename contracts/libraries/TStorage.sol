// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

library TransientStorage {
    // Store data in transient storage (TSTORE)
    function storeTransient(address addr, bytes calldata data) internal {
        assembly {
            // Convert address to transient storage slot (baseSlot)
            let baseSlot := shl(96, addr) // Pack address into bytes32
            
            // Store data length in baseSlot
            tstore(baseSlot, data.length)
            
            // Store data chunks in consecutive slots (baseSlot+1, baseSlot+2, ...)
            let dataPtr := data.offset
            let endPtr := add(dataPtr, data.length)
            
            for { let i := 0 } lt(dataPtr, endPtr) { i := add(i, 1) } {
                tstore(add(baseSlot, add(i, 1)), calldataload(dataPtr))
                dataPtr := add(dataPtr, 32)
            }
        }
    }

    // Retrieve data from transient storage (TLOAD)
    function loadTransient(address addr) internal view returns (bytes memory) {
        bytes memory result;
        
        assembly {
            // Convert address to transient storage slot (baseSlot)
            let baseSlot := shl(96, addr)
            
            // Load data length from baseSlot
            let length := tload(baseSlot)
            
            // Allocate memory for result
            result := mload(0x40)
            mstore(result, length)
            
            // Load data chunks from consecutive slots
            let chunks := add(div(length, 32), gt(mod(length, 32), 0))
            let destPtr := add(result, 32)
            
            for { let i := 0 } lt(i, chunks) { i := add(i, 1) } {
                mstore(destPtr, tload(add(baseSlot, add(i, 1))))
                destPtr := add(destPtr, 32)
            }
            
            // Update free memory pointer
            mstore(0x40, add(add(result, 32), mul(chunks, 32)))
        }
        
        return result;
    }
}