// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {IUniswapV2Pair} from "../../../Core/interfaces/external/uniswap/IUniswapV2Pair.sol";
import {IUniswapV2Factory} from "../../../Core/interfaces/external/uniswap/IUniswapV2Factory.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract SushiV2DataBridge is IDataBridge {
    address public immutable factory;
    address public immutable canonicalExt0;
    address public immutable canonicalExt1;
    
    error SushiV2__PairMissing();
    error SushiV2__EmptyReserves();
    error SushiV2__PairTokensMismatch();
    error SushiV2__PairMismatch();

    constructor(address _factory, address _ext0, address _ext1) { factory = _factory; canonicalExt0 = _ext0; canonicalExt1 = _ext1; }
    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        address pair = IUniswapV2Factory(factory).getPair(canonicalExt0, canonicalExt1);
        if (pair == address(0)) revert SushiV2__PairMissing();
        IUniswapV2Pair p = IUniswapV2Pair(pair);
        (uint112 r0, uint112 r1,) = p.getReserves();
        if (!(r0 > 0 && r1 > 0)) revert SushiV2__EmptyReserves();
        address t0 = p.token0();
        address t1 = p.token1();
        uint8 d0 = IERC20Metadata(t0).decimals();
        uint8 d1 = IERC20Metadata(t1).decimals();
        // price t0 per t1 in 1e18
        uint256 priceT0PerT1 = (uint256(r0) * (10 ** (uint256(18) + uint256(d1)))) / (uint256(r1) * (10 ** uint256(d0)));
        // normalize to canonical (ext0/ext1)
        uint256 canonical;
        if (t0 == canonicalExt0 && t1 == canonicalExt1) canonical = priceT0PerT1;
        else if (t0 == canonicalExt1 && t1 == canonicalExt0) canonical = (1e36) / priceT0PerT1;
        else revert SushiV2__PairTokensMismatch();
        // orient to requested order
        uint256 spot;
        if (params.asset0 == canonicalExt0 && params.asset1 == canonicalExt1) spot = canonical;
        else if (params.asset0 == canonicalExt1 && params.asset1 == canonicalExt0) spot = (1e36) / canonical;
        else revert SushiV2__PairMismatch();
        return abi.encode(spot, spot);
    }
}


