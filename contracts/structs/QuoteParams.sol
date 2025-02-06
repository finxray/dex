// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {Inventory} from "./Inventory.sol";

struct QuoteParams {
    address asset0; 
    address asset1; 
    address quoter;
    bool zeroForOne;
    uint256 amount; 
    Inventory inventory; 
    uint16 bucketID;
} 

struct QuoteParamsBatch {
    address asset0; 
    address asset1; 
    address quoter;
    bool zeroForOne; 
    uint256[] amount; 
    Inventory[] inventory; 
    uint16[] bucketID;
}

