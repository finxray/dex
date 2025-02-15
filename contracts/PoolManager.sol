// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {SwapExecuter} from "./SwapExecuter.sol";


// ----------------- KISS -------------------- Keep it simple, stupit!----------------- KISS -------------------- Keep it simple, stupit

contract PoolManager is  SwapExecuter { 
    constructor(address defaultAlpha, address defaultBeta) SwapExecuter(defaultAlpha, defaultBeta) {}

    function addLiquidity() internal returns (uint256 shares) {}

    function removeLiquidity() internal returns (uint256 amount0, uint256 amount1) {}

}



