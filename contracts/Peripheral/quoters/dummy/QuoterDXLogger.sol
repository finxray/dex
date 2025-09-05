// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../Core/structs/QuoteParams.sol";

contract QuoterDXLogger is IQuoter {
    event DXSeen(uint256 dxLen);

    function quote(QuoteParams memory params, bytes memory routed) external returns (uint256) {
        (bytes memory d0, bytes memory d1, bytes memory d2, bytes memory d3, bytes memory dx) = abi.decode(routed, (bytes, bytes, bytes, bytes, bytes));
        emit DXSeen(dx.length);
        uint256 bonus = (d0.length > 0 && d1.length > 0) ? 1005 : 1000;
        uint256 q;
        if (params.zeroForOne) {
            q = (params.amount * params.asset1Balance) / (params.asset0Balance + params.amount);
        } else {
            q = (params.amount * params.asset0Balance) / (params.asset1Balance + params.amount);
        }
        return (q * bonus) / 1000;
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory routed) external returns (uint256[] memory quotes) {
        (bytes memory d0, bytes memory d1, bytes memory d2, bytes memory d3, bytes memory dx) = abi.decode(routed, (bytes, bytes, bytes, bytes, bytes));
        emit DXSeen(dx.length);
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


