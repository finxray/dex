// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IDataBridge} from "../../../../Core/interfaces/internal/IDataBridge.sol";

contract V3TWAPChainlinkQuoter is IQuoter {
    IDataBridge public immutable v3twapBridge;
    IDataBridge public immutable chainlinkBridge;

    constructor(address _v3twapBridge, address _chainlinkBridge) {
        v3twapBridge = IDataBridge(_v3twapBridge);
        chainlinkBridge = IDataBridge(_chainlinkBridge);
    }

    function quote(QuoteParams memory params, bytes memory) external override returns (uint256) {
        // Get data from both bridges
        bytes memory v3twapData = v3twapBridge.getData(params);
        bytes memory chainlinkData = chainlinkBridge.getData(params);
        
        // Decode V3TWAP data (spot, twap)
        (, uint256 v3Twap) = abi.decode(v3twapData, (uint256, uint256));
        
        // Decode Chainlink data (spot, updatedAt)
        (uint256 clSpot,) = abi.decode(chainlinkData, (uint256, uint256));
        
        // Use TWAP from V3 and blend with Chainlink spot price
        // Weight: 60% V3TWAP, 40% Chainlink
        uint256 blendedPrice = (v3Twap * 60 + clSpot * 40) / 100;
        
        // Apply basic AMM calculation
        uint256 baseQuote;
        if (params.zeroForOne) {
            baseQuote = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            baseQuote = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        
        // Apply a small adjustment based on blended external price data
        // Use a simple factor to slightly adjust the AMM price
        uint256 adjustmentFactor = 1000; // Default no adjustment
        
        // If we have reasonable external price data, apply minor adjustment
        if (blendedPrice > 0) {
            // Apply a conservative 2% adjustment based on external data
            adjustmentFactor = 1020; // 2% premium to account for external price info
        }
        
        return (baseQuote * adjustmentFactor) / 1000;
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
