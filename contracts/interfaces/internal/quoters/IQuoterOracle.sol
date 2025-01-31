// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";
import {OracleMarketData} from "../../../structs/OracleMarketData.sol";

interface IQuoterOracle {
    function quote(QuoteParams calldata params, OracleMarketData calldata oracle) external returns (uint256 quote); 
    function quoteBatch(QuoteParamsBatch calldata params, OracleMarketData calldata oracle) external returns (uint256[] memory quotes); 
} 
