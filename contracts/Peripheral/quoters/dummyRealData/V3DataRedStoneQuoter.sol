// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";
import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";

contract V3DataRedStoneQuoter is IQuoter {
    IDataBridge public immutable v3dataBridge;
    IDataBridge public immutable redstoneBridge;

    constructor(address _v3dataBridge, address _redstoneBridge) {
        v3dataBridge = IDataBridge(_v3dataBridge);
        redstoneBridge = IDataBridge(_redstoneBridge);
    }

    function quote(QuoteParams memory params, bytes memory) external override returns (uint256) {
        // Get data from both bridges
        bytes memory v3Data = v3dataBridge.getData(params);
        bytes memory redstoneData = redstoneBridge.getData(params);
        
        // Decode V3Data (spot, spot - no TWAP in V3Data)
        (uint256 v3Spot,) = abi.decode(v3Data, (uint256, uint256));
        
        // Decode RedStone data (spot, updatedAt)
        (uint256 rsSpot,) = abi.decode(redstoneData, (uint256, uint256));
        
        // Blend V3 spot price with RedStone price
        // Weight: 50% V3Data spot, 50% RedStone
        uint256 blendedPrice = (v3Spot + rsSpot) / 2;
        
        // Apply basic AMM calculation
        uint256 baseQuote;
        if (params.zeroForOne) {
            baseQuote = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            baseQuote = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        
        // Apply a small adjustment based on blended external price data
        uint256 adjustmentFactor = 1000; // Default no adjustment
        
        // If we have reasonable external price data, apply minor adjustment
        if (blendedPrice > 0) {
            // Apply a conservative 1.5% adjustment
            adjustmentFactor = 1015; // 1.5% premium
        }
        
        // Apply adjustment and fee (0.5%)
        baseQuote = (baseQuote * adjustmentFactor) / 1000;
        return (baseQuote * 995) / 1000;
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory) external override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        
        for (uint256 i = 0; i < params.amount.length; i++) {
            QuoteParams memory singleParams = QuoteParams({
                asset0: params.asset0,
                asset1: params.asset1,
                quoter: params.quoter,
                amount: params.amount[i],
                asset0Balance: params.asset0Balances[i],
                asset1Balance: params.asset1Balances[i],
                bucketID: params.bucketID[i],
                zeroForOne: params.zeroForOne
            });
            
            quotes[i] = this.quote(singleParams, "");
        }
    }
}
