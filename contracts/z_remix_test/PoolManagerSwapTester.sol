// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "../interfaces/external/IERC20.sol";

/**
 * @title PoolManagerSwapTester
 * @notice Comprehensive test contract for PoolManager swap function using dual data
 * @dev Copy-paste this into Remix and update addresses after deployment
 */
contract PoolManagerSwapTester {
    
    // 📝 UPDATE THESE ADDRESSES AFTER DEPLOYMENT
    address constant TOKEN_A = 0x0000000000000000000000000000000000000000;
    address constant TOKEN_B = 0x0000000000000000000000000000000000000000;
    address constant POOL_MANAGER = 0x0000000000000000000000000000000000000000;
    address constant DUAL_QUOTER = 0x0000000000000000000000000000000000000000;
    address constant MOCK_ALPHA_BRIDGE = 0x0000000000000000000000000000000000000000;
    address constant MOCK_BETA_BRIDGE = 0x0000000000000000000000000000000000000000;
    
    // Test constants
    uint256 constant SWAP_AMOUNT = 10 ether;           // 10 tokens to swap
    uint256 constant MIN_AMOUNT_OUT = 12 ether;        // Minimum 12 tokens expected
    uint256 constant LIQUIDITY_AMOUNT_0 = 1000 ether;  // Initial liquidity
    uint256 constant LIQUIDITY_AMOUNT_1 = 1300 ether;  // Initial liquidity
    
    // Dual data marking: isAlpha=1, isBeta=1, both default=1, bucket=0
    // Binary: 000000000000 0000 0000 1 1 1 1 = 0x00000F
    bytes3 constant DUAL_DATA_MARKING = 0x00000F;
    
    // Events for logging results
    event SwapResult(
        string testName,
        uint256 amountIn,
        uint256 amountOut,
        uint256 gasUsed,
        bool zeroForOne
    );
    
    event LiquidityAdded(
        uint256 poolID,
        uint256 liquidity,
        uint256 gasUsed
    );
    
    event TestSetup(
        address tokenA,
        address tokenB,
        address poolManager,
        address dualQuoter,
        bytes3 marking
    );
    
    /**
     * @notice Interface for PoolManager contract
     */
    interface IPoolManager {
        function addLiquidity(
            address asset0,
            address asset1,
            address quoter,
            bytes3 markings,
            uint256 amount0,
            uint256 amount1
        ) external payable returns (uint256 liquidity);
        
        function swap(
            address asset0,
            address asset1,
            address quoter,
            bytes3 markings,
            uint256 amountIn,
            bool zeroForOne,
            uint256 minAmountOut
        ) external payable returns (uint256 amountOut);
        
        function getInventory(uint256 poolId) external view returns (uint128 asset0, uint128 asset1);
    }
    
    /**
     * @notice Setup test environment - call this first
     */
    function setupTest() external {
        emit TestSetup(TOKEN_A, TOKEN_B, POOL_MANAGER, DUAL_QUOTER, DUAL_DATA_MARKING);
        
        // Approve tokens for PoolManager
        IERC20(TOKEN_A).approve(POOL_MANAGER, type(uint256).max);
        IERC20(TOKEN_B).approve(POOL_MANAGER, type(uint256).max);
    }
    
    /**
     * @notice Add initial liquidity to the pool for testing
     * @return liquidity Amount of liquidity tokens minted
     */
    function addInitialLiquidity() external payable returns (uint256 liquidity) {
        uint256 gasStart = gasleft();
        
        liquidity = IPoolManager(POOL_MANAGER).addLiquidity(
            TOKEN_A,
            TOKEN_B,
            DUAL_QUOTER,
            DUAL_DATA_MARKING,
            LIQUIDITY_AMOUNT_0,
            LIQUIDITY_AMOUNT_1
        );
        
        uint256 gasUsed = gasStart - gasleft();
        
        // Calculate pool ID for logging (simplified - actual assembly calculation would be more complex)
        uint256 poolID = uint256(keccak256(abi.encodePacked(TOKEN_A, TOKEN_B, DUAL_QUOTER, DUAL_DATA_MARKING)));
        
        emit LiquidityAdded(poolID, liquidity, gasUsed);
        return liquidity;
    }
    
    /**
     * @notice Test swap: Token A -> Token B (zeroForOne = true) using dual data
     * @return amountOut Amount of Token B received
     */
    function testSwapZeroForOne() external payable returns (uint256 amountOut) {
        uint256 gasStart = gasleft();
        
        amountOut = IPoolManager(POOL_MANAGER).swap(
            TOKEN_A,
            TOKEN_B,
            DUAL_QUOTER,
            DUAL_DATA_MARKING,
            SWAP_AMOUNT,
            true, // zeroForOne
            MIN_AMOUNT_OUT
        );
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit SwapResult("ZeroForOne", SWAP_AMOUNT, amountOut, gasUsed, true);
        return amountOut;
    }
    
    /**
     * @notice Test swap: Token B -> Token A (zeroForOne = false) using dual data
     * @return amountOut Amount of Token A received
     */
    function testSwapOneForZero() external payable returns (uint256 amountOut) {
        uint256 gasStart = gasleft();
        
        amountOut = IPoolManager(POOL_MANAGER).swap(
            TOKEN_A,
            TOKEN_B,
            DUAL_QUOTER,
            DUAL_DATA_MARKING,
            SWAP_AMOUNT,
            false, // oneForZero
            8 ether // Lower minimum for reverse direction
        );
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit SwapResult("OneForZero", SWAP_AMOUNT, amountOut, gasUsed, false);
        return amountOut;
    }
    
    /**
     * @notice Test large swap to measure gas scaling
     * @return amountOut Amount received from large swap
     */
    function testLargeSwap() external payable returns (uint256 amountOut) {
        uint256 gasStart = gasleft();
        uint256 largeAmount = 100 ether; // 10x normal amount
        
        amountOut = IPoolManager(POOL_MANAGER).swap(
            TOKEN_A,
            TOKEN_B,
            DUAL_QUOTER,
            DUAL_DATA_MARKING,
            largeAmount,
            true,
            120 ether // Proportionally higher minimum
        );
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit SwapResult("LargeSwap", largeAmount, amountOut, gasUsed, true);
        return amountOut;
    }
    
    /**
     * @notice Test small swap for gas efficiency comparison
     * @return amountOut Amount received from small swap
     */
    function testSmallSwap() external payable returns (uint256 amountOut) {
        uint256 gasStart = gasleft();
        uint256 smallAmount = 1 ether; // 10x smaller amount
        
        amountOut = IPoolManager(POOL_MANAGER).swap(
            TOKEN_A,
            TOKEN_B,
            DUAL_QUOTER,
            DUAL_DATA_MARKING,
            smallAmount,
            true,
            1.2 ether // Proportionally lower minimum
        );
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit SwapResult("SmallSwap", smallAmount, amountOut, gasUsed, true);
        return amountOut;
    }
    
    /**
     * @notice Run comprehensive swap test sequence
     * @return results Array of swap results [zeroForOne, oneForZero, large, small]
     */
    function runFullSwapTest() external payable returns (uint256[4] memory results) {
        results[0] = this.testSwapZeroForOne();
        results[1] = this.testSwapOneForZero();
        results[2] = this.testLargeSwap();
        results[3] = this.testSmallSwap();
        return results;
    }
    
    /**
     * @notice Get current pool inventory for analysis
     * @return asset0Balance Current Token A balance in pool
     * @return asset1Balance Current Token B balance in pool
     */
    function getPoolInventory() external view returns (uint128 asset0Balance, uint128 asset1Balance) {
        // Calculate pool ID (simplified)
        uint256 poolID = uint256(keccak256(abi.encodePacked(TOKEN_A, TOKEN_B, DUAL_QUOTER, DUAL_DATA_MARKING)));
        return IPoolManager(POOL_MANAGER).getInventory(poolID);
    }
    
    /**
     * @notice Get user token balances for verification
     * @return balanceA User's Token A balance
     * @return balanceB User's Token B balance
     */
    function getUserBalances() external view returns (uint256 balanceA, uint256 balanceB) {
        balanceA = IERC20(TOKEN_A).balanceOf(msg.sender);
        balanceB = IERC20(TOKEN_B).balanceOf(msg.sender);
        return (balanceA, balanceB);
    }
    
    /**
     * @notice Calculate expected pool ID (for verification)
     * @return poolID The calculated pool identifier
     */
    function calculatePoolID() external pure returns (uint256 poolID) {
        // Simplified calculation - actual implementation uses assembly
        poolID = uint256(keccak256(abi.encodePacked(TOKEN_A, TOKEN_B, DUAL_QUOTER, DUAL_DATA_MARKING)));
        return poolID;
    }
    
    /**
     * @notice Emergency function to approve more tokens if needed
     */
    function approveMoreTokens() external {
        IERC20(TOKEN_A).approve(POOL_MANAGER, type(uint256).max);
        IERC20(TOKEN_B).approve(POOL_MANAGER, type(uint256).max);
    }
    
    /**
     * @notice Get contract configuration for verification
     */
    function getConfig() external pure returns (
        address tokenA,
        address tokenB,
        address poolManager,
        address dualQuoter,
        bytes3 marking,
        uint256 swapAmount,
        uint256 minAmountOut
    ) {
        return (
            TOKEN_A,
            TOKEN_B,
            POOL_MANAGER,
            DUAL_QUOTER,
            DUAL_DATA_MARKING,
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT
        );
    }
}

