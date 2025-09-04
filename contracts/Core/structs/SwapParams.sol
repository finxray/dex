// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

struct SwapParams {
    address asset0;
    address asset1;
    address quoter;
    uint256[] amount;
    bool zeroForOne;
    bytes3[] marking;        // LP-controlled pool config (affects poolID)
    bytes4 traderProtection; // Trader-controlled MEV protection flags
}


