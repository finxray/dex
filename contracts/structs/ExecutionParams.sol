// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;  

import {Delta} from "./Delta.sol";

struct ExecutionParams {
    uint256 poolID;
    uint256 quote; // not sure if if this one is needed. check later
    Delta delta; 
}