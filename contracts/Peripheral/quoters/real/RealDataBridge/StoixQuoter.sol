// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title Stoix Quoter (real bridges, 4-source wired) - skeleton
/// @notice Decodes routed bytes (d0,d1,d2,d3,dx). Pricing logic to be added later.
contract StoixQuoter is IQuoter {
    event StoixComponents(
        uint256 m,
        uint256 execPrice,
        int256 skewBps,
        uint256 sizeBps,
        uint8 sizeTier,
        uint256 dstBps,
        uint256 dclBps,
        uint8 vShortPair,
        uint8 vLongPair,
        uint8 kPair,
        uint256 fS_bps,
        uint256 fL_bps,
        uint256 kMod_bps,
        uint256 gammaBps,
        int256 midAdjBps,
        uint256 baseSpread,
        uint256 sizeCurveBps,
        uint256 Ubps,
        uint256 spreadBps
    );
    // Per-asset packed parameters (see Stoix Model.md)
    // [0..7] vShort8, [8..15] vLong8, [16..23] k8, [24..45] tsShortMin22, [46..67] tsLongMin22, [68..75] classId8
    mapping(address => uint256) public assetParams;

    // Small LUTs/scales (bps)
    uint16[16] private GAMMA_BPS = [
        25, 50, 75, 100, 125, 150, 175, 200,
        225, 250, 275, 300, 325, 350, 375, 400
    ];

    uint16[8] private SIZE_CURVE_BPS = [0, 2, 5, 10, 15, 25, 40, 60];

    // Set per-asset packed slot (no access control here for brevity)
    function setAssetParams(address asset, uint256 packed) external {
        assetParams[asset] = packed;
    }

    function quote(QuoteParams memory params, bytes memory data) external override returns (uint256) {
        (bytes memory d0, bytes memory d1, bytes memory d2, bytes memory d3, bytes memory dx) = abi.decode(data, (bytes, bytes, bytes, bytes, bytes));
        // Decode prices if present
        (uint256 spot, bool hasSpot) = _tryDecodePrice(d0);
        (uint256 twap, bool hasTwap) = _tryDecodePrice(d1);
        (uint256 uni2, bool hasV2) = _tryDecodePrice(d2);
        (uint256 cl, bool hasCL) = _tryDecodePrice(dx);

        // Normalize all to asset1/asset0 in 1e18
        if (hasSpot) spot = _normalizePrice(spot);
        if (hasTwap) twap = _normalizePrice(twap);
        if (hasV2) uni2 = _normalizePrice(uni2);
        if (hasCL) cl = _normalizePrice(cl);

        // Base mid: prefer TWAP, else average available
        uint256 m = 0;
        if (hasTwap) {
            m = twap;
        } else {
            uint256 sum = 0; uint256 n = 0;
            if (hasSpot) { sum += spot; n++; }
            if (hasV2) { sum += uni2; n++; }
            if (hasCL) { sum += cl; n++; }
            if (n == 0) {
                // fallback
                m = 4500 * 1e18;
            } else {
                m = sum / n;
            }
        }

        // Uncertainty from divergences
        uint256 dstBps = 0;
        if (hasSpot && m > 0) {
            uint256 a = spot > m ? spot - m : m - spot;
            dstBps = (a * 10000) / m;
        }
        uint256 dclBps = 0;
        if (hasCL && m > 0) {
            uint256 a2 = cl > m ? cl - m : m - cl;
            dclBps = (a2 * 10000) / m;
        }
        uint256 maxDivBps = dstBps > dclBps ? dstBps : dclBps;

        // Pair params from per-asset slots
        (uint8 vs8_0, uint8 vl8_0, uint8 k8_0) = _decodeLevels(assetParams[params.asset0]);
        (uint8 vs8_1, uint8 vl8_1, uint8 k8_1) = _decodeLevels(assetParams[params.asset1]);
        uint8 vShortPair = vs8_0 >= vs8_1 ? vs8_0 : vs8_1;
        uint8 vLongPair = vl8_0 >= vl8_1 ? vl8_0 : vl8_1;
        uint8 kPair = k8_0 <= k8_1 ? k8_0 : k8_1;

        // Map levels to bps
        uint256 fS_bps = _mapShortVolToBps(vShortPair);  // ~10..200 bps
        uint256 fL_bps = _mapLongVolToBps(vLongPair);    // ~20..400 bps
        uint256 kMod_bps = _mapKToBps(kPair);            // 5000..15000 (i.e., 50%..150%)

        // Gamma from bucketID (lower 4 bits)
        uint8 gammaLevel = uint8(params.bucketID & 0x0F);
        uint256 gammaBps = GAMMA_BPS[gammaLevel];

        // Decimals and standard scaling
        uint8 dec0 = IERC20Metadata(params.asset0).decimals();
        uint8 dec1 = IERC20Metadata(params.asset1).decimals();
        uint256 inv0Std = _scaleToStandard(params.asset0Balance, dec0);
        uint256 inv1Std = _scaleToStandard(params.asset1Balance, dec1);

        // Values in asset1 terms (1e18 standard units)
        uint256 value0Std = (inv0Std * m) / 1e18;
        uint256 value1Std = inv1Std;
        uint256 tvlStd = value0Std + value1Std + 1;

        // skewNorm in 1e4 (bps) signed represented as int256
        int256 numSkew = int256(value1Std) - int256(value0Std);
        int256 skewBps = int256((uint256(_abs(numSkew)) * 10000) / tvlStd);
        if (numSkew < 0) skewBps = -skewBps;
        // clamp to ±2500 bps (~±0.25)
        if (skewBps > 2500) skewBps = 2500; else if (skewBps < -2500) skewBps = -2500;

        // Trade size normalization
        uint256 inputStd = _scaleToStandard(params.amount, params.zeroForOne ? dec0 : dec1);
        uint256 tradeValueStd = params.zeroForOne ? (inputStd * m) / 1e18 : inputStd;
        uint256 sizeBps = (tradeValueStd * 10000) / tvlStd; // 0..10000 bps
        uint256 sizeTier = sizeBps >= 8750 ? 7 : (sizeBps >= 7500 ? 6 : (sizeBps >= 5000 ? 5 : (sizeBps >= 2500 ? 4 : (sizeBps >= 1250 ? 3 : (sizeBps >= 625 ? 2 : (sizeBps >= 250 ? 1 : 0))))));
        uint256 sizeCurveBps = SIZE_CURVE_BPS[sizeTier];

        // Uncertainty Ubps
        // u ≈ maxDivBps / max(1, fL_bps); Ubps = lambdaU * u, with lambdaU=100
        uint256 u_num = maxDivBps * 100; // lambdaU=100
        uint256 u_den = fL_bps > 0 ? fL_bps : 1;
        uint256 Ubps = u_num / u_den; // capped naturally by divergence/vol
        if (Ubps > 300) Ubps = 300; // cap at +300 bps

        // midAdjBps = sign(skew) * (gammaBps * fS_bps * |skew|bps) / kMod_bps
        uint256 midAdjMagnitude = ((gammaBps * fS_bps) / 100) * uint256(_abs(skewBps)) / (kMod_bps == 0 ? 1 : kMod_bps); // scale mild
        if (midAdjMagnitude > 2000) midAdjMagnitude = 2000; // cap ±2000 bps
        int256 midAdjBpsSigned = numSkew >= 0 ? int256(midAdjMagnitude) : -int256(midAdjMagnitude);

        // spreadBps = (gamma * fL / k) + sizeCurve + Ubps
        uint256 baseSpread = ((gammaBps * fL_bps) / 100) / (kMod_bps == 0 ? 1 : kMod_bps);
        if (baseSpread > 3000) baseSpread = 3000;
        uint256 spreadBps = baseSpread + sizeCurveBps + Ubps;

        // exec price
        uint256 execBpsAdj = uint256(int256(spreadBps) + midAdjBpsSigned >= 0 ? int256(spreadBps) + midAdjBpsSigned : int256(0));
        uint256 execPrice = params.zeroForOne
            ? (m * (10000 + execBpsAdj)) / 10000
            : (m * (10000 - execBpsAdj)) / 10000;

        emit StoixComponents(
            m,
            execPrice,
            skewBps,
            sizeBps,
            uint8(sizeTier),
            dstBps,
            dclBps,
            vShortPair,
            vLongPair,
            kPair,
            fS_bps,
            fL_bps,
            kMod_bps,
            gammaBps,
            midAdjBpsSigned,
            baseSpread,
            sizeCurveBps,
            Ubps,
            spreadBps
        );

        // Convert to output amount
        uint8 inDec = params.zeroForOne ? dec0 : dec1;
        uint8 outDec = params.zeroForOne ? dec1 : dec0;
        uint256 inStd = _scaleToStandard(params.amount, inDec);
        uint256 outStd = params.zeroForOne ? (inStd * execPrice) / 1e18 : (inStd * 1e18) / execPrice;
        return _scaleFromStandard(outStd, outDec);
    }
    
    function _decodePrice(bytes memory data) external pure returns (uint256 price) {
        (price, ) = abi.decode(data, (uint256, uint256));
    }

    function _tryDecodePrice(bytes memory data) internal pure returns (uint256 price, bool ok) {
        if (data.length >= 64) {
            (uint256 p, ) = abi.decode(data, (uint256, uint256));
            if (p > 0) return (p, true);
        }
        return (0, false);
    }

    // Normalize price to USDC per WETH (>= 1) at 1e18 scale
    function _normalizePrice(uint256 price) internal pure returns (uint256) {
        // If price < 1e18, interpret as WETH per USDC and invert
        return price < 1e18 ? (1e36) / price : price;
    }
    
    // Scale any amount to 1e18 standard scale
    function _scaleToStandard(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) {
            return amount * (10 ** (18 - decimals));
        } else {
            return amount / (10 ** (decimals - 18));
        }
    }
    
    // Scale from 1e18 standard scale to target decimals
    function _scaleFromStandard(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) {
            return amount / (10 ** (18 - decimals));
        } else {
            return amount * (10 ** (decimals - 18));
        }
    }

    // Safe multiplication and division that avoids overflow
    function _safeMulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        
        // For (a * b) / denominator, check if multiplication would overflow
        if (a <= type(uint256).max / b) {
            // Safe to multiply directly
            return (a * b) / denominator;
        }
        
        // Overflow would occur, so rearrange: (a / denominator) * b + ((a % denominator) * b) / denominator
        // This preserves precision by handling the remainder separately
        uint256 quotient = a / denominator;
        uint256 remainder = a % denominator;
        
        // First part: (a / denominator) * b
        uint256 firstPart = quotient * b;
        
        // Second part: ((a % denominator) * b) / denominator
        uint256 secondPart = (remainder * b) / denominator;
        
        return firstPart + secondPart;
    }

    function _decodeLevels(uint256 packed) internal pure returns (uint8 vS8, uint8 vL8, uint8 k8) {
        vS8 = uint8(packed & 0xFF);
        vL8 = uint8((packed >> 8) & 0xFF);
        k8 = uint8((packed >> 16) & 0xFF);
    }

    function _mapShortVolToBps(uint8 level) internal pure returns (uint256) {
        // 10..200 bps linearly
        return 10 + (uint256(level) * 190) / 255;
    }

    function _mapLongVolToBps(uint8 level) internal pure returns (uint256) {
        // 20..400 bps linearly
        return 20 + (uint256(level) * 380) / 255;
    }

    function _mapKToBps(uint8 level) internal pure returns (uint256) {
        // 50%..150% in bps (5000..15000)
        return 5000 + (uint256(level) * 10000) / 255;
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
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

    function _decodeTwoBytes(bytes memory payload) external pure returns (bytes memory a, bytes memory b) {
        (a, b) = abi.decode(payload, (bytes, bytes));
    }
}


