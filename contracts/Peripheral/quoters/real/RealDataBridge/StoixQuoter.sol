// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Q64x64PriceMath} from "../../../libraries/Q64x64PriceMath.sol";

/// @title Stoix Quoter (Q64.64-aware)
/// @notice Decodes consolidated StoixDataBridge payload (dx) and computes amountOut using Q64.64 prices
contract StoixQuoter is IQuoter {
    using Q64x64PriceMath for uint256;

    function quote(QuoteParams memory params, bytes memory data) external view override returns (uint256) {
        // data is (d0,d1,d2,d3,dx); StoixDataBridge payload is in dx
        (, , , , bytes memory dx) = abi.decode(data, (bytes, bytes, bytes, bytes, bytes));
        if (dx.length == 0) return 0;
        (uint8 mask, uint128 v2Q, uint128 v3Q, uint128 twQ, uint128 clQ, , , ) = abi.decode(dx, (uint8,uint128,uint128,uint128,uint128,uint64,uint16,uint16));

        // Aggregate available Q64.64 prices (simple average for now)
        uint256 sumQ = 0; uint256 n = 0;
        if ((mask & 0x01) != 0 && v2Q > 0) { sumQ += v2Q; n++; }
        if ((mask & 0x02) != 0 && v3Q > 0) { sumQ += v3Q; n++; }
        if ((mask & 0x04) != 0 && twQ > 0) { sumQ += twQ; n++; }
        if ((mask & 0x08) != 0 && clQ > 0) { sumQ += clQ; n++; }
        if (n == 0) return 0;
        uint128 avgQ = uint128(sumQ / n);

        // Fetch decimals once per pair (no hardcoding)
        uint8 decIn = IERC20Metadata(params.zeroForOne ? params.asset0 : params.asset1).decimals();
        uint8 decOut = IERC20Metadata(params.zeroForOne ? params.asset1 : params.asset0).decimals();

        // Convert input amount to output using Q64.64 price
        return Q64x64PriceMath.amountOutFromQ64(params.amount, decIn, decOut, avgQ, params.zeroForOne);
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            QuoteParams memory single = QuoteParams({
                asset0: params.asset0,
                asset1: params.asset1,
                quoter: params.quoter,
                amount: params.amount[i],
                asset0Balance: params.asset0Balances[i],
                asset1Balance: params.asset1Balances[i],
                bucketID: params.bucketID[i],
                zeroForOne: params.zeroForOne,
                functionFlags: params.functionFlags
            });
            quotes[i] = this.quote(single, data);
        }
    }
}