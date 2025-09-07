// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {IUniswapV2Pair} from "../../../Core/interfaces/external/uniswap/IUniswapV2Pair.sol";
import {IUniswapV2Factory} from "../../../Core/interfaces/external/uniswap/IUniswapV2Factory.sol";
import {BaseAlias} from "./BaseAlias.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

error Math__DivByZero();
error Math__Overflow();

interface IUniswapV2PairFull is IUniswapV2Pair {
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
}

contract UniswapV2DataBridge is IDataBridge, BaseAlias {
    address public immutable factory;
    uint24 public immutable twapWindow;
    
    error UniswapV2__PairMissing();
    error UniswapV2__EmptyReserves();
    error UniswapV2__PairTokensMismatch();

    constructor(address _factory, address _ext0, address _ext1, address _alias0, address _alias1)
        BaseAlias(_ext0, _ext1, _alias0, _alias1)
    { factory = _factory; twapWindow = 10800; }
    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        address pair = IUniswapV2Factory(factory).getPair(canonicalExt0, canonicalExt1);
        if (pair == address(0)) revert UniswapV2__PairMissing();
        IUniswapV2PairFull p = IUniswapV2PairFull(pair);
        (uint112 r0, uint112 r1, ) = p.getReserves();
        if (!(r0 > 0 && r1 > 0)) revert UniswapV2__EmptyReserves();
        address token0 = p.token0();
        address token1 = p.token1();
        uint8 d0 = IERC20Metadata(token0).decimals();
        uint8 d1 = IERC20Metadata(token1).decimals();
        
        // We need to return the price in the format expected by QuoteParams
        // The price should be asset1 per asset0 (USDC per WETH when asset0=WETH, asset1=USDC)
        uint256 spot;
        
        if (params.asset0 == token0 && params.asset1 == token1) {
            // Want token1 per token0 (e.g., WETH per USDC if token0=USDC, token1=WETH)
            // Price = r1/r0 scaled to 1e18
            uint256 scaleNum = 10 ** (uint256(18) + uint256(d0));
            uint256 scaleDen = 10 ** uint256(d1);
            spot = mulDiv(uint256(r1), scaleNum, uint256(r0) * scaleDen);
        } else if (params.asset0 == token1 && params.asset1 == token0) {
            // Want token0 per token1 (e.g., USDC per WETH if token0=USDC, token1=WETH)
            // Price = r0/r1 scaled to 1e18
            uint256 scaleNum = 10 ** (uint256(18) + uint256(d1));
            uint256 scaleDen = 10 ** uint256(d0);
            spot = mulDiv(uint256(r0), scaleNum, uint256(r1) * scaleDen);
        } else {
            revert UniswapV2__PairTokensMismatch();
        }

        // TWAP via cumulative prices if enough time elapsed; for now, treat twap = spot
        uint256 twap = spot;
        // If we had oracle updates between ts-window and ts, we could compute, but without calling sync/observe,
        // V2 cumulative oracles require passing time. For safety, return spot as twap here.
        // Hook left for future: cache historical cumulative snapshots externally to compute TWAP.

        return abi.encode(spot, block.timestamp);
    }

    function _normalizeToCanonical(address t0, address t1, uint256 priceT0PerT1) internal view returns (uint256) {
        // priceT0PerT1 = token0 per token1 (USDC per WETH in our case)
        // We want: canonicalExt0 per canonicalExt1 (WETH per USDC when canonicalExt0=WETH)
        if (t0 == canonicalExt0 && t1 == canonicalExt1) return priceT0PerT1;
        if (t0 == canonicalExt1 && t1 == canonicalExt0) return (1e36) / priceT0PerT1;
        revert UniswapV2__PairTokensMismatch();
    }
}

// 512-bit mulDiv from Uniswap FullMath (simplified)
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


