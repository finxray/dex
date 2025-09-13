// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPoint64x64} from "./FixedPoint64x64.sol";

// Uniswap V2 interfaces
interface IUniswapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

// Uniswap V3 interfaces
interface IUniswapV3PoolLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );
    function observe(uint32[] calldata secondsAgos) external view returns (
        int56[] memory tickCumulatives,
        uint160[] memory secondsPerLiquidityCumulativeX128
    );
}

interface IUniswapV3FactoryLike {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

// Chainlink interface
interface AggregatorV3Interface {
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

/// @title StoixDataLib
/// @notice Optimized library for fetching and converting market data to Q64.64 format
library StoixDataLib {
    using FixedPoint64x64 for uint128;

    // Convert any decimal-scaled price to Q64.64
    function toQ64x64(uint256 price, uint8 decimals) internal pure returns (uint128) {
        if (price == 0) return 0;
        // Scale to 1e18 first, then to Q64.64
        uint256 scaled1e18 = decimals >= 18 ? 
            price / (10 ** (decimals - 18)) : 
            price * (10 ** (18 - decimals));
        return uint128((scaled1e18 << 64) / 1e18);
    }

    // Get Uniswap V2 spot price in Q64.64 format
    function getV2SpotQ64(
        address factory,
        address tokenA,
        address tokenB,
        bool zeroForOne
    ) internal view returns (uint128) {
        address pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) return 0;
        
        // Check token order in the pair
        address pairToken0 = IUniswapV2Pair(pair).token0();
        address pairToken1 = IUniswapV2Pair(pair).token1();
        
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();
        if (reserve0 == 0 || reserve1 == 0) return 0;
        
        // Determine price direction
        uint256 price1e18;
        if (zeroForOne) {
            // Want tokenA -> tokenB price
            if (tokenA == pairToken0) {
                // reserve1/reserve0 = tokenB per tokenA
                price1e18 = (uint256(reserve1) * 1e18) / uint256(reserve0);
            } else {
                // reserve0/reserve1 = tokenB per tokenA  
                price1e18 = (uint256(reserve0) * 1e18) / uint256(reserve1);
            }
        } else {
            // Want tokenB -> tokenA price
            if (tokenA == pairToken0) {
                // reserve0/reserve1 = tokenA per tokenB
                price1e18 = (uint256(reserve0) * 1e18) / uint256(reserve1);
            } else {
                // reserve1/reserve0 = tokenA per tokenB
                price1e18 = (uint256(reserve1) * 1e18) / uint256(reserve0);
            }
        }
        
        return toQ64x64(price1e18, 18);
    }

    // Get Uniswap V3 spot price in Q64.64 format
    function getV3SpotQ64(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        bool zeroForOne
    ) internal view returns (uint128) {
        address pool = IUniswapV3FactoryLike(factory).getPool(tokenA, tokenB, fee);
        if (pool == address(0)) return 0;
        
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3PoolLike(pool).slot0();
        if (sqrtPriceX96 == 0) return 0;
        
        // Check token order in the pool
        address poolToken0 = IUniswapV3PoolLike(pool).token0();
        
        // Convert sqrtPriceX96 to price
        uint256 price1e18 = sqrtPriceX96ToPrice1e18(sqrtPriceX96);
        
        // Adjust for direction and token order
        if (zeroForOne) {
            // Want tokenA -> tokenB price
            if (tokenA != poolToken0) {
                // Need to invert price
                price1e18 = (1e18 * 1e18) / price1e18;
            }
        } else {
            // Want tokenB -> tokenA price  
            if (tokenA == poolToken0) {
                // Need to invert price
                price1e18 = (1e18 * 1e18) / price1e18;
            }
        }
        
        return toQ64x64(price1e18, 18);
    }

    // Get Uniswap V3 TWAP in Q64.64 format
    function getV3TWAPQ64(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        uint32 twapWindow,
        bool zeroForOne
    ) internal view returns (uint128) {
        address pool = IUniswapV3FactoryLike(factory).getPool(tokenA, tokenB, fee);
        if (pool == address(0)) return 0;
        
        // Get TWAP over specified window
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow; // Window ago
        secondsAgos[1] = 0;          // Now
        
        (int56[] memory tickCumulatives, ) = IUniswapV3PoolLike(pool).observe(secondsAgos);
        int56 tickDiff = tickCumulatives[1] - tickCumulatives[0];
        int24 avgTick = int24(tickDiff / int56(int32(twapWindow)));
        
        // Convert tick to price and handle direction
        uint256 price1e18 = tickToPrice1e18(avgTick);
        
        // Check token order and adjust direction
        address poolToken0 = IUniswapV3PoolLike(pool).token0();
        if (zeroForOne) {
            if (tokenA != poolToken0) {
                price1e18 = (1e18 * 1e18) / price1e18;
            }
        } else {
            if (tokenA == poolToken0) {
                price1e18 = (1e18 * 1e18) / price1e18;
            }
        }
        
        return toQ64x64(price1e18, 18);
    }

