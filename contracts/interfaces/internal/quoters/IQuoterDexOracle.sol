// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";
import {DexMarketData} from "../../../structs/DexMarketData.sol";
import {OracleMarketData} from "../../../structs/OracleMarketData.sol";


interface IQuoterDexOracle {
    function quote(
        QuoteParams calldata params, 
        DexMarketData calldata dex, 
        OracleMarketData calldata oracle
    ) external returns (uint256 quote); 

    function quoteBatch(
        QuoteParamsBatch calldata params, 
        DexMarketData calldata dex, 
        OracleMarketData calldata oracle
    ) external returns (uint256[] memory quotes); 
} 
