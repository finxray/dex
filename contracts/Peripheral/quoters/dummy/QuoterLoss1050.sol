// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";

/// @notice Quoter that gives traders an extra 5% edge to force pool losses
contract QuoterLoss1050 is IQuoter {
    function quote(QuoteParams memory params, bytes memory) external pure override returns (uint256) {
        uint256 q;
        if (params.zeroForOne) {
            q = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            q = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        return (q * 1050) / 1000;
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory) external pure override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            uint256 q;
            if (params.zeroForOne) {
                q = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]);
            } else {
                q = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]);
            }
            quotes[i] = (q * 1050) / 1000;
        }
    }
}