    // Get Chainlink price in Q64.64 format
    function getChainlinkQ64(
        address feed,
        bool zeroForOne
    ) internal view returns (uint128 price, uint64 timestamp) {
        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(feed).latestRoundData();
        if (answer <= 0) return (0, 0);
        
        uint8 feedDecimals = AggregatorV3Interface(feed).decimals();
        uint256 priceRaw = uint256(answer);
        
        // Chainlink ETH/USD feed gives USD per ETH
        // If zeroForOne (ETH -> USD), use as-is
        // If !zeroForOne (USD -> ETH), invert
        if (!zeroForOne) {
            // Need ETH per USD = 1 / (USD per ETH)
            uint256 scaledOne = 10 ** (feedDecimals * 2); // Scale for division
            priceRaw = scaledOne / priceRaw;
        }
        
        price = toQ64x64(priceRaw, feedDecimals);
        timestamp = uint64(updatedAt);
    }

    // Convert sqrtPriceX96 to 1e18 price (safe math)
    function sqrtPriceX96ToPrice1e18(uint160 sqrtPriceX96) internal pure returns (uint256) {
        // Use safe scaling to avoid overflow
        uint256 sqrtPrice = uint256(sqrtPriceX96);
        
        // Method: (sqrtPrice * 1e9)^2 / 2^192 * 1e18 = (sqrtPrice * 1e9)^2 * 1e18 / 2^192
        uint256 scaled = (sqrtPrice * 1e9) >> 96; // Scale down first
        return (scaled * scaled * 1e18) >> 96; // Then square and scale to 1e18
    }

    // Convert tick to 1e18 price (approximation for gas efficiency)
    function tickToPrice1e18(int24 tick) internal pure returns (uint256) {
        if (tick == 0) return 1e18; // Price = 1.0
        
        // Simplified: price ≈ 1 + tick * 0.0001 for small ticks
        int256 tickExtended = int256(tick);
        int256 adjustment = (tickExtended * 1e14) / 10000; // 0.0001 in 1e18 format
        int256 price = 1e18 + adjustment;
        
        return price > 0 ? uint256(price) : 1; // Ensure positive
    }

    // Calculate standard deviation with TWAP optimization
    function calculateStdDevAndTwap(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        uint32 timeWindow,
        bool zeroForOne
    ) internal view returns (uint16 stdDev, uint128 twap) {
        address pool = IUniswapV3FactoryLike(factory).getPool(tokenA, tokenB, fee);
        if (pool == address(0)) return (0, 0);
        
        // Determine data points: 10 for short (≤15min), 20 for long
        uint8 dataPoints = timeWindow <= 900 ? 10 : 20;
        
        // Check cardinality
        (, , , uint16 cardinality, , , ) = IUniswapV3PoolLike(pool).slot0();
        if (cardinality < dataPoints) return (0, 0);
        
        // Create time points array
        uint32[] memory secondsAgos = new uint32[](dataPoints);
        uint32 interval = timeWindow / (dataPoints - 1);
        
        for (uint i = 0; i < dataPoints; i++) {
            secondsAgos[i] = uint32(i * interval);
        }
        
        // Get historical data
        (int56[] memory tickCumulatives, ) = IUniswapV3PoolLike(pool).observe(secondsAgos);
        
        // Calculate TWAP from most recent interval (free with std dev calculation)
        int56 recentTickDiff = tickCumulatives[0] - tickCumulatives[1];
        int24 recentAvgTick = int24(recentTickDiff / int56(int32(interval)));
        
        // Convert to Q64.64 and handle direction
        uint256 twapPrice1e18 = tickToPrice1e18(recentAvgTick);
        address poolToken0 = IUniswapV3PoolLike(pool).token0();
        
        if (zeroForOne) {
            if (tokenA != poolToken0) {
                twapPrice1e18 = (1e18 * 1e18) / twapPrice1e18;
            }
        } else {
            if (tokenA == poolToken0) {
                twapPrice1e18 = (1e18 * 1e18) / twapPrice1e18;
            }
        }
        
        twap = toQ64x64(twapPrice1e18, 18);
        
        // Calculate standard deviation
        uint8 intervals = dataPoints - 1;
        int24[] memory tickChanges = new int24[](intervals);
        
        for (uint i = 0; i < intervals; i++) {
            int56 tickDiff = tickCumulatives[i] - tickCumulatives[i + 1];
            tickChanges[i] = int24(tickDiff / int56(int32(interval)));
        }
        
        // Calculate mean
        int256 sumTicks = 0;
        for (uint i = 0; i < intervals; i++) {
            sumTicks += int256(tickChanges[i]);
        }
        int24 meanTick = int24(sumTicks / int256(uint256(intervals)));
        
        // Calculate variance
        uint256 sumSquaredDeviations = 0;
        for (uint i = 0; i < intervals; i++) {
            int24 deviation = tickChanges[i] - meanTick;
            sumSquaredDeviations += uint256(int256(deviation * deviation));
        }
        
        uint256 variance = sumSquaredDeviations / uint256(intervals);
        uint256 stdDevValue = sqrt(variance);
        
        // Scale to uint16 (basis points * 100)
        stdDev = stdDevValue > 65535 ? 65535 : uint16(stdDevValue);
    }

    // Integer square root
    function sqrt(uint256 x) internal pure returns (uint256) {
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
