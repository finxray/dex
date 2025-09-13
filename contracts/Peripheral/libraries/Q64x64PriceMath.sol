// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Q64.64 price math helpers for token amount conversion
library Q64x64PriceMath {
    uint256 internal constant Q_ONE = 1 << 64;

    function amountOutFromQ64(
        uint256 amountIn,
        uint8 decimalsIn,
        uint8 decimalsOut,
        uint128 priceQ64x64,
        bool zeroForOne
    ) internal pure returns (uint256 amountOut) {
        if (amountIn == 0) return 0;
        uint256 tenIn = 10 ** uint256(decimalsIn);
        uint256 tenOut = 10 ** uint256(decimalsOut);
        if (zeroForOne) {
            // out = amountIn * price * 10^decOut / (2^64 * 10^decIn)
            uint256 t1 = mulDiv(amountIn, uint256(priceQ64x64), Q_ONE);
            amountOut = mulDiv(t1, tenOut, tenIn);
        } else {
            // out = amountIn * 2^64 * 10^decOut / (price * 10^decIn)
            uint256 t1 = mulDiv(amountIn, tenOut, tenIn);
            amountOut = mulDiv(t1, Q_ONE, uint256(priceQ64x64));
        }
    }

    // 512-bit mulDiv adapted from Uniswap FullMath
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) {
                require(denominator > 0, "DIV0");
                assembly { result := div(prod0, denominator) }
                return result;
            }
            require(denominator > prod1, "OFL");
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            uint256 inv = 3 * denominator ^ 2;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            result = prod0 * inv;
        }
    }
}


