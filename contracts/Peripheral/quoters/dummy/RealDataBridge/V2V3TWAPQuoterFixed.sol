// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IDataBridge} from "../../../../Core/interfaces/internal/IDataBridge.sol";
import {BaseDataAdapter} from "../../adapters/BaseDataAdapter.sol";
import {UniversalDataAdapter} from "../../adapters/UniversalDataAdapter.sol";

contract V2V3TWAPQuoterFixed is IQuoter {
    error V2V3TWAPQuoterFixed__NoPriceData();
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
        
        // Get data from UniswapV2 bridge using universal adapter (guard zero/non-contract)
        UniversalDataAdapter.NormalizedPriceData memory uniV2Data = address(uniV2Bridge) != address(0) && address(uniV2Bridge).code.length > 0
            ? UniversalDataAdapter.fetchAndNormalize(uniV2Bridge, params)
            : UniversalDataAdapter.NormalizedPriceData({ spot: 0, twap: 0, timestamp: block.timestamp, isValid: false });
        if (uniV2Data.isValid) {
            // Use TWAP if available, otherwise spot
            prices[validPrices] = uniV2Data.twap > 0 ? uniV2Data.twap : uniV2Data.spot;
            validPrices++;
        }
        
        // Get data from SushiV2 bridge using universal adapter (guard zero/non-contract)
        UniversalDataAdapter.NormalizedPriceData memory sushiV2Data = address(sushiV2Bridge) != address(0) && address(sushiV2Bridge).code.length > 0
            ? UniversalDataAdapter.fetchAndNormalize(sushiV2Bridge, params)
            : UniversalDataAdapter.NormalizedPriceData({ spot: 0, twap: 0, timestamp: block.timestamp, isValid: false });
            if (sushiV2Data.isValid) {
                // Use TWAP if available, otherwise spot
                prices[validPrices] = sushiV2Data.twap > 0 ? sushiV2Data.twap : sushiV2Data.spot;
                validPrices++;
            }
        
        // Get data from V3TWAP bridge using universal adapter (guard zero/non-contract)
        UniversalDataAdapter.NormalizedPriceData memory v3twapData = address(v3twapBridge) != address(0) && address(v3twapBridge).code.length > 0
            ? UniversalDataAdapter.fetchAndNormalize(v3twapBridge, params)
            : UniversalDataAdapter.NormalizedPriceData({ spot: 0, twap: 0, timestamp: block.timestamp, isValid: false });
        if (v3twapData.isValid) {
            // Prefer TWAP over spot for V3
            prices[validPrices] = v3twapData.twap > 0 ? v3twapData.twap : v3twapData.spot;
            validPrices++;
        }
        
        if (validPrices == 0) revert V2V3TWAPQuoterFixed__NoPriceData();
        
        // Compute simple average of available prices (USDC per WETH, 1e18)
        uint256 totalPrice = 0;
        for (uint256 i = 0; i < validPrices; i++) {
            totalPrice += prices[i];
        }
        uint256 avgPrice = totalPrice / validPrices;

        // Convert USDC -> WETH using average price, no fees
        uint256 amount18 = params.amount * 1_000_000_000_000; // USDC6 -> 18
        uint256 quoteWeth = (amount18 * 1e18) / avgPrice;
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
