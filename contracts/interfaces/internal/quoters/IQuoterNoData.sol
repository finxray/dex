// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";


interface IQuoterNoData {
    function quote(QuoteParams memory) external returns (uint256); 
    function quoteBatch(QuoteParamsBatch memory) external returns (uint256[] memory); 
} 
