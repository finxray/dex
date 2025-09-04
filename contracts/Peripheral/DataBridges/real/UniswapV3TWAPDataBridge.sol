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

contract UniswapV3TWAPDataBridge is IDataBridge, BaseAlias {
    address public immutable factory;
    uint24 public immutable fee;
    uint24 public immutable twapWindow;
    
    error UniswapV3TWAP__PoolMissing();
    error UniswapV3TWAP__PoolUninitialized();
    error UniswapV3TWAP__PriceZero();
    error UniswapV3TWAP__PairMismatch();

    constructor(address _factory, uint24 _fee, uint24 _window, address _ext0, address _ext1, address _alias0, address _alias1)
        BaseAlias(_ext0, _ext1, _alias0, _alias1)
    { factory = _factory; fee = _fee; twapWindow = _window == 0 ? 10800 : _window; }

    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        (address a, address b) = _sortedCanonical();
        address pool = IUniswapV3FactoryLike(factory).getPool(a, b, fee);
        if (pool == address(0)) revert UniswapV3TWAP__PoolMissing();
        IUniswapV3PoolLike p = IUniswapV3PoolLike(pool);
        (uint160 sqrtPriceX96, ,,,,,) = p.slot0();
        if (sqrtPriceX96 == 0) revert UniswapV3TWAP__PoolUninitialized();
        address t0 = p.token0();
        address t1 = p.token1();
        uint8 d0 = IERC20Metadata(t0).decimals();
        uint8 d1 = IERC20Metadata(t1).decimals();

        uint256 spot = _priceFromSqrtPX96(sqrtPriceX96, d0, d1);

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow; secondsAgos[1] = 0;
        (int56[] memory tickCumulatives,) = p.observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        
        // Calculate TWAP using standard Uniswap V3 methodology
        // Note: On forks with limited price movement, TWAP may legitimately be round numbers
        int24 avgTick = int24(delta / int56(uint56(twapWindow)));
        
        // Calculate TWAP with safety checks
        uint256 twap;
        if (avgTick > 887200 || avgTick < -887200 || delta == 0) {
            // Extreme tick values or no price movement, use spot price as fallback
            twap = spot;
        } else {
            uint160 twapSqrtPX96 = _getSqrtRatioAtTick(avgTick);
            twap = _priceFromSqrtPX96(twapSqrtPX96, d0, d1);
            
            // Additional sanity check: if TWAP is more than 100x different from spot, use spot
            if (twap > spot * 100 || spot > twap * 100) {
                twap = spot;
            }
        }

        if (params.asset0 == t1 && params.asset1 == t0) {
            // keep as token1 per token0
        } else if (params.asset0 == t0 && params.asset1 == t1) {
            if (!(spot > 0 && twap > 0)) revert UniswapV3TWAP__PriceZero();
            spot = (1e36) / spot;
            twap = (1e36) / twap;
        } else {
            revert UniswapV3TWAP__PairMismatch();
        }
        return abi.encode(spot, twap);
    }

    function _sortedCanonical() internal view returns (address a, address b) { a = canonicalExt0; b = canonicalExt1; if (a > b) { (a, b) = (b, a); } }

    function _priceFromSqrtPX96(uint160 sqrtPriceX96, uint8 d0, uint8 d1) internal pure returns (uint256) {
        uint256 s = uint256(sqrtPriceX96);
        // First reduce one power of 2^96 to keep precision
        uint256 num1 = mulDiv(s, s, 2**96); // ~ s*s / 2^96
        uint256 scaleNum = 10 ** (uint256(18) + uint256(d0));
        uint256 scaleDen = (2**96) * (10 ** uint256(d1));
        return mulDiv(num1, scaleNum, scaleDen);
    }

    function _getSqrtRatioAtTick(int24 tick) internal pure returns (uint160) {
        unchecked {
            uint256 absTick = uint256(tick < 0 ? -int256(tick) : int256(tick));
            uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
            if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (tick > 0) ratio = type(uint256).max / ratio;
            return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
        }
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
