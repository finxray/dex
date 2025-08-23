// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";

contract Quoter0000 is IQuoter {
    function quote(QuoteParams memory params, bytes memory) external pure override returns (uint256) {
        if (params.zeroForOne) {
            return (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount) * 997 / 1000;
        } else {
            return (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount) * 997 / 1000;
        }
    }
    function quoteBatch(QuoteParamsBatch memory params, bytes memory) external pure override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            if (params.zeroForOne) {
                quotes[i] = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]);
            } else {
                quotes[i] = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]);
            }
            quotes[i] = (quotes[i] * 997) / 1000;
        }
    }
}
