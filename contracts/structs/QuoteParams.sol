// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30; 

struct QuoteParamsBase {
    address asset0; 
    address asset1; 
    bool zeroForOne;
}


struct QuoteParams {
    QuoteParamsBase base;
    address quoter;
    uint256 amount; 
    uint128 asset0Balance;
    uint128 asset1Balance;
    uint16 bucketID;
} 

struct QuoteParamsBatch {
    QuoteParamsBase base;
    address quoter;
    uint256[] amount; 
    uint128[] asset0Balances;
    uint128[] asset1Balances;
    uint16[] bucketID;
}

