// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";


interface IQuoterDualData {
    function quote(
        QuoteParams memory params, 
        bytes memory alphaData, 
        bytes memory betaData
    ) external returns (uint256 quote); 

    function quoteBatch(
        QuoteParamsBatch memory params, 
        bytes memory alphaData, 
        bytes memory betaData
    ) external returns (uint256[] memory quotes); 
} 
