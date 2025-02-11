// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";


interface IQuoterBothData {
    function quote(
        QuoteParams memory params, 
        bytes memory dexMarketData, 
        bytes memory oracleMarketData
    ) external returns (uint256 quote); 

    function quoteBatch(
        QuoteParamsBatch memory params, 
        bytes memory dexMarketData, 
        bytes memory oracleMarketData
    ) external returns (uint256[] memory quotes); 
} 
