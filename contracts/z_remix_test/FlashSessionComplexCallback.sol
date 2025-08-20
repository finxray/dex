// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolManager} from "../interfaces/external/IPoolManager.sol";
import {Hop} from "../structs/Hop.sol";

contract FlashSessionComplexCallback {
    IPoolManager public immutable poolManager;
    address public immutable A;
    address public immutable B;
    address public immutable C;
    address public immutable simple;
    address public immutable alpha;
    bytes3 public immutable SIMPLE;
    bytes3 public immutable ALPHA;
    uint256 public immutable add0;
    uint256 public immutable add1;
    uint256 public immutable swapAmt;

    constructor(
        address _pm,
        address _A,
        address _B,
        address _C,
        address _simple,
        address _alpha,
        bytes3 _SIMPLE,
        bytes3 _ALPHA,
        uint256 _add0,
        uint256 _add1,
        uint256 _swapAmt
    ) {
        poolManager = IPoolManager(_pm);
        A = _A; B = _B; C = _C; simple = _simple; alpha = _alpha;
        SIMPLE = _SIMPLE; ALPHA = _ALPHA; add0 = _add0; add1 = _add1; swapAmt = _swapAmt;
    }

    function flashCallback(bytes calldata) external {
        // Add liquidity to A-B and B-C pools
        uint256 liqAB = poolManager.addLiquidity(A, B, simple, SIMPLE, add0, add1);
        uint256 liqBC = poolManager.addLiquidity(B, C, alpha, ALPHA, add1, add1);

        // Build batch: A->B on simple, then B->C on alpha
        Hop[] memory hops = new Hop[](2);
        // Hop 0: A->B
        hops[0] = Hop({
            asset0: A,
            asset1: B,
            quoter: simple,
            markings: _single(SIMPLE),
            amounts: _single(swapAmt),
            zeroForOne: true
        });
        // Hop 1: B->C
        hops[1] = Hop({
            asset0: B,
            asset1: C,
            quoter: alpha,
            markings: _single(ALPHA),
            amounts: _single(swapAmt / 2),
            zeroForOne: true
        });

        poolManager.batchSwap(hops, swapAmt, 1);

        // Remove liquidity from both pools
        poolManager.removeLiquidity(A, B, simple, SIMPLE, liqAB);
        poolManager.removeLiquidity(B, C, alpha, ALPHA, liqBC);
    }

    function _single(bytes3 x) internal pure returns (bytes3[] memory a) {
        a = new bytes3[](1); a[0] = x;
    }
    function _single(uint256 x) internal pure returns (uint256[] memory a) {
        a = new uint256[](1); a[0] = x;
    }
}


