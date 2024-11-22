// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

struct SwapParams {
    uint80 currencyID;
    address quoter;
    uint16 bucketID;
    uint256 amount; 
    bool zeroForOne;
}

