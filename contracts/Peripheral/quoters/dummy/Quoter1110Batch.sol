// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";

// Requires d0,d1,d2; varies quotes by bucketID to exercise batch logic
contract Quoter1110Batch is IQuoter {
    function quote(QuoteParams memory params, bytes memory routed) external pure override returns (uint256) {
        (bytes memory d0, bytes memory d1, bytes memory d2, ) = abi.decode(routed, (bytes, bytes, bytes, bytes));
        uint256 weight = (d0.length > 0 ? 1 : 0) + (d1.length > 0 ? 1 : 0) + (d2.length > 0 ? 1 : 0);
        uint256 base;
        if (params.zeroForOne) {
            base = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            base = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        uint256 factor = 995 + weight; // slight improvement when data present
        return (base * factor) / 1000;
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory routed) external pure override returns (uint256[] memory quotes) {
        (bytes memory d0, bytes memory d1, bytes memory d2, ) = abi.decode(routed, (bytes, bytes, bytes, bytes));
        uint256 weight = (d0.length > 0 ? 1 : 0) + (d1.length > 0 ? 1 : 0) + (d2.length > 0 ? 1 : 0);
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            uint256 base;
            if (params.zeroForOne) {
                base = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]);
            } else {
                base = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]);
            }
            uint256 bucketFactor = (params.bucketID[i] % 10) + 1; // 1..10
            uint256 factor = (1000 + weight) * bucketFactor / 10; // scale by bucket
            quotes[i] = (base * factor) / 1000;
        }
    }
}


