// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {IUniswapV3PoolLike} from "../../../Core/interfaces/external/uniswap/IUniswapV3Pool.sol";
import {IUniswapV3FactoryLike} from "../../../Core/interfaces/external/uniswap/IUniswapV3Factory.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {BaseAlias} from "./BaseAlias.sol";

error Math__DivByZero();
error Math__Overflow();

contract UniswapV3DataBridge is IDataBridge, BaseAlias {
    address public immutable factory;
    uint24 public immutable fee;
    
    error UniswapV3__PoolMissing();
    error UniswapV3__PoolUninitialized();
    error UniswapV3__SpotZero();
    error UniswapV3__PairMismatch();

    constructor(address _factory, uint24 _fee, uint24 /*_window*/, address _ext0, address _ext1, address _alias0, address _alias1)
        BaseAlias(_ext0, _ext1, _alias0, _alias1)
    { factory = _factory; fee = _fee; }

    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        (address a, address b) = _sortedCanonical();
        address pool = IUniswapV3FactoryLike(factory).getPool(a, b, fee);
        if (pool == address(0)) revert UniswapV3__PoolMissing();
        IUniswapV3PoolLike p = IUniswapV3PoolLike(pool);
        (uint160 sqrtPriceX96, ,,,,,) = p.slot0();
        if (sqrtPriceX96 == 0) revert UniswapV3__PoolUninitialized();
        address t0 = p.token0();
        address t1 = p.token1();
        uint8 d0 = IERC20Metadata(t0).decimals();
        uint8 d1 = IERC20Metadata(t1).decimals();

        // price as token1 per token0
        uint256 price1Per0 = _priceFromSqrtPX96(sqrtPriceX96, d0, d1);

        uint256 spot;
        if (params.asset0 == t1 && params.asset1 == t0) {
            // want token1 per token0
            spot = price1Per0;
        } else if (params.asset0 == t0 && params.asset1 == t1) {
            // want token0 per token1
            if (!(price1Per0 > 0)) revert UniswapV3__SpotZero();
            spot = (1e36) / price1Per0;
        } else {
            revert UniswapV3__PairMismatch();
        }
        return abi.encode(spot, spot);
    }

    function _sortedCanonical() internal view returns (address a, address b) {
        a = canonicalExt0; b = canonicalExt1; if (a > b) { (a, b) = (b, a); }
    }

    function _priceFromSqrtPX96(uint160 sqrtPriceX96, uint8 d0, uint8 d1) internal pure returns (uint256) {
        uint256 s = uint256(sqrtPriceX96);
        // First reduce one power of 2^96 to keep precision
        uint256 num1 = mulDiv(s, s, 2**96); // ~ s*s / 2^96
        uint256 scaleNum = 10 ** (uint256(18) + uint256(d0));
        uint256 scaleDen = (2**96) * (10 ** uint256(d1));
        return mulDiv(num1, scaleNum, scaleDen);
    }
}

function mulDiv(uint256 a, uint256 b, uint256 denominator) pure returns (uint256 result) {
    unchecked {
        uint256 prod0;
        uint256 prod1;
        assembly {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }
        if (prod1 == 0) {
            if (!(denominator > 0)) revert Math__DivByZero();
            assembly { result := div(prod0, denominator) }
            return result;
        }
        if (!(denominator > prod1)) revert Math__Overflow();
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


