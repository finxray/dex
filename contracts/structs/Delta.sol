// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Delta
/// @notice Represents the change in token amounts for a liquidity operation
struct Delta {
    int128 asset0;
    int128 asset1;
}