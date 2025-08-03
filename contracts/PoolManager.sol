// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {LiquidityManager} from "./LiquidityManager.sol";
import {SwapManager} from "./SwapManager.sol";

contract PoolManager is LiquidityManager, SwapManager {
    constructor(address _defaultAlpha, address _defaultBeta) QuoteRequester(_defaultAlpha, _defaultBeta) {}

    event PoolCreated(uint256 indexed poolID, address asset0, address asset1, address quoter, bytes3 markings);

    // execution cost 4,358 gas, transaction cost 26,690
    // poolID 72353868998521619888681860453528528367784827584629633463205622674719133138944
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
    // execution cost should now be ~2,800 gas (struct overhead eliminated!)
    // Inventory function - SINGLE STORAGE READ with direct uint128 return!
    function inventory(uint256 poolID) public view override(LiquidityManager, SwapManager) returns (uint128 asset0, uint128 asset1) {
        return getInventory(poolID); // Delegates to ERC6909's packed storage
    }
}