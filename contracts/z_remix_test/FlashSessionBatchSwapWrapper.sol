// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolManager} from "../interfaces/external/IPoolManager.sol";
import {Hop} from "../structs/Hop.sol";

contract FlashSessionBatchSwapWrapper {
    IPoolManager public immutable pm;
    Hop[] private _hops;
    uint256 public immutable amountIn;
    uint256 public immutable minOut;

    constructor(address _pm, Hop[] memory hops, uint256 _amountIn, uint256 _minOut) {
        pm = IPoolManager(_pm);
        amountIn = _amountIn;
        minOut = _minOut;
        _hops = hops;
    }

    function flashCallback(bytes calldata) external {
        pm.batchSwap(_hops, amountIn, minOut);
    }
}


