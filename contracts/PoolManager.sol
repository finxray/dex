// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {Swapper} from "./Swapper.sol";
import {Pool} from "./structs/Pool.sol";
import {Delta} from "./structs/Delta.sol";
import {Inventory} from "./structs/Inventory.sol";
import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";

// ----------------- KISS -------------------- Keep it simple, stupit!----------------- KISS -------------------- Keep it simple, stupit


abstract contract PoolManager is Swapper { 
    mapping(uint256 => Pool) internal pools; 

    // function getPool(uint256 poolID) internal view override returns (Pool memory) {
    //     return pools[poolID];
    // }

    function updateInventory(uint256 poolID, Delta memory delta) internal override {
        pools[poolID].inventory = PoolManagerLib.updatedInventory(pools[poolID].inventory, delta);
    }



    // function updatePool(uint256 poolID) internal override {}

    constructor(address defaultAlpha, address defaultBeta) Swapper(defaultAlpha, defaultBeta) {}

    function addLiquidity() internal returns (uint256 shares) {}

    function removeLiquidity() internal returns (uint256 amount0, uint256 amount1) {}

}



