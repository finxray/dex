// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./ERC6909.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PoolManager is ERC6909 {
    struct Pool {
        uint asset0Balance;
        uint asset1Balance;
    }

    struct Delta {
        int asset0;
        int asset1;
    }

    struct ExecutionParams {
        address asset0;
        address asset1;
        uint poolID;
        Delta delta;
        uint minOut; // Minimum amount user expects (for slippage protection)
    }

    mapping(uint => Pool) internal pools;

    receive() external payable {} // Allows contract to receive ETH

    function swap(ExecutionParams[] memory params) external payable {
        uint length = params.length;
        for (uint i = 0; i < length; i++) {
            ExecutionParams memory p = params[i];
            Pool storage pool = pools[p.poolID];

            uint newBalance0 = pool.asset0Balance;
            uint newBalance1 = pool.asset1Balance;

            if (p.delta.asset0 != 0) {
                if (p.delta.asset0 > 0) {
                    _transferOut(p.asset0, uint(p.delta.asset0), p.minOut);
                    newBalance0 -= uint(p.delta.asset0);
                } else {
                    _transferIn(p.asset0, uint(-p.delta.asset0));
                    newBalance0 += uint(-p.delta.asset0);
                }
            }

            if (p.delta.asset1 != 0) {
                if (p.delta.asset1 > 0) {
                    _transferOut(p.asset1, uint(p.delta.asset1), p.minOut);
                    newBalance1 -= uint(p.delta.asset1);
                } else {
                    _transferIn(p.asset1, uint(-p.delta.asset1));
                    newBalance1 += uint(-p.delta.asset1);
                }
            }

            // Store new balances
            pool.asset0Balance = newBalance0;
            pool.asset1Balance = newBalance1;
        }
    }

    function _transferIn(address asset, uint amount) private {
        if (asset == address(0)) {
            require(msg.value == amount, "Incorrect ETH sent");
        } else {
            require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }
    }

    function _transferOut(address asset, uint amount, uint minOut) private {
        require(amount >= minOut, "Slippage exceeded");
        if (asset == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            require(IERC20(asset).transfer(msg.sender, amount), "Transfer failed");
        }
    }
}