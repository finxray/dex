// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IDataBridge} from "../../../../Core/interfaces/internal/IDataBridge.sol";
import {BaseDataAdapter} from "../../adapters/BaseDataAdapter.sol";
import {UniversalDataAdapter} from "../../adapters/UniversalDataAdapter.sol";

contract V3DataRedStoneQuoterFixed is IQuoter {
    error V3DataRedStoneQuoterFixed__NoPriceData();
    IDataBridge public immutable v3dataBridge;
    IDataBridge public immutable redstoneBridge;

    constructor(address _v3dataBridge, address _redstoneBridge) {
        v3dataBridge = IDataBridge(_v3dataBridge);
        redstoneBridge = IDataBridge(_redstoneBridge);
    }

    function quote(QuoteParams memory params, bytes memory) external override returns (uint256) {
        // Get and normalize data from both bridges using universal adapter
        UniversalDataAdapter.NormalizedPriceData memory v3dataData = UniversalDataAdapter.fetchAndNormalize(v3dataBridge, params);
        UniversalDataAdapter.NormalizedPriceData memory redstoneData = UniversalDataAdapter.fetchAndNormalize(redstoneBridge, params);

        uint256 totalPrice = 0;
        uint256 count = 0;
        if (v3dataData.isValid) { totalPrice += v3dataData.spot; count += 1; }
        if (redstoneData.isValid) { totalPrice += redstoneData.spot; count += 1; }
        if (count == 0) revert V3DataRedStoneQuoterFixed__NoPriceData();
        uint256 avgPrice = totalPrice / count; // USDC per WETH, 1e18

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
