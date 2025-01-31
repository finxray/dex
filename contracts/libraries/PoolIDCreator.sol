
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract PoolIDCreator {
    function createPoolID(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external pure returns (bytes32 poolID) {
        assembly {
            // Allocate memory for the hash input (asset0, asset1, quoter)
            let memPointer := mload(0x40)

            // Store asset0 at the beginning of memory
            mstore(memPointer, asset0)

            // Store asset1 immediately after asset0
            mstore(add(memPointer, 0x20), asset1)

            // Store quoter immediately after asset1
            mstore(add(memPointer, 0x40), quoter)

            // Compute the keccak256 hash of asset0, asset1, and quoter
            let hash := keccak256(memPointer, 0x60) // Hash 96 bytes (3 * 32-byte words)

            // Append markings (last 3 bytes) to the hash to form poolID
            poolID := or(and(hash, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000), markings)
        }
    }
}