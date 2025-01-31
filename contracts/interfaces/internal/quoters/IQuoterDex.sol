// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParams, QuoteParamsBatch} from "../../../structs/QuoteParams.sol";
import {DexMarketData} from "../../../structs/DexMarketData.sol";


interface IQuoterDex {
    function quote(QuoteParams calldata params, DexMarketData calldata dex) external returns (uint256 quote); 
    function quoteBatch(QuoteParamsBatch calldata params, DexMarketData calldata dex) external returns (uint256[] memory quotes); 
} 
