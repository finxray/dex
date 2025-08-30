// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IPoolEvents
 * @notice Comprehensive event definitions for pool monitoring
 * @dev Separates events for cleaner organization
 */
interface IPoolEvents {
    
    /*//////////////////////////////////////////////////////////////
                            POOL LIFECYCLE EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event PoolCreated(
        uint256 indexed poolId,
        address indexed asset0,
        address indexed asset1,
        address quoter,
        bytes3 markings,
        uint256 timestamp
    );
    
    event PoolInitialized(
        uint256 indexed poolId,
        uint256 initialLiquidity0,
        uint256 initialLiquidity1,
        address indexed provider
    );
    
    /*//////////////////////////////////////////////////////////////
                            LIQUIDITY EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event LiquidityAdded(
        uint256 indexed poolId,
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 shares,
        uint256 totalLiquidity
    );
    
    event LiquidityRemoved(
        uint256 indexed poolId,
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 shares,
        uint256 remainingLiquidity
    );
    
    event LiquidityLocked(
        uint256 indexed poolId,
        address indexed provider,
        uint256 shares,
        uint256 unlockTime
    );
    
    /*//////////////////////////////////////////////////////////////
                            SWAP EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event SwapExecuted(
        uint256 indexed poolId,
        address indexed trader,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOut,
        uint256 priceAfter,
        uint256 fee
    );
    
    event BatchSwapExecuted(
        address indexed trader,
        uint256[] poolIds,
        uint256 totalAmountIn,
        uint256 totalAmountOut,
        uint256 totalFees
    );
    
    event SwapFailed(
        uint256 indexed poolId,
        address indexed trader,
        string reason,
        uint256 attemptedAmount
    );
    
    /*//////////////////////////////////////////////////////////////
                            PRICE & QUOTE EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event QuoteGenerated(
        uint256 indexed poolId,
        address indexed quoter,
        uint256 amountIn,
        uint256 quotedOut,
        bool zeroForOne,
        uint256 gasUsed
    );
    
    event PriceUpdated(
        uint256 indexed poolId,
        uint256 price0,
        uint256 price1,
        uint256 timestamp
    );
    
    event OracleDataFetched(
        uint256 indexed poolId,
        address indexed dataBridge,
        bool success,
        uint256 price,
        uint256 timestamp
    );
    
    event OracleFailure(
        uint256 indexed poolId,
        address indexed dataBridge,
        string reason
    );
    
    /*//////////////////////////////////////////////////////////////
                            FLASH LOAN EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event FlashLoanExecuted(
        uint256 indexed poolId,
        address indexed borrower,
        address asset,
        uint256 amount,
        uint256 fee
    );
    
    event FlashSessionStarted(
        address indexed user,
        address callback,
        uint256 timestamp
    );
    
    event FlashSessionCompleted(
        address indexed user,
        int256[] deltas,
        uint256 gasUsed
    );
    
    /*//////////////////////////////////////////////////////////////
                            SECURITY EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event SuspiciousActivity(
        uint256 indexed poolId,
        address indexed actor,
        string activityType,
        uint256 severity
    );
    
    event EmergencyPause(
        uint256 indexed poolId,
        address indexed triggeredBy,
        string reason,
        uint256 duration
    );
    
    event EmergencyResume(
        uint256 indexed poolId,
        address indexed triggeredBy
    );
    
    event MaxSlippageExceeded(
        uint256 indexed poolId,
        address indexed trader,
        uint256 expectedOut,
        uint256 actualOut
    );
    
    /*//////////////////////////////////////////////////////////////
                            PERFORMANCE EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event HighGasUsage(
        uint256 indexed poolId,
        address indexed user,
        string operation,
        uint256 gasUsed
    );
    
    event PoolEfficiencyMetric(
        uint256 indexed poolId,
        uint256 utilizationRate,
        uint256 turnoverRate,
        uint256 timestamp
    );
    
    event ArbitrageOpportunity(
        uint256 indexed poolId1,
        uint256 indexed poolId2,
        uint256 profitAmount,
        address asset
    );
    
    /*//////////////////////////////////////////////////////////////
                            ADMIN EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event PoolParametersUpdated(
        uint256 indexed poolId,
        string parameter,
        uint256 oldValue,
        uint256 newValue
    );
    
    event FeeStructureUpdated(
        uint256 indexed poolId,
        uint256 oldFee,
        uint256 newFee
    );
    
    event DataBridgeUpdated(
        address indexed oldBridge,
        address indexed newBridge,
        uint256 slot
    );
}
