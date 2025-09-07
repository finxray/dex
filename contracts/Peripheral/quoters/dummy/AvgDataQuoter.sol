// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";

// A simple quoter that averages prices from enabled data bridges
// and computes a constant-product-style quote using that price.
// Expected routed format: abi.encode(bytes[] bridgeData)
// bridge indices:
// 0: UniswapV3 Spot, 1: UniswapV3 TWAP, 2: UniswapV2, 3: Redstone raw (ignored), 4: Chainlink (dx)
contract AvgDataQuoter is IQuoter {
    function quote(QuoteParams memory params, bytes memory data) external pure override returns (uint256) {
        bytes[] memory bridgeData = abi.decode(data, (bytes[]));

        uint256 sumPrice; // USDC per WETH, 1e18
        uint256 numSources;

        // Helper to try decode (uint256 price, uint256 ts)
        for (uint256 i = 0; i < bridgeData.length && i < 5; i++) {
            if (i == 3) continue; // ignore Redstone raw here
            bytes memory bd = bridgeData[i];
            if (bd.length >= 64) {
                (uint256 p,) = abi.decode(bd, (uint256, uint256));
                if (p > 0) {
                    sumPrice += p;
                    numSources += 1;
                }
            }
        }

        // Fallback to 1e18 if no sources (should not happen in this test)
        uint256 avgPrice = numSources > 0 ? sumPrice / numSources : 1e18;

        uint256 q;
        if (params.zeroForOne) {
            // WETH -> USDC
            q = (params.amount * avgPrice) / 1e18;
        } else {
            // USDC -> WETH
            q = (params.amount * 1e18) / avgPrice;
        }
        return q;
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external pure override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            // Reuse single-source logic by decoding once; minimal batch support for interface compliance
            bytes[] memory bridgeData = abi.decode(data, (bytes[]));
            uint256 sumPrice;
            uint256 numSources;
            for (uint256 j = 0; j < bridgeData.length && j < 5; j++) {
                if (j == 3) continue;
                bytes memory bd = bridgeData[j];
                if (bd.length >= 64) {
                    (uint256 p,) = abi.decode(bd, (uint256, uint256));
                    if (p > 0) { sumPrice += p; numSources += 1; }
                }
            }
            uint256 avgPrice = numSources > 0 ? sumPrice / numSources : 1e18;
            if (params.zeroForOne) {
                quotes[i] = (params.amount[i] * avgPrice) / 1e18;
            } else {
                quotes[i] = (params.amount[i] * 1e18) / avgPrice;
            }
        }
    }
}


