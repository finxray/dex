
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Delta} from "../structs/Delta.sol";
import {Inventory} from "../structs/Inventory.sol";

library PoolManagerLib {
    function updatedInventory(Inventory storage self, Delta memory delta) internal pure returns (Inventory memory) {
        // Load the entire Inventory struct into memory
        Inventory memory inventory = self;

        // Update asset0 in memory
        if (delta.asset0 != 0) {
            inventory.asset0 = updateAsset(inventory.asset0, delta.asset0);
        }

        // Update asset1 in memory
        if (delta.asset1 != 0) {
            inventory.asset1 = updateAsset(inventory.asset1, delta.asset1);
        }

        // Write the updated Inventory struct back to storage
        return inventory;
    }

    function updateAsset(uint128 asset, int256 delta) private pure returns (uint128) {
        if (delta > 0) {
            return asset + uint128(uint256(delta));
        } else if (delta < 0) {
            return asset - uint128(uint256(-delta));
        }
        return asset; // No change if delta is 0
    }
}