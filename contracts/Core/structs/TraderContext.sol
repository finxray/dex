// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Enhanced trader context for quoters that need transaction-level information
/// @dev Used only when enhanced context flag is enabled in markings to minimize gas overhead
struct TraderContext {
    address trader;           // The actual trader (msg.sender from PoolManager)
    address txOrigin;         // Transaction originator (tx.origin)
    uint256 blockNumber;      // Current block number
    uint256 timestamp;        // Current block timestamp
    uint256 gasPrice;         // Transaction gas price
    uint256 gasLeft;          // Remaining gas at quote time
    bool sessionActive;       // Whether flash session is active
}

/// @notice Enhanced quote parameters with trader context
struct QuoteParamsWithContext {
    address asset0;
    address asset1;
    address quoter;
    uint256 amount;
    uint128 asset0Balance;
    uint128 asset1Balance;
    uint16 bucketID;
    bool zeroForOne;
    TraderContext context;    // Enhanced trader context
}

/// @notice Enhanced batch quote parameters with trader context
struct QuoteParamsBatchWithContext {
    address asset0;
    address asset1;
    address quoter;
    uint256[] amount;
    uint128[] asset0Balances;
    uint128[] asset1Balances;
    uint16[] bucketID;
    bool zeroForOne;
    TraderContext context;    // Enhanced trader context
}
