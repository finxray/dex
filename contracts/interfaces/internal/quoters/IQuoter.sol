// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";


interface IQuoter {
    function quote(QuoteParams calldata params) external returns (uint256 quote); 
    function quoteBatch(QuoteParamsBatch calldata params) external returns (uint256[] memory quotes); 
} 
