
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract TransientStorage {
    // Store dynamic bytes data in transient storage
    function storeTransient(address _key, bytes calldata data) external {
        bytes32 slotLength = keccak256(abi.encodePacked(_key, "length"));
        uint256 length = data.length;

        assembly {
            tstore(slotLength, length) // Store the length of the data
        }

        // Store data in 32-byte chunks
        for (uint256 i = 0; i < length; i += 32) {
            bytes32 slotChunk = keccak256(abi.encodePacked(_key, i));
            bytes32 chunk;
            
            assembly {
                chunk := calldataload(add(data.offset, i)) // Load 32-byte chunk from calldata
                tstore(slotChunk, chunk) // Store chunk
            }
        }
    }

    // Retrieve dynamic bytes data from transient storage
    function loadTransient(address _key) external view returns (bytes memory data) {
        bytes32 slotLength = keccak256(abi.encodePacked(_key, "length"));
        uint256 length;

        assembly {
            length := tload(slotLength) // Load stored length
        }

        if (length == 0) {
            return ""; // Return empty bytes if no data was stored
        }

        data = new bytes(length);

        // Retrieve data in 32-byte chunks and reconstruct it
        for (uint256 i = 0; i < length; i += 32) {
            bytes32 slotChunk = keccak256(abi.encodePacked(_key, i));
            bytes32 chunk;

            assembly {
                chunk := tload(slotChunk) // Load stored chunk
            }

            // Copy chunk into `data`
            for (uint256 j = 0; j < 32 && (i + j) < length; j++) {
                data[i + j] = chunk[j];
            }
        }
    }
}