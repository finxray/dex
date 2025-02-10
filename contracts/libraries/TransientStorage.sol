// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

library TransientStorage {
    // Store data in transient storage (memory version)
    function storeTransient(address addr, bytes memory data) internal {
        assembly {
            // Derive collision-resistant base slot using keccak256(address)
            let baseSlot := keccak256(0, add(addr, 32))
            
            // Store length in base slot (1 tstore)
            let length := mload(data)
            tstore(baseSlot, length)
            
            // Initialize pointers
            let dataPtr := add(data, 32)  // Skip length field
            let endPtr := add(dataPtr, length)
            
            // Store chunks in optimized loop
            for { let i := 0 } lt(dataPtr, endPtr) { i := add(i, 1) } {
                tstore(
                    add(baseSlot, add(i, 1)), // Slot = baseSlot + i + 1
                    mload(dataPtr)            // Load 32-byte word from memory
                )
                dataPtr := add(dataPtr, 32) // Move to next word
            }
        }
    }

    // Retrieve data from transient storage
    function loadTransient(address addr) internal view returns (bytes memory result) {
        assembly {
            // Derive base slot using same keccak256 method
            let baseSlot := keccak256(0, add(addr, 32))
            
            // Load length from base slot
            let length := tload(baseSlot)
            
            // Handle empty case with minimal gas
            if iszero(length) {
                result := mload(0x40)
                mstore(result, 0)
                mstore(0x40, add(result, 32))
                return(result, 32)
            }
            
            // Allocate memory optimally
            result := mload(0x40)
            mstore(result, length) // Store length
            
            // Calculate chunks and update free pointer
            let chunks := add(div(length, 32), gt(mod(length, 32), 0))
            mstore(0x40, add(add(result, 32), mul(chunks, 32)))
            
            // Load chunks in assembly-optimized loop
            let destPtr := add(result, 32)
            for { let i := 0 } lt(i, chunks) { i := add(i, 1) } {
                mstore(destPtr, tload(add(baseSlot, add(i, 1))))
                destPtr := add(destPtr, 32)
            }
        }
    }
}