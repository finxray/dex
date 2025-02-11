// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";
import {DexMarketData} from "../../../structs/DexMarketData.sol";
import {OracleMarketData} from "../../../structs/OracleMarketData.sol";


interface IQuoterBothData {
    function quote(
        QuoteParams memory params, 
        bytes memory dexMarketData, 
        bytes memory oracleMarketData
    ) external returns (uint256 quote); 

    function quoteBatch(
        QuoteParams memory params, 
        bytes memory dexMarketData, 
        bytes memory oracleMarketData
    ) external returns (uint256[] memory quotes); 
} 
