// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

struct SwapParams {
    address asset0; 
    address asset1; 
    address quoter;
    uint256 amount; 
    bool zeroForOne;
    bytes3 markings;
} 




