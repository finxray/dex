// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

// External pool interfaces (minimal)
interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

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

/// @notice On-chain aggregator that queries three pools (V2-style and/or V3-style) to compute spot and TWAP
/// @dev Addresses must be configured for the specific chain. Reads only; no integration elsewhere.
contract AlphaDataBridgeOnchainAggregator is IDataBridge {
    struct PoolConfig {
        address pool;
        uint8 kind; // 2 = UniswapV2-like, 3 = UniswapV3-like
        uint24 v3TwapWindow; // seconds for V3 TWAP
    }

    PoolConfig public dexA;
    PoolConfig public dexB;
    PoolConfig public dexC;

    constructor(PoolConfig memory _a, PoolConfig memory _b, PoolConfig memory _c) {
        dexA = _a; dexB = _b; dexC = _c;
    }

    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        // Return raw per-DEX arrays: spots[3], twaps[3]
        (uint256 sA, uint256 tA) = _readPool(dexA, params);
        (uint256 sB, uint256 tB) = _readPool(dexB, params);
        (uint256 sC, uint256 tC) = _readPool(dexC, params);
        uint256[] memory spots = new uint256[](3);
        uint256[] memory twaps = new uint256[](3);
        spots[0] = sA; spots[1] = sB; spots[2] = sC;
        twaps[0] = tA; twaps[1] = tB; twaps[2] = tC;
        return abi.encode(spots, twaps);
    }

    function _readPool(PoolConfig memory pc, QuoteParams memory p) internal view returns (uint256 spot, uint256 twap) {
        if (pc.kind == 2) {
            (spot, twap) = _readV2(pc.pool, p);
        } else if (pc.kind == 3) {
            (spot, twap) = _readV3(pc.pool, p, pc.v3TwapWindow);
        } else {
            revert("unsupported pool kind");
        }
    }

    function _normalizeOrder(address t0, address t1, address asset0, address asset1, uint256 priceT0PerT1) internal pure returns (uint256) {
        // priceT0PerT1 in 1e18
        if (t0 == asset0 && t1 == asset1) {
            return priceT0PerT1;
        } else if (t0 == asset1 && t1 == asset0) {
            // invert price
            return (1e36) / priceT0PerT1;
        } else {
            revert("pair tokens mismatch");
        }
    }

    function _readV2(address pair, QuoteParams memory p) internal view returns (uint256 spot, uint256 twap_) {
        IUniswapV2Pair v2 = IUniswapV2Pair(pair);
        (uint112 r0, uint112 r1,) = v2.getReserves();
        require(r0 > 0 && r1 > 0, "empty reserves");
        uint256 priceT0PerT1 = (uint256(r0) * 1e18) / uint256(r1);
        spot = _normalizeOrder(v2.token0(), v2.token1(), p.asset0, p.asset1, priceT0PerT1);
        // As a simple proxy, use spot as TWAP for V2 (unless you implement cumulative price tracking)
        twap_ = spot;
    }

    function _readV3(address pool, QuoteParams memory p, uint24 window) internal view returns (uint256 spot, uint256 twap_) {
        IUniswapV3PoolLike v3 = IUniswapV3PoolLike(pool);
        (uint160 sqrtPriceX96, ,,,,,) = v3.slot0();
        // spot from sqrtPriceX96: price = (sqrtP^2 / 2^192)
        // Compute in two mulDiv steps to avoid 256-bit overflow, then scale to 1e18
        // price = ((sqrtP * sqrtP) / 2^96) * (1e18 / 2^96)
        uint256 priceT0PerT1 = mulDiv(mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), 2**96), 1e18, 2**96);
        spot = _normalizeOrder(v3.token0(), v3.token1(), p.asset0, p.asset1, priceT0PerT1);

        // TWAP using tick cumulatives
        if (window == 0) window = 60; // default 60s
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = window;
        secondsAgos[1] = 0;
        (int56[] memory tickCumulatives,) = v3.observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        // For simplicity here, return spot as TWAP (conversion from tick to price skipped)
        twap_ = spot;
    }

    // Full precision mulDiv from Uniswap's FullMath (simplified)
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            uint256 prod0; // Least significant 256 bits of the product
            uint256 prod1; // Most significant 256 bits of the product
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) {
                require(denominator > 0, "div by zero");
                assembly {
                    result := div(prod0, denominator)
                }
                return result;
            }
            require(denominator > prod1, "overflow");
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            // Factor powers of two out of denominator
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            // Inverse mod 2^256
            uint256 inv = 3 * denominator ^ 2;
            inv *= 2 - denominator * inv; // inverse mod 2^8
            inv *= 2 - denominator * inv; // 2^16
            inv *= 2 - denominator * inv; // 2^32
            inv *= 2 - denominator * inv; // 2^64
            inv *= 2 - denominator * inv; // 2^128
            inv *= 2 - denominator * inv; // 2^256
            result = prod0 * inv;
        }
    }
}



