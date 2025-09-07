// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title Stoix Quoter Simple Average
/// @notice Averaging-based quoter using routed bridge bytes (d0,d1,d2,d3,dx)
contract StoixQuoterSimpleAverage is IQuoter {
    function quote(QuoteParams memory params, bytes memory data) external override returns (uint256) {
        (bytes memory d0, bytes memory d1, bytes memory d2, bytes memory d3, bytes memory dx) = abi.decode(data, (bytes, bytes, bytes, bytes, bytes));
        // silence warning for d3
        if (d3.length > 0) {
            // no-op; reserved for future
        }

        uint8 asset0Decimals = IERC20Metadata(params.asset0).decimals();
        uint8 asset1Decimals = IERC20Metadata(params.asset1).decimals();

        uint256[] memory prices = new uint256[](4);
        uint256 validCount = 0;

        if (d0.length >= 64) {
            try this._decodePrice(d0) returns (uint256 price) {
                if (price > 0) {
                    prices[validCount] = _normalizePrice(price);
                    validCount++;
                }
            } catch {}
        }
        if (d1.length >= 64) {
            try this._decodePrice(d1) returns (uint256 price) {
                if (price > 0) {
                    prices[validCount] = _normalizePrice(price);
                    validCount++;
                }
            } catch {}
        }
        if (d2.length >= 64) {
            try this._decodePrice(d2) returns (uint256 price) {
                if (price > 0) {
                    prices[validCount] = _normalizePrice(price);
                    validCount++;
                }
            } catch {}
        }
        if (dx.length >= 64) {
            try this._decodePrice(dx) returns (uint256 price) {
                if (price > 0) {
                    prices[validCount] = _normalizePrice(price);
                    validCount++;
                }
            } catch {}
        }

        if (validCount > 0) {
            uint256 totalPrice = 0;
            for (uint256 i = 0; i < validCount; i++) {
                totalPrice += prices[i];
            }
            uint256 avgPrice = totalPrice / validCount;

            uint8 inputDecimals = params.zeroForOne ? asset0Decimals : asset1Decimals;
            uint8 outputDecimals = params.zeroForOne ? asset1Decimals : asset0Decimals;
            uint256 inputStandard = _scaleToStandard(params.amount, inputDecimals);
            uint256 outputStandard = params.zeroForOne 
                ? _safeMulDiv(inputStandard, avgPrice, 1e18)
                : _safeMulDiv(inputStandard, 1e18, avgPrice);
            return _scaleFromStandard(outputStandard, outputDecimals);
        }

        {
            uint256 fallbackPrice = 4500 * 1e18;
            uint8 inputDecimals = params.zeroForOne ? asset0Decimals : asset1Decimals;
            uint8 outputDecimals = params.zeroForOne ? asset1Decimals : asset0Decimals;
            uint256 inputStandard = _scaleToStandard(params.amount, inputDecimals);
            uint256 outputStandard = params.zeroForOne
                ? _safeMulDiv(inputStandard, fallbackPrice, 1e18)
                : _safeMulDiv(inputStandard, 1e18, fallbackPrice);
            return _scaleFromStandard(outputStandard, outputDecimals);
        }
    }

    function _decodePrice(bytes memory data) external pure returns (uint256 price) {
        (price, ) = abi.decode(data, (uint256, uint256));
    }

    function _normalizePrice(uint256 price) internal pure returns (uint256) {
        return price < 1e18 ? (1e36) / price : price;
    }

    function _scaleToStandard(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) {
            return amount * (10 ** (18 - decimals));
        } else {
            return amount / (10 ** (decimals - 18));
        }
    }

    function _scaleFromStandard(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) {
            return amount / (10 ** (18 - decimals));
        } else {
            return amount * (10 ** (decimals - 18));
        }
    }

    function _safeMulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        if (a <= type(uint256).max / b) {
            return (a * b) / denominator;
        }
        uint256 quotient = a / denominator;
        uint256 remainder = a % denominator;
        uint256 firstPart = quotient * b;
        uint256 secondPart = (remainder * b) / denominator;
        return firstPart + secondPart;
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external override returns (uint256[] memory quotes) {
        quotes = new uint256[](params.amount.length);
        for (uint256 i = 0; i < params.amount.length; i++) {
            QuoteParams memory single = QuoteParams({
                asset0: params.asset0,
                asset1: params.asset1,
                quoter: params.quoter,
                amount: params.amount[i],
                asset0Balance: params.asset0Balances[i],
                asset1Balance: params.asset1Balances[i],
                bucketID: params.bucketID[i],
                zeroForOne: params.zeroForOne
            });
            quotes[i] = this.quote(single, data);
        }
    }
}


