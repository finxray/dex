// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteParams} from "../../../structs/QuoteParams.sol";
import {QuoteParamsBatch} from "../../../structs/QuoteParams.sol";

interface IQuoter {
    function quote(QuoteParams memory params, bytes memory data) external returns (uint256 quote);
    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external returns (uint256[] memory quotes);
}


