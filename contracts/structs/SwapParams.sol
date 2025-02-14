// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

struct SwapParams {
    address asset0; 
    address asset1; 
    address quoter;
    uint256[] amount; // amountIn
    bool zeroForOne;
    bytes3[] markings;  
    // requestedAmount; // to check for slippage. this can be implemented later
}   


   
struct SwapParamsInternal {
    uint256 poolID;
    int256 delta0;
    int256 delta1;
}



