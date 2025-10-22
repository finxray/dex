// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPoint64x64} from "./FixedPoint64x64.sol";

/// @title Natural log for Q64.64 (approximate)
/// @notice Computes ln(x) using normalization + atanh series around 1: ln(x)=2*(y + y^3/3 + y^5/5 + ...), y=(x-1)/(x+1)
library LnQ64 {
    uint256 internal constant ONE_U256 = 1 << 64; // Q64.64 one

    /// @dev Returns ln(xQ64) in Q64.64, using external ln2Q64 constant (Q64.64)
    /// @param xQ64 input in Q64.64 (must be > 0)
    /// @param ln2Q64 precomputed ln(2) in Q64.64
    function ln(uint128 xQ64, uint128 ln2Q64) internal pure returns (int128) {
        require(xQ64 > 0, "LN_ZERO");

        uint128 one = uint128(ONE_U256);
        uint128 two = one << 1;

        // Normalize x into [1, 2)
        int256 k = 0;
        uint128 x = xQ64;
        while (x < one) { x = uint128(uint256(x) << 1); k -= 1; }
        while (x >= two) { x = uint128(uint256(x) >> 1); k += 1; }

        // y = (x-1)/(x+1) in Q64.64 (x in [1,2) => y in [0, 1/3])
        uint128 num = x - one;
        uint128 den = uint128(uint256(x) + ONE_U256);
        uint128 y = FixedPoint64x64.div(num, den);

        // Series sum: y + y^3/3 + y^5/5 + y^7/7 + y^9/9
        uint128 y2 = FixedPoint64x64.mul(y, y);
        uint128 y3 = FixedPoint64x64.mul(y2, y);
        uint128 y5 = FixedPoint64x64.mul(y3, y2);
        uint128 y7 = FixedPoint64x64.mul(y5, y2);
        uint128 y9 = FixedPoint64x64.mul(y7, y2);

        uint256 s = uint256(y);
        s += uint256(y3) / 3;
        s += uint256(y5) / 5;
        s += uint256(y7) / 7;
        s += uint256(y9) / 9;

        // ln_m = 2 * sum (still Q64.64)
        uint256 ln_m = s << 1;

        // ln(x) = ln_m + k*ln2
        int256 res = int256(ln_m);
        if (k > 0) {
            res += int256(k) * int256(uint256(ln2Q64));
        } else if (k < 0) {
            res -= int256(-k) * int256(uint256(ln2Q64));
        }
        
        // Clamp to int128 range instead of reverting
        if (res > type(int128).max) return type(int128).max;
        if (res < type(int128).min) return type(int128).min;
        return int128(res);
    }
}


