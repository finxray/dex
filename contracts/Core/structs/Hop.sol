// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

struct Hop {
    address asset0;
    address asset1;
    address quoter;
    bytes3[] markings;
    uint256[] amounts;
    bool zeroForOne;
}

