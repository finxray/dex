// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;  

import {Delta} from "./Delta.sol";

struct ExecutionParams {
    address asset0; 
    address asset1;
    uint256 poolID;
    Delta delta; 
    uint256 quote; // not sure if if this one is needed. check later
}