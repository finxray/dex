// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";

contract Quoter1100 is IQuoter {
    function quote(QuoteParams memory params, bytes memory routed) external pure override returns (uint256) {
        (bytes memory d0, bytes memory d1,,) = abi.decode(routed, (bytes, bytes, bytes, bytes));
        uint256 bonus = (d0.length > 0 && d1.length > 0) ? 1005 : 1000; // small improvement if both present
        uint256 q;
        if (params.zeroForOne) {
            q = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            q = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        return (q * bonus) / 1000;
    }
    function quoteBatch(QuoteParamsBatch memory params, bytes memory routed) external pure override returns (uint256[] memory quotes) {
        (bytes memory d0, bytes memory d1,,) = abi.decode(routed, (bytes, bytes, bytes, bytes));
        uint256 bonus = (d0.length > 0 && d1.length > 0) ? 1005 : 1000;
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            uint256 q;
            if (params.zeroForOne) {
                q = (params.amount[i] * params.asset1Balances[i]) / (params.asset0Balances[i] + params.amount[i]);
            } else {
                q = (params.amount[i] * params.asset0Balances[i]) / (params.asset1Balances[i] + params.amount[i]);
            }
            quotes[i] = (q * bonus) / 1000;
        }
    }
}
