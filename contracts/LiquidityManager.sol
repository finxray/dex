// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC6909} from "./ERC6909.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {AssetTransferLib} from "./libraries/AssetTransferLib.sol";
import {Delta} from "./structs/Delta.sol";

// Clean abstract contract inheriting ERC6909 directly
abstract contract LiquidityManager is ERC6909, QuoteRequester {
    // Total liquidity (shares) issued per pool
    mapping(uint256 => uint256) public totalLiquidity;

    // Add liquidity to a pool. LP can add asset0, asset1, or both. Mints liquidity shares.
    function addLiquidity(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1
    ) external payable returns (uint256 liquidity) {
        // Get current pool balances BEFORE adding new liquidity
        (uint128 poolAsset0, uint128 poolAsset1) = inventory(poolID);
        
        // Calculate rate and values
        uint256 rate = dummyQuoter(asset0, asset1); // asset0/asset1 rate, 1e18 fixed point
        uint256 valueAdded = amount0 + (amount1 * rate) / 1e18;
        uint256 poolValue = poolAsset0 + (poolAsset1 * rate) / 1e18;

        // Transfer in assets - ETH is always asset0 (since asset0 < asset1 and ETH = address(0))
        if (amount0 > 0) {
            AssetTransferLib.transferIn(asset0, msg.sender, amount0, msg.value);
        }
        if (amount1 > 0) {
            AssetTransferLib.transferIn(asset1, msg.sender, amount1, 0); // No ETH for asset1
        }

        // Update pool inventory with added liquidity (single storage operation!)
        Delta memory liquidityDelta = Delta({
            asset0: int128(uint128(amount0)),
            asset1: int128(uint128(amount1))
        });
        updateInventory(poolID, liquidityDelta);

        // Calculate shares to mint
        if (totalLiquidity[poolID] == 0 || poolValue == 0) {
            // First liquidity provider or empty pool: 1:1 value to shares
            liquidity = valueAdded;
        } else {
            // Proportional to pool
            liquidity = (valueAdded * totalLiquidity[poolID]) / poolValue;
        }
        require(liquidity > 0, "Insufficient liquidity minted");
        // Mint liquidity shares to LP (msg.sender), using poolID as the share token id
        _mint(msg.sender, poolID, liquidity);
        totalLiquidity[poolID] += liquidity;
        return liquidity;
    }

    // Remove liquidity from a pool. LP burns shares and receives proportional assets.
    function removeLiquidity(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 liquidity
    ) external returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "Invalid liquidity amount");
        // Balance check will be done in _burn function
        
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = inventory(poolID);
        require(totalLiquidity[poolID] > 0, "No liquidity in pool");
        
        // Calculate proportional amounts to withdraw
        amount0 = (liquidity * poolAsset0) / totalLiquidity[poolID];
        amount1 = (liquidity * poolAsset1) / totalLiquidity[poolID];
        require(amount0 > 0 || amount1 > 0, "Insufficient assets to withdraw");
        
        // Burn liquidity shares from LP
        _burn(msg.sender, poolID, liquidity);
        totalLiquidity[poolID] -= liquidity;
        
        // Update pool inventory with removed liquidity (single storage operation!)
        Delta memory liquidityDelta = Delta({
            asset0: -int128(uint128(amount0)),
            asset1: -int128(uint128(amount1))
        });
        updateInventory(poolID, liquidityDelta);

        // Transfer assets out to LP
        if (amount0 > 0) {
            AssetTransferLib.transferOut(asset0, msg.sender, amount0);
        }
        if (amount1 > 0) {
            AssetTransferLib.transferOut(asset1, msg.sender, amount1);
        }
        
        return (amount0, amount1);
    }

    // Virtual inventory function - to be implemented by concrete contracts
    function inventory(uint256 poolID) public view virtual override returns (uint128 asset0, uint128 asset1);
}