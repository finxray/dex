// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";
import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";

contract V2V3TWAPQuoter is IQuoter {
    IDataBridge public immutable uniV2Bridge;
    IDataBridge public immutable sushiV2Bridge;
    IDataBridge public immutable v3twapBridge;

    constructor(address _uniV2Bridge, address _sushiV2Bridge, address _v3twapBridge) {
        uniV2Bridge = IDataBridge(_uniV2Bridge);
        sushiV2Bridge = IDataBridge(_sushiV2Bridge);
        v3twapBridge = IDataBridge(_v3twapBridge);
    }

    function quote(QuoteParams memory params, bytes memory) external override returns (uint256) {
        uint256[] memory prices = new uint256[](3);
        uint256 validPrices = 0;
        
        // Try to get data from UniswapV2 bridge
        try uniV2Bridge.getData(params) returns (bytes memory uniV2Data) {
            (uint256 v2Spot, uint256 v2Twap) = abi.decode(uniV2Data, (uint256, uint256));
            // Use TWAP if available, otherwise spot
            prices[validPrices] = v2Twap > 0 ? v2Twap : v2Spot;
            validPrices++;
        } catch {
            // UniV2 data not available, continue
        }
        
        // Try to get data from SushiV2 bridge
        try sushiV2Bridge.getData(params) returns (bytes memory sushiV2Data) {
            (uint256 sushiSpot,) = abi.decode(sushiV2Data, (uint256, uint256));
            prices[validPrices] = sushiSpot;
            validPrices++;
        } catch {
            // SushiV2 data not available, continue
        }
        
        // Try to get data from V3TWAP bridge
        try v3twapBridge.getData(params) returns (bytes memory v3twapData) {
            (uint256 v3Spot, uint256 v3Twap) = abi.decode(v3twapData, (uint256, uint256));
            // Prefer TWAP over spot for V3
            prices[validPrices] = v3Twap > 0 ? v3Twap : v3Spot;
            validPrices++;
        } catch {
            // V3TWAP data not available, continue
        }
        
        require(validPrices > 0, "No price data available");
        
        // Calculate weighted average of available prices
        uint256 totalPrice = 0;
        for (uint256 i = 0; i < validPrices; i++) {
            totalPrice += prices[i];
        }
        uint256 avgPrice = totalPrice / validPrices;
        
        // Apply basic AMM calculation
        uint256 baseQuote;
        if (params.zeroForOne) {
            baseQuote = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            baseQuote = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        
        // Apply adjustment based on number of data sources and external price data
        uint256 adjustmentFactor = 1000; // Default no adjustment
        
        if (validPrices > 0 && avgPrice > 0) {
            // Apply adjustment based on number of data sources
            if (validPrices >= 3) {
                adjustmentFactor = 1030; // 3% premium for 3+ sources
            } else if (validPrices == 2) {
                adjustmentFactor = 1020; // 2% premium for 2 sources
            } else {
                adjustmentFactor = 1010; // 1% premium for 1 source
            }
        }
        
        // Apply fee based on number of data sources (more sources = lower fee)
        uint256 feeRate = validPrices >= 3 ? 998 : (validPrices == 2 ? 996 : 994);
        baseQuote = (baseQuote * adjustmentFactor) / 1000;
        return (baseQuote * feeRate) / 1000;
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
