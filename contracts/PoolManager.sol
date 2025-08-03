// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {LiquidityManager} from "./LiquidityManager.sol";
import {SwapManager} from "./SwapManager.sol";
import {Inventory} from "./structs/Inventory.sol";

contract PoolManager is LiquidityManager, SwapManager {
    constructor(address _defaultAlpha, address _defaultBeta) QuoteRequester(_defaultAlpha, _defaultBeta) {}

    event PoolCreated(uint256 indexed poolID, address asset0, address asset1, address quoter, bytes3 markings);

    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external returns (uint256 poolID) {
        // Sort assets so asset0 < asset1
        (address sortedAsset0, address sortedAsset1) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        poolID = PoolIDAssembly.assemblePoolID(sortedAsset0, sortedAsset1, quoter, markings);
        emit PoolCreated(poolID, sortedAsset0, sortedAsset1, quoter, markings);
    }

    // Inventory function - SINGLE STORAGE READ using packed struct!
    function inventory(uint256 poolID) public view override(LiquidityManager, SwapManager) returns (Inventory memory) {
        return getInventory(poolID); // Delegates to ERC6909's packed storage
    }
}