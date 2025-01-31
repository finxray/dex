// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

struct QuoteBase {
    address asset0; 
    address asset1; 
    address quoter;
    bool zeroForOne;
} 

struct Inventory {
    uint128 inventory0; 
    uint128 invenotry1; 
}

struct QuoteParams {
    QuoteBase base;
    uint256 amount; 
    Inventory inventory; 
    uint16 bucketID;
} 

struct QuoteParamsBatch {
    QuoteBase base; 
    uint256 amount; 
    Inventory[] invenotry; 
    uint16[] bucketID;
}

