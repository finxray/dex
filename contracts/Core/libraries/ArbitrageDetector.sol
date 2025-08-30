// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

/**
 * @title ArbitrageDetector
 * @notice Detects and reports arbitrage opportunities across pools
 * @dev Can be used for MEV protection and pool efficiency monitoring
 */
library ArbitrageDetector {
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct ArbitrageOpportunity {
        uint256 poolId1;
        uint256 poolId2;
        address asset;          // Asset to arbitrage
        uint256 profitAmount;   // Expected profit in asset terms
        uint256 optimalSize;    // Optimal trade size
        bool isValid;           // Whether opportunity still exists
        uint256 timestamp;      // When detected
    }
    
    struct PoolPriceInfo {
        uint256 poolId;
        uint256 price;          // Price in 1e18 format
        uint256 liquidity;      // Available liquidity
        address quoter;
        uint256 lastUpdate;
    }
    
    struct ArbitragePath {
        uint256[] poolIds;      // Sequence of pools
        address[] assets;       // Assets to trade through
        uint256 expectedProfit; // Total expected profit
        uint256 requiredCapital;// Initial capital needed
    }
    
    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/
    
    uint256 constant MIN_PROFIT_THRESHOLD = 1e15; // 0.001 in 1e18
    uint256 constant MAX_PRICE_DEVIATION = 500;   // 5% in basis points
    uint256 constant PRICE_PRECISION = 1e18;
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event ArbitrageDetected(
        uint256 indexed poolId1,
        uint256 indexed poolId2,
        uint256 profitAmount,
        address asset,
        uint256 optimalSize
    );
    
    event MultiPoolArbitrage(
        uint256[] poolIds,
        uint256 expectedProfit,
        uint256 gasEstimate
    );
    
    event PriceDivergence(
        uint256 indexed poolId1,
        uint256 indexed poolId2,
        uint256 priceDiff,
        uint256 threshold
    );
    
    /*//////////////////////////////////////////////////////////////
                        ARBITRAGE DETECTION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Detect arbitrage opportunity between two pools
     * @dev Compares prices and calculates optimal arbitrage size
     * @param pool1Info First pool information
     * @param pool2Info Second pool information
     * @param testAmount Amount to use for price testing
     * @return opportunity Arbitrage opportunity details
     */
    function detectTwoPoolArbitrage(
        PoolPriceInfo memory pool1Info,
        PoolPriceInfo memory pool2Info,
        uint256 testAmount
    ) internal returns (ArbitrageOpportunity memory opportunity) {
        // Get quotes from both pools
        uint256 quote1 = _getQuote(pool1Info, testAmount, true);
        uint256 quote2 = _getQuote(pool2Info, testAmount, true);
        
        // Calculate effective prices (output/input)
        uint256 price1 = (quote1 * PRICE_PRECISION) / testAmount;
        uint256 price2 = (quote2 * PRICE_PRECISION) / testAmount;
        
        // Check for significant price difference
        uint256 priceDiff = price1 > price2 
            ? ((price1 - price2) * 10000) / price2 
            : ((price2 - price1) * 10000) / price1;
        
        if (priceDiff > MAX_PRICE_DEVIATION) {
            emit PriceDivergence(pool1Info.poolId, pool2Info.poolId, priceDiff, MAX_PRICE_DEVIATION);
        }
        
        // Determine arbitrage direction
        if (price1 > price2) {
            // Buy from pool2, sell to pool1
            opportunity = _calculateArbitrage(
                pool2Info,  // Buy from
                pool1Info,  // Sell to
                price2,
                price1,
                testAmount
            );
        } else if (price2 > price1) {
            // Buy from pool1, sell to pool2
            opportunity = _calculateArbitrage(
                pool1Info,  // Buy from
                pool2Info,  // Sell to
                price1,
                price2,
                testAmount
            );
        }
        
        if (opportunity.isValid) {
            emit ArbitrageDetected(
                opportunity.poolId1,
                opportunity.poolId2,
                opportunity.profitAmount,
                address(0), // Would be actual asset
                opportunity.optimalSize
            );
        }
    }
    
    /**
     * @notice Detect triangular arbitrage across three pools
     * @dev Finds profitable paths through three different pools
     * @param pools Array of pool information
     * @param assets Array of assets to trade through
     * @return path Most profitable arbitrage path
     */
    function detectTriangularArbitrage(
        PoolPriceInfo[] memory pools,
        address[] memory assets
    ) internal returns (ArbitragePath memory path) {
        require(pools.length >= 3, "Need at least 3 pools");
        require(assets.length >= 3, "Need at least 3 assets");
        
        uint256 bestProfit;
        uint256[] memory bestPath = new uint256[](3);
        
        // Try all possible triangular combinations
        for (uint256 i = 0; i < pools.length; i++) {
            for (uint256 j = 0; j < pools.length; j++) {
                if (i == j) continue;
                
                for (uint256 k = 0; k < pools.length; k++) {
                    if (k == i || k == j) continue;
                    
                    // Calculate profit for path i -> j -> k -> i
                    uint256 profit = _calculateTriangularProfit(
                        pools[i],
                        pools[j],
                        pools[k],
                        1e18 // Start with 1 unit
                    );
                    
                    if (profit > bestProfit) {
                        bestProfit = profit;
                        bestPath[0] = i;
                        bestPath[1] = j;
                        bestPath[2] = k;
                    }
                }
            }
        }
        
        if (bestProfit > MIN_PROFIT_THRESHOLD) {
            path.poolIds = new uint256[](3);
            path.poolIds[0] = pools[bestPath[0]].poolId;
            path.poolIds[1] = pools[bestPath[1]].poolId;
            path.poolIds[2] = pools[bestPath[2]].poolId;
            path.assets = assets;
            path.expectedProfit = bestProfit;
            path.requiredCapital = 1e18;
            
            emit MultiPoolArbitrage(path.poolIds, bestProfit, 300000); // Estimated gas
        }
    }
    
    /**
     * @notice Monitor pools for statistical arbitrage opportunities
     * @dev Uses historical data to find mean-reverting price patterns
     * @param poolPrices Array of historical prices for pools
     * @param window Time window for analysis
     * @return opportunities Array of statistical arbitrage opportunities
     */
    function detectStatisticalArbitrage(
        PoolPriceInfo[] memory poolPrices,
        uint256 window
    ) internal pure returns (ArbitrageOpportunity[] memory opportunities) {
        // Calculate moving averages
        uint256[] memory movingAverages = new uint256[](poolPrices.length);
        
        for (uint256 i = 0; i < poolPrices.length; i++) {
            movingAverages[i] = poolPrices[i].price; // Simplified for now
        }
        
        // Find pools with prices significantly deviating from average
        uint256 avgPrice = _calculateAverage(movingAverages);
        uint256 stdDev = _calculateStdDev(movingAverages, avgPrice);
        
        uint256 count;
        for (uint256 i = 0; i < poolPrices.length; i++) {
            uint256 deviation = poolPrices[i].price > avgPrice 
                ? poolPrices[i].price - avgPrice 
                : avgPrice - poolPrices[i].price;
            
            if (deviation > stdDev * 2) {
                count++;
            }
        }
        
        opportunities = new ArbitrageOpportunity[](count);
        // Populate opportunities array with detected patterns
    }
    
    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/
    
    function _getQuote(
        PoolPriceInfo memory poolInfo,
        uint256 amount,
        bool zeroForOne
    ) private returns (uint256) {
        QuoteParams memory params = QuoteParams({
            asset0: address(0), // Would be actual asset
            asset1: address(0), // Would be actual asset
            quoter: poolInfo.quoter,
            amount: amount,
            asset0Balance: uint128(poolInfo.liquidity / 2),
            asset1Balance: uint128(poolInfo.liquidity / 2),
            bucketID: 0,
            zeroForOne: zeroForOne
        });
        
        return IQuoter(poolInfo.quoter).quote(params, "");
    }
    
    function _calculateArbitrage(
        PoolPriceInfo memory buyPool,
        PoolPriceInfo memory sellPool,
        uint256 buyPrice,
        uint256 sellPrice,
        uint256 testAmount
    ) private view returns (ArbitrageOpportunity memory) {
        uint256 priceDiff = sellPrice - buyPrice;
        uint256 profitPerUnit = (priceDiff * PRICE_PRECISION) / buyPrice;
        
        if (profitPerUnit < MIN_PROFIT_THRESHOLD) {
            return ArbitrageOpportunity({
                poolId1: 0,
                poolId2: 0,
                asset: address(0),
                profitAmount: 0,
                optimalSize: 0,
                isValid: false,
                timestamp: 0
            });
        }
        
        // Calculate optimal size based on liquidity
        uint256 maxSize = buyPool.liquidity < sellPool.liquidity 
            ? buyPool.liquidity / 10  // Use 10% of smaller pool
            : sellPool.liquidity / 10;
        
        uint256 optimalSize = _calculateOptimalSize(
            buyPrice,
            sellPrice,
            buyPool.liquidity,
            sellPool.liquidity
        );
        
        if (optimalSize > maxSize) {
            optimalSize = maxSize;
        }
        
        uint256 expectedProfit = (optimalSize * profitPerUnit) / PRICE_PRECISION;
        
        return ArbitrageOpportunity({
            poolId1: buyPool.poolId,
            poolId2: sellPool.poolId,
            asset: address(0), // Would be actual asset
            profitAmount: expectedProfit,
            optimalSize: optimalSize,
            isValid: true,
            timestamp: block.timestamp
        });
    }
    
    function _calculateTriangularProfit(
        PoolPriceInfo memory pool1,
        PoolPriceInfo memory pool2,
        PoolPriceInfo memory pool3,
        uint256 startAmount
    ) private returns (uint256) {
        // Simulate trades through three pools
        uint256 amount1 = _getQuote(pool1, startAmount, true);
        uint256 amount2 = _getQuote(pool2, amount1, true);
        uint256 finalAmount = _getQuote(pool3, amount2, true);
        
        // Profit is final amount minus starting amount
        return finalAmount > startAmount ? finalAmount - startAmount : 0;
    }
    
    function _calculateOptimalSize(
        uint256 buyPrice,
        uint256 sellPrice,
        uint256 buyLiquidity,
        uint256 sellLiquidity
    ) private pure returns (uint256) {
        // Simplified optimal size calculation
        // In practice, would use more sophisticated model
        uint256 priceDiff = sellPrice - buyPrice;
        uint256 avgLiquidity = (buyLiquidity + sellLiquidity) / 2;
        
        // Optimal size proportional to price difference and liquidity
        return (avgLiquidity * priceDiff) / (sellPrice * 100);
    }
    
    function _calculateAverage(uint256[] memory values) private pure returns (uint256) {
        uint256 sum;
        for (uint256 i = 0; i < values.length; i++) {
            sum += values[i];
        }
        return sum / values.length;
    }
    
    function _calculateStdDev(
        uint256[] memory values,
        uint256 mean
    ) private pure returns (uint256) {
        uint256 sumSquares;
        for (uint256 i = 0; i < values.length; i++) {
            uint256 diff = values[i] > mean ? values[i] - mean : mean - values[i];
            sumSquares += diff * diff;
        }
        return sqrt(sumSquares / values.length);
    }
    
    function sqrt(uint256 x) private pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
