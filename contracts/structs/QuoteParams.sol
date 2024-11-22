// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

struct QuoteParams {
    uint256 amount; 
    bool zeroForOne; 
    uint128 inventory0; 
    uint128 inventory1;
}