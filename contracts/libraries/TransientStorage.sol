// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library TransientStorage {
    /// @notice Store data in transient storage using tstore opcode
    /// @param key Address to use as storage key
    /// @param data Bytes data to store
    function storeTransient(address key, bytes memory data) internal {
        assembly {
            // Use address as the base slot directly for transient storage
            let slot := key
            // Store the data length first
            let dataLength := mload(data)
            tstore(slot, dataLength)
            // Store data in 32-byte chunks sequentially in transient storage
            let dataPtr := add(data, 0x20)
            let chunks := div(add(dataLength, 31), 32)
            for { let i := 0 } lt(i, chunks) { i := add(i, 1) } {
                let chunkSlot := add(slot, add(i, 1))
                let chunkData := mload(add(dataPtr, mul(i, 32)))
                tstore(chunkSlot, chunkData)
            }
        }
    }

    /// @notice Load data from transient storage using tload opcode
    /// @param key Address to use as storage key
    /// @return result Bytes data retrieved from transient storage
    function loadTransient(address key) internal view returns (bytes memory result) {
        assembly {
            let slot := key
            // Load the data length first
            let dataLength := tload(slot)
            // If no data, return empty bytes
            if iszero(dataLength) {
                result := mload(0x40)
                mstore(result, 0)
                mstore(0x40, add(result, 0x20))
            }
            // If data exists, load it
            if gt(dataLength, 0) {
                // Allocate memory for result
                result := mload(0x40)
                mstore(result, dataLength)
                let resultPtr := add(result, 0x20)
                // Load data in 32-byte chunks
                let chunks := div(add(dataLength, 31), 32)
                for { let i := 0 } lt(i, chunks) { i := add(i, 1) } {
                    let chunkSlot := add(slot, add(i, 1))
                    let chunkData := tload(chunkSlot)
                    mstore(add(resultPtr, mul(i, 32)), chunkData)
                }
                // Update free memory pointer
                mstore(0x40, add(result, add(0x20, mul(chunks, 32))))
            }
        }
    }
}