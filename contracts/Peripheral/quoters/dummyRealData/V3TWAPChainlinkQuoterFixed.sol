// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";
import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {BaseDataAdapter} from "../adapters/BaseDataAdapter.sol";
import {UniversalDataAdapter} from "../adapters/UniversalDataAdapter.sol";

contract V3TWAPChainlinkQuoterFixed is IQuoter {
    IDataBridge public immutable v3twapBridge;
    IDataBridge public immutable chainlinkBridge;

    constructor(address _v3twapBridge, address _chainlinkBridge) {
        v3twapBridge = IDataBridge(_v3twapBridge);
        chainlinkBridge = IDataBridge(_chainlinkBridge);
    }

    function quote(QuoteParams memory params, bytes memory) external override returns (uint256) {
        // Get and normalize data from both bridges using universal adapter
        UniversalDataAdapter.NormalizedPriceData memory v3twapData = UniversalDataAdapter.fetchAndNormalize(v3twapBridge, params);
        UniversalDataAdapter.NormalizedPriceData memory chainlinkData = UniversalDataAdapter.fetchAndNormalize(chainlinkBridge, params);

        // Collect available prices (USDC per WETH, 1e18)
        uint256 totalPrice = 0;
        uint256 count = 0;
        if (v3twapData.isValid) {
            uint256 v3Price = v3twapData.twap > 0 ? v3twapData.twap : v3twapData.spot;
            totalPrice += v3Price;
            count += 1;
        }
        if (chainlinkData.isValid) {
            totalPrice += chainlinkData.spot;
            count += 1;
        }
        require(count > 0, "No price data");

        uint256 avgPrice = totalPrice / count; // USDC per WETH, 1e18

        // Convert USDC -> WETH using average price, no fees
        // amount (USDC 6dp) -> amount18 = amount * 1e12
        uint256 amount18 = params.amount * 1_000_000_000_000; // 1e12
        uint256 quoteWeth = (amount18 * 1e18) / avgPrice; // 1e18 WETH
        return quoteWeth;
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
