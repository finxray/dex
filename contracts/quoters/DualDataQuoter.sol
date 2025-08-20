// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../structs/QuoteParams.sol";

/// @title DualDataQuoter
/// @notice A quoter that requires both alpha and beta market data for sophisticated pricing
/// @dev This is a skeleton implementation with dummy logic - real pricing logic will be added later
contract DualDataQuoter is IQuoter {
    // execution cost around 16,000 gas
    /// @notice Calculate quote using both alpha and beta market data
    function quote(
        QuoteParams memory params, 
        bytes memory bothData
    ) external pure override returns (uint256 quote) {
        // For simplicity in this refactor, expect concatenated (alphaSpot, alphaTwap, betaSpot)
        // If only alpha is present, decode two; if both, try three.
        bytes memory alphaBytes;
        bytes memory betaBytes;
        if (bothData.length >= 64) {
            (alphaBytes, betaBytes) = abi.decode(bothData, (bytes, bytes));
        } else {
            // tolerate legacy: bothData could be concatenated; treat as alpha-only
            alphaBytes = bothData;
            betaBytes = "";
        }
        uint256 alphaSpotPrice = 0;
        uint256 alphaTwapPrice = 0;
        uint256 betaSpotPrice = 0;
        if (alphaBytes.length > 0) {
            // Accept either (spot, twap) or (spots[], twaps[])
            if (alphaBytes.length == 64) {
                (alphaSpotPrice, alphaTwapPrice) = abi.decode(alphaBytes, (uint256, uint256));
            } else {
                (uint256[] memory spots, uint256[] memory twaps) = abi.decode(alphaBytes, (uint256[], uint256[]));
                alphaSpotPrice = (spots[0] + spots[1] + spots[2]) / 3;
                alphaTwapPrice = (twaps[0] + twaps[1] + twaps[2]) / 3;
            }
        }
        if (betaBytes.length > 0) {
            if (betaBytes.length == 32) {
                betaSpotPrice = abi.decode(betaBytes, (uint256));
            } else {
                uint256[] memory spots = abi.decode(betaBytes, (uint256[]));
                betaSpotPrice = spots[0];
            }
        }
        if (alphaSpotPrice == 0 || alphaTwapPrice == 0) {
            // Fallback to simple proportion if no data
            if (params.zeroForOne) {
                return (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount) * 997 / 1000;
            } else {
                return (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount) * 997 / 1000;
            }
        }
        if (betaSpotPrice == 0) betaSpotPrice = alphaSpotPrice;
        uint256 spread = alphaSpotPrice > betaSpotPrice ? 
            alphaSpotPrice - betaSpotPrice : 
            betaSpotPrice - alphaSpotPrice;
        uint256 basePrice = (alphaTwapPrice * 40 + alphaSpotPrice * 35 + betaSpotPrice * 25) / 100;
        uint256 spreadPenalty = (spread * 1000) / basePrice; // basis points
        uint256 adjustedPrice = basePrice * (10000 - spreadPenalty) / 10000;
        if (params.zeroForOne) {
            quote = (params.amount * adjustedPrice) / 1e18;
        } else {
            quote = (params.amount * 1e18) / adjustedPrice;
        }
        // Fee
        quote = (quote * 995) / 1000;
    }

    /// @notice Calculate quotes for multiple swaps using both alpha and beta market data
    function quoteBatch(
        QuoteParamsBatch memory params, 
        bytes memory bothData
    ) external pure override returns (uint256[] memory quotes) {
        bytes memory alphaBytes;
        bytes memory betaBytes;
        if (bothData.length >= 64) {
            (alphaBytes, betaBytes) = abi.decode(bothData, (bytes, bytes));
        } else {
            alphaBytes = bothData;
            betaBytes = "";
        }
        uint256 alphaSpotPrice = 0;
        uint256 alphaTwapPrice = 0;
        uint256 betaSpotPrice = 0;
        if (alphaBytes.length > 0) {
            if (alphaBytes.length == 64) {
                (alphaSpotPrice, alphaTwapPrice) = abi.decode(alphaBytes, (uint256, uint256));
            } else {
                (uint256[] memory spots, uint256[] memory twaps) = abi.decode(alphaBytes, (uint256[], uint256[]));
                alphaSpotPrice = (spots[0] + spots[1] + spots[2]) / 3;
                alphaTwapPrice = (twaps[0] + twaps[1] + twaps[2]) / 3;
            }
        }
        if (betaBytes.length > 0) {
            if (betaBytes.length == 32) {
                betaSpotPrice = abi.decode(betaBytes, (uint256));
            } else {
                uint256[] memory spots = abi.decode(betaBytes, (uint256[]));
                betaSpotPrice = spots[0];
            }
        }
        if (alphaSpotPrice == 0 || alphaTwapPrice == 0) {
            uint256[] memory out = new uint256[](params.amount.length);
            for (uint256 i = 0; i < params.amount.length; i++) {
                if (params.zeroForOne) {
                    out[i] = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]) * 997 / 1000;
                } else {
                    out[i] = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]) * 997 / 1000;
                }
            }
            return out;
        }
        if (betaSpotPrice == 0) betaSpotPrice = alphaSpotPrice;
        uint256 spread = alphaSpotPrice > betaSpotPrice ? 
            alphaSpotPrice - betaSpotPrice : 
            betaSpotPrice - alphaSpotPrice;
        uint256 basePrice = (alphaTwapPrice * 40 + alphaSpotPrice * 35 + betaSpotPrice * 25) / 100;
        uint256 spreadPenalty = (spread * 1000) / basePrice;
        uint256 adjustedPrice = basePrice * (10000 - spreadPenalty) / 10000;
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            if (params.zeroForOne) {
                quotes[i] = (params.amount[i] * adjustedPrice) / 1e18;
            } else {
                quotes[i] = (params.amount[i] * 1e18) / adjustedPrice;
            }
            quotes[i] = (quotes[i] * 995) / 1000;
        }
    }
}