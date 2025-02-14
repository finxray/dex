// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {MarkingHelper} from "./libraries/MarkingHelper.sol"; 


import {SwapParams} from "./structs/SwapParams.sol";
import {SwapParamsInternal} from "./structs/SwapParams.sol";
import {QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";
import {Inventory} from "./structs/Inventory.sol";
import {Pool} from "./structs/Pool.sol";

import {Marking} from "./structs/Marking.sol";


abstract contract PoolManager is ERC6909Claims, QuoteRequester { 
    mapping(uint256 => Pool) public pools;
    
    constructor(address _defaultDexMarketAddress, address _defaultOracleMarketAddress) QuoteRequester(_defaultDexMarketAddress, _defaultOracleMarketAddress) {}

    function completeSwapParams(SwapParams[] calldata p) public returns (bool success) {
        
    }
    // QuoteBatch are used to save gas on obtaining quotes. After quotes are received normal swap for each pool is done. 

    function _completeSwapParams(SwapParams calldata p) private returns (bool success) {
        if (p.markings.length == 1) {
            uint256 quote = quote(p);
        } else if (p.markings.length > 1) {
            uint256[] memory batchQuote = quoteBatch(p);
        } else {
            // Error goes heare
        }
    }

    /// @notice Converts swap parameters into `SwapParamsInternal`.
    /// @param amount The amount of assetIn.
    /// @param zeroForOne Whether the swap is from asset0 to asset1.
    /// @param quote The quote for the swap.
    /// @return internalParams The `SwapParamsInternal` struct.
    function prepareSwapParams(
        uint256 amount,
        bool zeroForOne,
        uint256 quote
    ) internal pure returns (SwapParamsInternal memory internalParams) {
        // Calculate delta0 and delta1 based on the swap direction
        if (zeroForOne) {
            // Swap asset0 for asset1: delta0 = +amountIn, delta1 = -amountOut
            internalParams.delta0 = int256(amount);
            internalParams.delta1 = -int256(amount * quote);
        } else {
            // Swap asset1 for asset0: delta1 = +amountIn, delta0 = -amountOut
            internalParams.delta1 = int256(amount);
            internalParams.delta0 = -int256(amount * quote);
        }
    }

    /// @notice Executes a swap using `SwapParamsInternal`.
    /// @param internalParams The internal swap parameters.
    function executeSwap(SwapParamsInternal memory internalParams) internal {
        Pool storage pool = pools[internalParams.poolID];

        // Validate the swap
        _validateSwap(pool, internalParams);

        // Execute the swap
        _executeTransfers(internalParams);

        // Update the pool's inventory
        _updateInventory(pool, internalParams);
    }

    function _validateSwap(Pool storage pool, SwapParamsInternal memory internalParams) private view {
        // Ensure the pool has sufficient liquidity for the swap
        if (internalParams.delta0 < 0) {
            require(uint256(-internalParams.delta0) <= pool.inventory0, "Insufficient asset0");
        }
        if (internalParams.delta1 < 0) {
            require(uint256(-internalParams.delta1) <= pool.inventory1, "Insufficient asset1");
        }
    }

    function _executeTransfers(SwapParamsInternal memory internalParams) private {
        if (internalParams.delta0 > 0) {
            // Transfer asset0 into the pool
            transferFrom(msg.sender, address(this), internalParams.poolID, uint256(internalParams.delta0));
        } else if (internalParams.delta0 < 0) {
            // Transfer asset0 out of the pool
            transfer(msg.sender, internalParams.poolID, uint256(-internalParams.delta0));
        }

        if (internalParams.delta1 > 0) {
            // Transfer asset1 into the pool
            transferFrom(msg.sender, address(this), internalParams.poolID, uint256(internalParams.delta1));
        } else if (internalParams.delta1 < 0) {
            // Transfer asset1 out of the pool
            transfer(msg.sender, internalParams.poolID, uint256(-internalParams.delta1));
        }
    }

    function _updateInventory(Pool storage pool, SwapParamsInternal memory internalParams) private {
        if (internalParams.delta0 > 0) {
            pool.inventory0 += uint128(uint256(internalParams.delta0));
        } else if (internalParams.delta0 < 0) {
            pool.inventory0 -= uint128(uint256(-internalParams.delta0));
        }

        if (internalParams.delta1 > 0) {
            pool.inventory1 += uint128(uint256(internalParams.delta1));
        } else if (internalParams.delta1 < 0) {
            pool.inventory1 -= uint128(uint256(-internalParams.delta1));
        }
    }


    // function inventory(bytes32 poolID) public pure override  returns (Inventory memory) {
    //     // Dummy function. Replace with proper implementation
    //     Inventory memory _inventory = Inventory({
    //         inventory0: 250,
    //         inventory1: 1246
    //     }); 
    //     return _inventory;
    // } 


    /// @dev The actual implementation will be provided later.
    function addLiquidity() internal returns (uint256 shares) {}

    /// @notice Removes liquidity from the pool and returns the amounts of asset0 and asset1 withdrawn.
    /// @dev The actual implementation will be provided later.
    function removeLiquidity() internal returns (uint256 amount0, uint256 amount1) {}

}