/**
 * @title Testing Instructions & Expected Results
 * 
 * DEPLOYMENT ORDER:
 * 1. Deploy TestTokenA and TestTokenB
 * 2. Deploy MockAlphaDataBridge and MockBetaDataBridge
 * 3. Deploy DualDataQuoter
 * 4. Deploy PoolManager with bridge addresses
 * 5. Update addresses in this contract and deploy
 * 
 * TESTING STEPS:
 * 1. Mint tokens to your test address (1M+ of each)
 * 2. Call setupTest() to approve tokens
 * 3. Call addInitialLiquidity() to create pool (costs ~170K gas)
 * 4. Call individual swap tests or runFullSwapTest()
 * 
 * EXPECTED SWAP GAS COSTS (Dual Data):
 * - Small swap (1 ETH): ~75,000-85,000 gas
 * - Normal swap (10 ETH): ~77,000-90,000 gas  
 * - Large swap (100 ETH): ~80,000-95,000 gas
 * 
 * The comment in PoolManager shows historical costs:
 * - Execution cost: 67,670 gas
 * - Transaction cost: 77,821 gas
 * 
 * DUAL DATA FEATURES TESTED:
 * - Uses both Alpha and Beta market data sources
 * - Sophisticated pricing with spread analysis
 * - Risk adjustments based on dual data correlation
 * - Transient storage caching for efficiency
 * 
 * MARKING BREAKDOWN (0x00000F):
 * - isAlpha: 1 (uses alpha data)
 * - isBeta: 1 (uses beta data)  
 * - isAlphaDefault: 1 (uses default alpha bridge)
 * - isBetaDefault: 1 (uses default beta bridge)
 * - alphaAddressPointer: 0 (not used when default)
 * - betaAddressPointer: 0 (not used when default)
 * - bucketID: 0 (default bucket)
 * 
 * VERIFICATION:
 * - Check getUserBalances() before/after swaps
 * - Monitor getPoolInventory() changes
 * - Compare gas costs with expected ranges
 * - Verify amountOut meets minimum requirements
 */