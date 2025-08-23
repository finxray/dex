// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";


interface IQuoterSingleData {
    function quote(QuoteParams memory, bytes memory data) external returns (uint256); 
    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external returns (uint256[] memory); 
} 
