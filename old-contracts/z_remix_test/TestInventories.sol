// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC6909Extended} from "../ERC6909Extended.sol";

contract TestInventories is ERC6909Extended {

    constructor() {
        // Initialize test data - same as PoolManager poolID from comment
        // Updated poolID from PoolManager comment
        uint256 testPoolID = 42955307580170980946467815337668002166680498660974576864971747189779899351040;
        poolInventories[testPoolID] = _packInventory(1000000000000000000000, 2000000000000000000000);
        
        // Add more test pools
        poolInventories[1] = _packInventory(500000000000000000000, 750000000000000000000);
        poolInventories[2] = _packInventory(100000000000000000, 200000000000000000);
        poolInventories[3] = _packInventory(777000000000000000000, 888000000000000000000);
    }

    /*//////////////////////////////////////////////////////////////
                            TESTING HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Set inventory for testing purposes
    function setInventory(uint256 poolId, uint128 asset0, uint128 asset1) public {
        poolInventories[poolId] = _packInventory(asset0, asset1);
    }

    /// @notice Get multiple inventories (for warm vs cold testing)
    function getMultipleInventories(uint256[] memory poolIds) public view returns (uint128[] memory asset0s, uint128[] memory asset1s) {
        asset0s = new uint128[](poolIds.length);
        asset1s = new uint128[](poolIds.length);
        for (uint256 i = 0; i < poolIds.length; i++) {
            (asset0s[i], asset1s[i]) = getInventory(poolIds[i]); // Each call is SLOAD operation
        }
    }

    /// @notice Get only asset0 from inventory (for comparison)
    function getAsset0Only(uint256 poolId) public view returns (uint128) {
        uint256 packed = poolInventories[poolId]; // Single SLOAD
        return uint128(packed); // Lower 128 bits = asset0
    }

    /// @notice Get both assets separately (for comparison)
    function getBothAssetsSeparately(uint256 poolId) public view returns (uint128 asset0, uint128 asset1) {
        return getInventory(poolId); // Same as getInventory now!
    }

    /// @notice Pack two uint128 values into a single uint256
    function _packInventory(uint128 asset0, uint128 asset1) private pure returns (uint256) {
        return uint256(asset0) | (uint256(asset1) << 128);
    }
}