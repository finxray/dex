// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30; 

/// @notice Flattened quote parameters - no nested structs for gas optimization
struct QuoteParams {
    address asset0;
    address asset1;
    address quoter;
    uint256 amount;
    uint128 asset0Balance;
    uint128 asset1Balance;
    uint16 bucketID;
    bool zeroForOne;
}

/// @notice Flattened batch quote parameters - no nested structs for gas optimization
struct QuoteParamsBatch {
    address asset0;
    address asset1;
    address quoter;
    uint256[] amount;
    uint128[] asset0Balances;
    uint128[] asset1Balances;
    uint16[] bucketID;
    bool zeroForOne;
}

