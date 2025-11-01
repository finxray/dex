// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IQuoter} from "../../../../Core/interfaces/internal/quoters/IQuoter.sol";
import {QuoteParams, QuoteParamsBatch} from "../../../../Core/structs/QuoteParams.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Q64x64PriceMath} from "../../../libraries/Q64x64PriceMath.sol";
import {StoicovTables} from "../../../libraries/StoicovTables.sol";
import {InventorySkew} from "../../../libraries/InventorySkew.sol";

/// @title Stoicov Quoter (skeleton)
/// @notice Placeholder for Stoicov (Avellaneda–Stoikov) quoting model; decodes bridge payload later.
/// @dev Model (standard scientific notation, no on-chain adaptations here):
///      - Aggregated midprice:  Ŝ = Agg({S_i})
///      - Reservation price:    r = Ŝ − q·γ·σ²·τ
///      - Optimal half-spread:  δ* = (1/γ)·ln(1 + γ/k) + (γ·σ²·τ)/2
///      - Quotes:               p_bid = r − δ*,  p_ask = r + δ*
///
///      Chosen ln-free approximation for on-chain use (let z = γ/k):
///        • Taylor (2-term, small-z approximation):
///            δ*_approx = 1/k − γ/(2·k²) + (γ·σ²·τ)/2
///          - Rationale: ultra-cheap (mul/div only) and accurate when γ ≪ k, which is our intended regime.
///          - Implementation note: compute in integer math with adequate scaling; avoid underflow by ordering ops.
///      (Alternatives if needed in future)
///        • Padé [2/1]:  (1/k) · (1 + z/6) / (1 + (2/3)·z) + (γ·σ²·τ)/2 (wider z-range)
///        • Padé [1/1]:  (1/k) · 1/(1 − z/2) + (γ·σ²·τ)/2 (ensure z < 2 or clamp)
///
///      Using the Taylor approximation in quotes:
///        - Reservation:   r = Ŝ − q·γ·σ²·τ
///        - Half-spread:   δ*_approx = 1/k − γ/(2·k²) + (γ·σ²·τ)/2
///        - Quotes:        p_bid = r − δ*_approx,  p_ask = r + δ*_approx
///
///      where q is signed inventory, γ is risk aversion, σ is volatility, τ is time to horizon, and
///      k > 0 is the order-arrival decay slope (λ(δ) = A·e^{−kδ}).
///
///      Implementation notes for this project:
///      - k is chosen from 16 discrete levels via bucketID; levels are reverse-engineered to match
///        target minimal half-spreads δ_min in bps at low γ (γ ≈ 1e−6), using k ≈ 1/δ (δ in relative units):
///          δ_min[bps]:  [ 0.5,   1,   2.5,   5,   7.5,  10,   15,   20,   30,   50,   75,  100,  150,  200,  300,  500 ]
///          k (≈1/δ):   [20000,10000, 4000,2000, 1333,1000,  667,  500,  333,  200,  133,  100,   67,   50,   33,   20 ]
///      - γ levels: we use two general tiers γ_mid = 5e−6 and γ_high = 2e−5.
///        γ_low = 1e−6 is applied implicitly when inventory mode = 00 (inventory not a concern).
///      - Inventory mode is encoded in 2 bits of bucketID (invBits = (bucketID >> 4) & 0b11):
///          00 → inventory not a concern; apply γ_low (inventory term minimized)
///          01 → risky asset is asset0; optimal (target) risky inventory = 0
///          10 → risky asset is asset1; optimal (target) risky inventory = 0
///          11 → maintain approximately equal value of asset0 and asset1 (value-neutral)
///      - Gamma selector bit (gSel) is bucketID bit #6 (0-indexed). If invBits≠00: gSel=0 ⇒ γ_mid; gSel=1 ⇒ γ_high.
///      - On-chain numeric representation and decoding of data (Ŝ, q, σ, τ, direction) will be wired later.
contract StoicovQuoter is IQuoter {
    using Q64x64PriceMath for uint256;
    // ---- BucketID bit layout helpers -----------------------------------------------------------
    // Lower 4 bits (0..3): k index (0..15)
    uint8 internal constant K_MASK    = 0x0F;     // 0000_1111
    // Next 2 bits (4..5): inventory mode
    uint8 internal constant INV_MASK  = 0x30;     // 0011_0000
    uint8 internal constant INV_SHIFT = 4;
    // Bit 6: gamma selector (0 => γ_mid, 1 => γ_high) when inv mode != 00
    uint8 internal constant GAMMA_MASK  = 0x40;   // 0100_0000
    uint8 internal constant GAMMA_SHIFT = 6;
    // Bit 7: fixed-σ marker (σ equals target level for the bucket; no external σ needed)
    uint16 internal constant SIGMA_FIXED_MASK = 0x0080; // 1000_0000
    // Bit 8: gamma-zero marker (force γ = 0 regardless of inv mode/gSel)
    uint16 internal constant GAMMA_ZERO_MASK  = 0x0100; // 0001_0000_0000

    // Inventory mode decoded values (after shifting by INV_SHIFT)
    uint8 internal constant INV_MODE_NO_INVENTORY  = 0; // 00
    uint8 internal constant INV_MODE_RISKY0_ZERO   = 1; // 01
    uint8 internal constant INV_MODE_RISKY1_ZERO   = 2; // 10
    uint8 internal constant INV_MODE_VALUE_NEUTRAL = 3; // 11

    // Decoders
    function _kIndex(uint16 bucketID) internal pure returns (uint8) {
        return uint8(bucketID & K_MASK);
    }

    function _invMode(uint16 bucketID) internal pure returns (uint8) {
        return uint8((bucketID & INV_MASK) >> INV_SHIFT);
    }

    function _gammaScalePpb(uint16 bucketID) internal pure returns (uint32) {
        if ((bucketID & GAMMA_ZERO_MASK) != 0) return 0; // explicit γ = 0
        uint8 invMode = _invMode(bucketID);
        if (invMode == INV_MODE_NO_INVENTORY) return GAMMA_LOW_SCALE_PPB; // implicit low γ
        uint8 gSel = uint8((bucketID & GAMMA_MASK) >> GAMMA_SHIFT);
        return gSel == 0 ? GAMMA_MID_SCALE_PPB : GAMMA_HIGH_SCALE_PPB;
    }

    function _sigmaIsFixed(uint16 bucketID) internal pure returns (bool) {
        return (bucketID & SIGMA_FIXED_MASK) != 0;
    }

    // ---- Precomputed tables (PPB scale) --------------------------------------------------------
    // We hardcode 1/k and γ/(2·k²) to save on arithmetic.
    // Units: parts-per-billion (PPB) relative to price.
    // For k-levels corresponding to δ_min[bps]:
    //   [ 0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500 ]
    // k: [20000,10000,4000,2000,1333,1000,667,500,333,200,133,100,67,50,33,20]

    // invK_ppb[idx] = floor(1e9 / k)
    function _invKppb(uint8 idx) internal pure returns (uint32) { return StoicovTables.invKppb(idx); }

    function _term2ByGamma(uint8 idx, uint32 gammaPpb) internal pure returns (uint32) { return StoicovTables.term2ByGamma(idx, gammaPpb); }

    // For SIGMA_FIXED buckets where σ = δ_min = 1/k and τ = 1,
    // term3 = (γ·σ²·τ)/2 equals term2, so δ* reduces to invK_ppb.
    // We keep a helper for clarity; it mirrors term2 tables.
    function _term3FixedByGamma(uint8 idx, uint32 gammaPpb) internal pure returns (uint32) { return StoicovTables.term2ByGamma(idx, gammaPpb); }

    // γ scale factors (risk aversion). gamma = scale × k_small where k_small = 1/δ_min_bps
    uint32 internal constant GAMMA_SCALE_PPB = StoicovTables.GAMMA_SCALE_PPB; // informational scale
    uint32 internal constant GAMMA_LOW_SCALE_PPB   = StoicovTables.GAMMA_LOW_SCALE_PPB;   // 0.0 scale
    uint32 internal constant GAMMA_MID_SCALE_PPB   = StoicovTables.GAMMA_MID_SCALE_PPB;   // 0.5 scale  
    uint32 internal constant GAMMA_HIGH_SCALE_PPB  = StoicovTables.GAMMA_HIGH_SCALE_PPB;  // 1.0 scale

    // ---- Core math helpers ---------------------------------------------------------------------
    // Taylor-approx half-spread using precomputed terms:
    //   δ*_approx = (1/k) − (γ/(2·k²)) + (γ·σ²·τ)/2
    // We store (1/k) and (γ/(2·k²)) in PPB tables per k-index and γ-tier.
    // When SIGMA_FIXED is set, σ = 1/k and τ = 1, hence term3 == term2 and δ* = 1/k.
    function _deltaStarApproxPrecompPpb(
        uint16 bucketID,
        uint32 sigma2TauPpb // ignored if _sigmaIsFixed(bucketID) or γ = 0
    ) internal pure returns (uint64) {
        uint8 idx = _kIndex(bucketID);
        uint32 scalePpb = _gammaScalePpb(bucketID);
        uint32 base = _invKppb(idx);
        if (scalePpb == 0) return uint64(base);

        if (_sigmaIsFixed(bucketID)) {
            uint32 t2 = _term2ByGamma(idx, scalePpb);
            uint32 t3 = _term3FixedByGamma(idx, scalePpb); // equals t2 for fixed σ
            uint32 res = base + t3 >= t2 ? base + t3 - t2 : 0;
            return uint64(res);
        }

        // On-the-fly term3 using provided σ²·τ in PPB: (γ_ppb * σ²τ_ppb) / (2 * 1e9)
        uint32 gammaPpb = StoicovTables.gammaFromScale(idx, scalePpb);
        uint256 term3 = (uint256(gammaPpb) * uint256(sigma2TauPpb)) / 2 / 1_000_000_000;
        uint32 t2dyn = _term2ByGamma(idx, scalePpb);
        uint256 resDyn = uint256(base) + term3 >= t2dyn ? uint256(base) + term3 - t2dyn : 0;
        return uint64(resDyn);
    }

    // Public helper: indicates whether σ is required for this bucket.
    // σ is not needed when: γ = 0 OR SIGMA_FIXED is set.
    function requiresSigmaData(uint16 bucketID) external pure returns (bool) {
        uint32 scalePpb = _gammaScalePpb(bucketID);
        if (scalePpb == 0) return false;
        return !_sigmaIsFixed(bucketID);
    }

    // ---- Inventory helpers ---------------------------------------------------------------------
    // Returns signed inventory q in raw asset0 units, using mid price in Q64.64 to convert asset1 → asset0.
    // Mode semantics (after INV bits decoding):
    //   00: q = 0
    //   01: q = inventory0_raw
    //   10: q = inventory1_raw converted to asset0 units at mid
    //   11: q = inventory0_raw − inventory1_in_asset0_raw
    function _inventoryQAsset0Raw(
        uint16 bucketID,
        address asset0,
        address asset1,
        uint256 inventory0Raw,
        uint256 inventory1Raw,
        uint128 midQ64x64
    ) internal view returns (int256 qAsset0Raw) {
        uint8 mode = _invMode(bucketID);
        if (mode == INV_MODE_NO_INVENTORY) return 0;

        uint8 dec0 = IERC20Metadata(asset0).decimals();
        uint8 dec1 = IERC20Metadata(asset1).decimals();
        uint256 inv1AsAsset0 = Q64x64PriceMath.amountOutFromQ64(
            inventory1Raw,
            dec1,
            dec0,
            midQ64x64,
            false // asset1 -> asset0
        );

        if (mode == INV_MODE_RISKY0_ZERO) {
            return int256(inventory0Raw);
        }
        if (mode == INV_MODE_RISKY1_ZERO) {
            return int256(inv1AsAsset0);
        }
        // value-neutral
        return int256(inventory0Raw) - int256(inv1AsAsset0);
    }

    function quote(QuoteParams memory params, bytes memory data) external view override returns (uint256) {
        // Decode routed payload; consolidated bridge data is in dx (5th element)
        (, , , , bytes memory dx) = abi.decode(data, (bytes, bytes, bytes, bytes, bytes));
        if (dx.length == 0) return 0;

        // Decode consolidated StoixDataBridge payload
        (uint8 mask, uint128 v2Q, uint128 v3Q, uint128 twQ, uint128 clQ, , uint16 sdShortBps, uint16 sdLongBps)
            = abi.decode(dx, (uint8,uint128,uint128,uint128,uint128,uint64,uint16,uint16));

        // Aggregate mid price in Q64.64 (simple average of available sources)
        uint256 sumQ = 0; uint256 n = 0;
        if ((mask & 0x01) != 0 && v2Q > 0) { sumQ += v2Q; n++; }
        if ((mask & 0x02) != 0 && v3Q > 0) { sumQ += v3Q; n++; }
        if ((mask & 0x04) != 0 && twQ > 0) { sumQ += twQ; n++; }
        if ((mask & 0x08) != 0 && clQ > 0) { sumQ += clQ; n++; }
        if (n == 0) return 0;
        uint128 midQ = uint128(sumQ / n);

        // Fetch decimals once per pair
        uint8 decIn = IERC20Metadata(params.zeroForOne ? params.asset0 : params.asset1).decimals();
        uint8 decOut = IERC20Metadata(params.zeroForOne ? params.asset1 : params.asset0).decimals();

        // Decode bucket and gamma/sigma configuration
        uint16 bucketID = params.bucketID;
        uint8 kIdx = _kIndex(bucketID);
        uint32 gammaScalePpb = _gammaScalePpb(bucketID);
        uint32 gammaPpb = StoicovTables.gammaFromScale(kIdx, gammaScalePpb);

        // Select standard deviation from payload; prefer short if available
        // Note: StoixDataLib returns stdDev in format (bps × 100), so 125 bps = 12500
        uint16 sdBpsx100 = 0;
        if ((mask & 0x20) != 0 && sdShortBps > 0) {
            sdBpsx100 = sdShortBps;
        } else if ((mask & 0x40) != 0 && sdLongBps > 0) {
            sdBpsx100 = sdLongBps;
        }

        // Convert σ² to PPB for calculations
        // If sigma is fixed by bucket, set σ = 1/k (in PPB), so σ²_ppb = (invK_ppb^2) / 1e9
        // Else convert from (bps×100) feed: sdBpsx100² × 10 (matches prior tests)
        uint256 sigma2Ppb;
        if (_sigmaIsFixed(bucketID)) {
            uint32 invKPpb = _invKppb(kIdx);
            sigma2Ppb = (uint256(invKPpb) * uint256(invKPpb)) / 1_000_000_000;
        } else {
            sigma2Ppb = uint256(sdBpsx100) * uint256(sdBpsx100) * 10;
        }

        // Base spread terms in PPB units (bps × 1e5 scale)
        uint32 invKPpb = _invKppb(kIdx);
        uint32 term2Ppb = _term2ByGamma(kIdx, gammaScalePpb);
        uint32 term3Ppb;
        if (_sigmaIsFixed(bucketID)) {
            term3Ppb = _term3FixedByGamma(kIdx, gammaScalePpb);
        } else if (gammaPpb == 0 || sigma2Ppb == 0) {
            term3Ppb = 0;
        } else {
            // term3 = (γ·σ²·τ)/2, with τ=1
            // γ is in PPB (1e9), σ² is in PPB (1e9), result needs to be in bps×1e5 units like invKPpb
            // Break calculation into steps to avoid overflow:
            // Step 1: (γ_ppb × σ²_ppb) / 1e9 → gives γ·σ² in PPB (actual value × 1e9)
            // Step 2: result / 2 → divide by 2
            // Note: PPB (actual × 1e9) = bps×1e5 since bps = actual × 1e4, so bps×1e5 = actual × 1e9
            uint256 gammaSigma2 = (uint256(gammaPpb) * sigma2Ppb) / 1_000_000_000;
            term3Ppb = uint32(gammaSigma2 / 2);
        }

        // Inventory-induced skew (PPB). Map bucket inventory mode to library mode.
        uint8 invModeBits = _invMode(bucketID);
        InventorySkew.RiskyAssetMode riskyMode;
        if (invModeBits == INV_MODE_RISKY0_ZERO) riskyMode = InventorySkew.RiskyAssetMode.RISKY0;
        else if (invModeBits == INV_MODE_RISKY1_ZERO) riskyMode = InventorySkew.RiskyAssetMode.RISKY1;
        else riskyMode = InventorySkew.RiskyAssetMode.NEUTRAL; // includes NO_INVENTORY treated as neutral (zero skew delta)

        // Convert mid price Q64.64 to PPB (asset1 per asset0)
        uint256 midPricePpb = Q64x64PriceMath.mulDiv(uint256(midQ), 1_000_000_000, 1 << 64);

        // Compute CURRENT inventory skew (not trade-induced delta):
        // Convert inventory1 to asset0 units using mid price
        uint256 inv1AsAsset0Now = Q64x64PriceMath.amountOutFromQ64(
            params.asset1Balance,
            IERC20Metadata(params.asset1).decimals(),
            IERC20Metadata(params.asset0).decimals(),
            midQ,
            false // asset1 -> asset0
        );
        uint256 totalValueNow = params.asset0Balance + inv1AsAsset0Now;
        int256 skewPpb;
        if (totalValueNow == 0) {
            skewPpb = 0;
        } else {
            if (riskyMode == InventorySkew.RiskyAssetMode.RISKY1) {
                skewPpb = int256((inv1AsAsset0Now * 1_000_000_000) / totalValueNow);
            } else if (riskyMode == InventorySkew.RiskyAssetMode.RISKY0) {
                skewPpb = int256((uint256(params.asset0Balance) * 1_000_000_000) / totalValueNow);
            } else {
                // NEUTRAL mode: value-neutral deviation
                int256 ratioTwice = (int256(uint256(params.asset0Balance)) * 2 * 1_000_000_000) / int256(totalValueNow);
                skewPpb = ratioTwice - 1_000_000_000; // [-1e9, +1e9]
            }
        }

        // Compute reservation price adjustment: q·γ·σ²·τ (τ=1)
        // Fixed-σ buckets: σ equals bucket target level in bps (not decimal). Match project scaling:
        //   adjustment_bps = (skew / 1e9) * (gamma / 1e9) * (sigma_bps^2)
        //   reservationAdjustmentPpb = adjustment_bps * 1e5 (since 1 bps = 1e5 PPB)
        int256 reservationAdjustmentPpb;
        if (_sigmaIsFixed(bucketID)) {
            uint32 invKPpbLocal = _invKppb(kIdx); // equals bucket δ_min in PPB
            // sigma_bps = invKPpb / 1e5; so sigma_bps^2 = (invKPpb^2) / 1e10
            uint256 sigmaBpsSquared = (uint256(invKPpbLocal) * uint256(invKPpbLocal)) / 10_000_000_000; // 1e10
            // adjustment_bps = skewPpb * gammaPpb * sigmaBpsSquared / 1e9 / 1e9
            uint256 adjustmentBps = (uint256(skewPpb >= 0 ? skewPpb : -skewPpb) * uint256(gammaPpb) * sigmaBpsSquared) / 1_000_000_000 / 1_000_000_000;
            // Preserve sign of skew
            int256 signedAdjustBps = skewPpb >= 0 ? int256(adjustmentBps) : -int256(adjustmentBps);
            reservationAdjustmentPpb = signedAdjustBps * 100_000; // bps -> PPB
        } else {
            // Legacy path using σ² in PPB: (γ_ppb × σ²_ppb) / 1e9 gives PPB; multiply by skew (PPB) / 1e9 → PPB
            uint256 gammaSigma2Ppb = (uint256(gammaPpb) * sigma2Ppb) / 1_000_000_000; // PPB
            reservationAdjustmentPpb = (skewPpb * int256(gammaSigma2Ppb)) / 1_000_000_000;
        }

        // Compute reservation price: r = mid - q·γ·σ²·τ
        // Apply adjustment to mid price (both in Q64.64)
        int256 adjustmentQ = (int256(uint256(midQ)) * reservationAdjustmentPpb) / 1_000_000_000;
        uint128 reservationQ = uint128(uint256(int256(uint256(midQ)) - adjustmentQ));

        // Compute optimal half-spread δ* = 1/k - γ/(2k²) + (γ·σ²·τ)/2
        // All terms in bps×1e5 units
        int256 deltaStarPpb = int256(uint256(invKPpb)) - int256(uint256(term2Ppb)) + int256(uint256(term3Ppb));
        if (deltaStarPpb < 0) deltaStarPpb = 0;
        uint32 halfSpreadPpb = uint32(uint256(deltaStarPpb));

        // Compute bid/ask prices in Q64.64 by applying spread around reservation price
        // bid = r - δ*, ask = r + δ*
        uint128 bidQ = uint128(Q64x64PriceMath.mulDiv(uint256(reservationQ), (1_000_000_000 - uint256(halfSpreadPpb)), 1_000_000_000));
        uint128 askQ = uint128(Q64x64PriceMath.mulDiv(uint256(reservationQ), (1_000_000_000 + uint256(halfSpreadPpb)), 1_000_000_000));

        // Convert input to output using bid for sells (zeroForOne) and ask for buys (oneForZero)
        if (params.zeroForOne) {
            return Q64x64PriceMath.amountOutFromQ64(params.amount, decIn, decOut, bidQ, true);
        } else {
            return Q64x64PriceMath.amountOutFromQ64(params.amount, decIn, decOut, askQ, false);
        }
    }

    function quoteBatch(QuoteParamsBatch memory params, bytes memory data) external view override returns (uint256[] memory quotes) {
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
                zeroForOne: params.zeroForOne,
                functionFlags: params.functionFlags
            });
            quotes[i] = this.quote(single, data);
        }
    }
}


