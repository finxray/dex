// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Minimal FixedPoint Q64.64 utilities
/// @notice Focused subset for price formatting in bridges
library FixedPoint64x64 {
    uint256 internal constant ONE = 1 << 64; // 0x10000000000000000

    function fromUint(uint256 x) internal pure returns (uint128) {
        unchecked { return uint128(x << 64); }
    }

    function toUint(uint128 x) internal pure returns (uint256) {
        return uint256(x) >> 64;
    }

    function mul(uint128 x, uint128 y) internal pure returns (uint128) {
        // (x * y) >> 64
        return uint128((uint256(x) * uint256(y)) >> 64);
    }

    function div(uint128 x, uint128 y) internal pure returns (uint128) {
        require(y != 0, "DIV0");
        return uint128((uint256(x) << 64) / uint256(y));
    }

    function fromFraction(uint256 num, uint256 den) internal pure returns (uint128) {
        require(den != 0, "DIV0");
        return uint128((num << 64) / den);
    }
}


