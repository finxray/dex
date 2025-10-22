// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPoint64x64} from "../FixedPoint64x64.sol";
import {LnQ64} from "../LnQ64.sol";

contract LnHarness {
    using FixedPoint64x64 for uint128;

    // ln(2) in Q64.64: 0xB17217F7D1CF79ABC9E3B39803F2F6AF
    uint128 public constant LN2_Q64 = 0xB17217F7D1CF79ABC9E3B39803F2F6AF;

    function lnQ64(uint128 xQ64) external pure returns (int128) {
        return LnQ64.ln(xQ64, LN2_Q64);
    }
}


