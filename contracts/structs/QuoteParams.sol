// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;  

import {Inventory} from "./Inventory.sol"; 

struct QuoteParamsBase {
    address asset0; 
    address asset1; 
    bool zeroForOne;
}


struct QuoteParams {
    QuoteParamsBase base;
    address quoter;
    uint256 amount; 
    Inventory inventory; 
    uint16 bucketID;
} 

struct QuoteParamsBatch {
    QuoteParamsBase base;
    address quoter;
    uint256[] amount; 
    Inventory[] inventory; 
    uint16[] bucketID;
}

