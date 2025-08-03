// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract TestInventories {
    /*//////////////////////////////////////////////////////////////
                            STORAGE - EXACT REPLICA
    //////////////////////////////////////////////////////////////*/
    
    // Pool asset balances (poolID -> packed uint256) - BOTH ASSETS IN SINGLE SLOT!
    // Lower 128 bits = asset0, Upper 128 bits = asset1
    mapping(uint256 poolId => uint256 packedInventory) public poolInventories;

    constructor() {
        // Initialize test data - same as PoolManager poolID from comment
        // poolID 72353868998521619888681860453528528367784827584629633463205622674719133138944
        uint256 testPoolID = 72353868998521619888681860453528528367784827584629633463205622674719133138944;
        poolInventories[testPoolID] = _packInventory(1000000000000000000000, 2000000000000000000000);
        
        // Add more test pools
        poolInventories[1] = _packInventory(500000000000000000000, 750000000000000000000);
        poolInventories[2] = _packInventory(100000000000000000, 200000000000000000);
        poolInventories[3] = _packInventory(777000000000000000000, 888000000000000000000);
    }

    /*//////////////////////////////////////////////////////////////
                        EXACT ERC6909 GETINVENTORY REPLICA
    //////////////////////////////////////////////////////////////*/

    /// @notice Get current pool inventory - SINGLE STORAGE READ!
    /// @dev This is the EXACT same implementation as ERC6909.getInventory()
    function getInventory(uint256 poolId) public view returns (uint128 asset0, uint128 asset1) {
        uint256 packed = poolInventories[poolId]; // Single SLOAD!
        asset0 = uint128(packed);              // Lower 128 bits
        asset1 = uint128(packed >> 128);       // Upper 128 bits
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