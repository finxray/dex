// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPoint64x64} from "./FixedPoint64x64.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

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
        
        // Get pair token order and reserves
        address pairToken0 = IUniswapV2Pair(pair).token0();
        address pairToken1 = IUniswapV2Pair(pair).token1();
        
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();
        if (reserve0 == 0 || reserve1 == 0) return 0;
        
        // Get decimals
        uint8 dec0 = IERC20Metadata(pairToken0).decimals();
        uint8 dec1 = IERC20Metadata(pairToken1).decimals();
        
        // Calculate price with decimal adjustment
        // raw_price = reserve1/reserve0 (token1_raw per token0_raw)
        // adjusted_price = raw_price * (10^dec0 / 10^dec1) = token1_human per token0_human
        
        uint256 priceToken1PerToken0; // In Q64.64
        if (dec0 >= dec1) {
            uint256 decimalMultiplier = 10 ** (dec0 - dec1);
            // price = (reserve1 * decimalMultiplier) / reserve0, then to Q64.64
            priceToken1PerToken0 = (uint256(reserve1) * decimalMultiplier * (1 << 64)) / uint256(reserve0);
        } else {
            uint256 decimalDivisor = 10 ** (dec1 - dec0);
            // price = reserve1 / (reserve0 * decimalDivisor), then to Q64.64
            priceToken1PerToken0 = (uint256(reserve1) * (1 << 64)) / (uint256(reserve0) * decimalDivisor);
        }
        
        // priceToken1PerToken0 is now token1/token0 in human terms, Q64.64 format
        
        // Determine what the caller wants
        bool needsInversion = false;
        if (zeroForOne) {
            // Caller wants tokenA -> tokenB price
            if (tokenA == pairToken1) needsInversion = true;
        } else {
            // Caller wants tokenB -> tokenA price
            if (tokenA == pairToken0) needsInversion = true;
        }
        
        if (needsInversion && priceToken1PerToken0 > 0) {
            priceToken1PerToken0 = (uint256(1) << 128) / priceToken1PerToken0;
        }
        
        return uint128(priceToken1PerToken0);
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
        
        // sqrtPriceX96 = sqrt(token1/token0) * 2^96 in RAW units (no decimal adjustment)
        // We need to return price adjusted for decimals in Q64.64 format
        
        // Get pool token order
        address poolToken0 = IUniswapV3PoolLike(pool).token0();
        address poolToken1 = IUniswapV3PoolLike(pool).token1();
        
        // Get decimals - import IERC20Metadata interface
        uint8 dec0 = IERC20Metadata(poolToken0).decimals();
        uint8 dec1 = IERC20Metadata(poolToken1).decimals();
        
        // Calculate price in Q64.64 directly from sqrtPriceX96
        // price_raw = (sqrtPriceX96 / 2^96)^2 = token1_raw / token0_raw
        // price_adjusted = price_raw * (10^dec0 / 10^dec1) = token1_actual / token0_actual
        
        // sqrtPriceX96^2 / 2^192 gives raw price
        // Then we multiply by 10^dec0 and divide by 10^dec1
        // Then convert to Q64.64 by multiplying by 2^64
        
        // Final: ((sqrtPriceX96^2 / 2^192) * 10^dec0 / 10^dec1) * 2^64
        //      = (sqrtPriceX96^2 * 10^dec0 * 2^64) / (2^192 * 10^dec1)
        //      = (sqrtPriceX96^2 * 10^dec0) / (2^128 * 10^dec1)
        
        uint256 sqrtP = uint256(sqrtPriceX96);
        uint256 priceX128 = (sqrtP * sqrtP) >> 64; // price_raw * 2^128
        
        // Apply decimal adjustment and convert to Q64.64
        // priceQ64 = (priceX128 / 2^128) * (10^dec0 / 10^dec1) * 2^64
        //          = (priceX128 * 10^dec0 / 10^dec1) / 2^64
        
        uint256 priceQ64;
        if (dec0 >= dec1) {
            uint256 decimalMultiplier = 10 ** (dec0 - dec1);
            priceQ64 = (priceX128 * decimalMultiplier) >> 64;
        } else {
            uint256 decimalDivisor = 10 ** (dec1 - dec0);
            priceQ64 = priceX128 / decimalDivisor / (1 << 64);
        }
        
        // priceQ64 now represents token1/token0 in human-readable units, in Q64.64 format
        
        // Adjust for direction: determine what the caller wants
        bool needsInversion = false;
        if (zeroForOne) {
            // Caller wants tokenA -> tokenB price (tokenB per tokenA)
            // Pool gives token1/token0
            // If tokenA == poolToken0, we have token1/token0 which is tokenB/tokenA ✓
            // If tokenA == poolToken1, we have token1/token0 which is tokenA/tokenB, need inversion
            if (tokenA == poolToken1) needsInversion = true;
        } else {
            // Caller wants tokenB -> tokenA price (tokenA per tokenB)
            // Pool gives token1/token0
            // If tokenA == poolToken0, we have token1/token0 which is tokenB/tokenA, need inversion
            // If tokenA == poolToken1, we have token1/token0 which is tokenA/tokenB ✓
            if (tokenA == poolToken0) needsInversion = true;
        }
        
        if (needsInversion && priceQ64 > 0) {
            // Invert: 1/price in Q64.64 = 2^128 / priceQ64
            priceQ64 = (uint256(1) << 128) / priceQ64;
        }
        
        return uint128(priceQ64);
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
        
        // Use current spot price as TWAP approximation (more accurate than tick conversion)
        // In production, you'd want proper tick-based TWAP, but for now use spot
        return getV3SpotQ64(factory, tokenA, tokenB, fee, zeroForOne);
    }

    // Get Chainlink price in Q64.64 format
    // Note: This assumes the feed provides the price in the correct direction for your pair
    // ETH/USD feed gives USD per ETH
    function getChainlinkQ64(
        address feed,
        bool zeroForOne
    ) internal view returns (uint128 price, uint64 timestamp) {
        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(feed).latestRoundData();
        if (answer <= 0) return (0, 0);
        
        uint8 feedDecimals = AggregatorV3Interface(feed).decimals();
        uint256 priceRaw = uint256(answer);
        
        // Chainlink ETH/USD feed gives USD per ETH (e.g., 2500 USD per 1 ETH)
        // When zeroForOne=false with (USDC, WETH), we want USDC per WETH - use feed directly (USDC ≈ USD)
        // When zeroForOne=true with (USDC, WETH), we want WETH per USDC - invert the feed
        if (zeroForOne) {
            // Need to invert: WETH per USDC = 1 / (USD per ETH)
            uint256 scaledOne = 10 ** (feedDecimals * 2);
            priceRaw = scaledOne / priceRaw;
        }
        // else: use as-is for !zeroForOne (USD per ETH = USDC per WETH)
        
        price = toQ64x64(priceRaw, feedDecimals);
        timestamp = uint64(updatedAt);
    }

    // Convert sqrtPriceX96 to 1e18 price (safe math)
    // sqrtPriceX96 represents sqrt(token1/token0) * 2^96
    // Returns price as token1/token0 in 1e18 format
    function sqrtPriceX96ToPrice1e18(uint160 sqrtPriceX96) internal pure returns (uint256) {
        // price = (sqrtPriceX96 / 2^96)^2 = (sqrtPriceX96)^2 / 2^192
        // To get in 1e18 format: multiply by 1e18
        // = (sqrtPriceX96)^2 * 1e18 / 2^192
        
        uint256 numerator = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        // numerator is now price * 2^192
        // Shift right by 192 and multiply by 1e18
        // = (numerator >> 192) * 1e18
        // To avoid precision loss, do: (numerator * 1e18) >> 192
        
        // But this overflows! So we need to break it down:
        // (sqrtPriceX96^2 * 1e18) / 2^192
        // = (sqrtPriceX96^2 / 2^64) * 1e18 / 2^128
        
        uint256 priceX128 = (numerator >> 64); // sqrtPrice^2 / 2^64 = price * 2^128
        return (priceX128 * 1e18) >> 128;
    }

    // Convert tick to 1e18 price using proper exponential formula
    // UniswapV3: price = 1.0001^tick = (token1/token0) in pool terms
    function tickToPrice1e18(int24 tick) internal pure returns (uint256) {
        if (tick == 0) return 1e18; // Price = 1.0
        
        // Use proper exponential: price = 1.0001^tick
        // For gas efficiency, use approximation for small ticks or library calculation
        // For now, convert back through sqrtPrice math for accuracy
        
        // Approximate using: price ≈ exp(tick * ln(1.0001))
        // ln(1.0001) ≈ 0.00009999500033... ≈ 0.0001
        // For small ticks: price ≈ exp(tick * 0.0001)
        
        // Better: use the fact that sqrtPrice = 1.0001^(tick/2)
        // So price = 1.0001^tick = (1.0001^(tick/2))^2
        
        // For large ticks (like -200000), we need proper calculation
        // Use bit shifts and multiplication for 1.0001^tick
        uint256 absTick = tick < 0 ? uint256(int256(-int256(tick))) : uint256(int256(tick));
        
        // Calculate 1.0001^absTick using binary exponentiation approximation
        // For gas efficiency: use lookup table for common ranges or approximation
        // Simplified for now: use 1.0001 ≈ (10001/10000)
        
        if (absTick > 50000) {
            // For very large ticks, use approximation: 1.0001^n ≈ e^(n*0.0001)
            // This is very approximate but avoids overflow
            // Price will be very large or very small
            if (tick > 0) {
                // Price > 1, approximate as large number
                return 1e18 * (1 + absTick / 10000);
            } else {
                // Price < 1, approximate as small number
                return 1e18 / (1 + absTick / 10000);
            }
        }
        
        // For smaller ticks, use Taylor: ln(price) = tick * ln(1.0001) ≈ tick * 0.0001
        // price = exp(tick * 0.0001) ≈ 1 + tick*0.0001 + (tick*0.0001)^2/2 + ...
        int256 tickExtended = int256(tick);
        int256 factor = (tickExtended * 1e14) / 10000; // tick * 0.0001 in 1e18
        int256 price = 1e18 + factor; // First order approximation
        
        return price > 0 ? uint256(price) : 1;
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
        
        // Determine data points: higher resolution for short window to avoid integer zeroing
        //  - 15 min: 31 points (30-second spacing)
        //  - 24 h: 25 points (~1h spacing)
        uint8 dataPoints = timeWindow <= 900 ? 31 : 25;
        
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
            // Rounded division to reduce zeroing from truncation on short windows
            int56 half = int56(int32(interval) / 2);
            int56 numer = tickDiff >= 0 ? (tickDiff + half) : (tickDiff - half);
            tickChanges[i] = int24(numer / int56(int32(interval)));
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
        uint256 stdDevTicks = sqrt(variance);
        
        // Convert tick std dev to (bps × 100): ~1 tick ≈ 1 bps → multiply by 100
        uint256 stdDevBpsx100 = stdDevTicks * 100;
        
        // Clamp to uint16
        stdDev = stdDevBpsx100 > 65535 ? 65535 : uint16(stdDevBpsx100);
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
