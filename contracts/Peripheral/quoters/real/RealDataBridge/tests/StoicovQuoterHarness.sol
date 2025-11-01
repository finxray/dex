// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../StoicovQuoter.sol";

/// @title StoicovQuoterHarness
/// @notice Exposes internal helpers from StoicovQuoter for testing/verification.
contract StoicovQuoterHarness is StoicovQuoter {
    function invKppbFromIdx(uint8 idx) external pure returns (uint32) { return _invKppb(idx); }
    function term2ByGammaFromIdx(uint8 idx, uint32 gammaPpb) external pure returns (uint32) { return _term2ByGamma(idx, gammaPpb); }
    function deltaStarPrecomp(uint16 bucketID, uint32 sigma2TauPpb) external pure returns (uint64) { return _deltaStarApproxPrecompPpb(bucketID, sigma2TauPpb); }
    function gammaScalePpbOf(uint16 bucketID) external pure returns (uint32) { return _gammaScalePpb(bucketID); }
    function sigmaIsFixed(uint16 bucketID) external pure returns (bool) { return _sigmaIsFixed(bucketID); }

    function gammaLowScalePpb() external pure returns (uint32) { return GAMMA_LOW_SCALE_PPB; }
    function gammaMidScalePpb() external pure returns (uint32) { return GAMMA_MID_SCALE_PPB; }
    function gammaHighScalePpb() external pure returns (uint32) { return GAMMA_HIGH_SCALE_PPB; }

    // Backwards-compat helpers for tests expecting direct gamma values
    function gammaMidPpb() external pure returns (uint32) { return GAMMA_MID_SCALE_PPB; }
    function gammaHighPpb() external pure returns (uint32) { return GAMMA_HIGH_SCALE_PPB; }

    // Helper to get actual gamma value from scale and k index
    function gammaFromScaleAndIdx(uint8 idx, uint32 scalePpb) external pure returns (uint32) {
        return StoicovTables.gammaFromScale(idx, scalePpb);
    }

    // Helper to compose a bucketID from parts
    function buildBucketID(
        uint8 kIdx,
        uint8 invMode,
        bool gammaSelHigh,
        bool sigmaFixed,
        bool gammaZero
    ) external pure returns (uint16) {
        uint16 id = uint16(kIdx & K_MASK);
        id |= uint16((invMode & 0x03) << INV_SHIFT);
        if (gammaSelHigh) id |= uint16(GAMMA_MASK);
        if (sigmaFixed)   id |= SIGMA_FIXED_MASK;
        if (gammaZero)    id |= GAMMA_ZERO_MASK;
        return id;
    }

    // Debug helper: return mid, reservation, bid and ask prices (Q64.64)
    function debugPrices(QuoteParams memory params, bytes memory data)
        external
        pure
        returns (uint128 midQ, uint128 reservationQ, uint128 bidQ, uint128 askQ)
    {
        (, , , , bytes memory dx) = abi.decode(data, (bytes, bytes, bytes, bytes, bytes));
        if (dx.length == 0) return (0, 0, 0, 0);

        (uint8 mask, uint128 v2Q, uint128 v3Q, uint128 twQ, uint128 clQ, , uint16 sdShortBps, uint16 sdLongBps)
            = abi.decode(dx, (uint8,uint128,uint128,uint128,uint128,uint64,uint16,uint16));

        uint256 sumQ = 0; uint256 n = 0;
        if ((mask & 0x01) != 0 && v2Q > 0) { sumQ += v2Q; n++; }
        if ((mask & 0x02) != 0 && v3Q > 0) { sumQ += v3Q; n++; }
        if ((mask & 0x04) != 0 && twQ > 0) { sumQ += twQ; n++; }
        if ((mask & 0x08) != 0 && clQ > 0) { sumQ += clQ; n++; }
        if (n == 0) return (0, 0, 0, 0);
        midQ = uint128(sumQ / n);

        uint16 bucketID = params.bucketID;
        uint8 kIdx = _kIndex(bucketID);
        uint32 gammaScalePpb = _gammaScalePpb(bucketID);

        // Select std dev
        uint16 sdBpsx100 = 0;
        if ((mask & 0x20) != 0 && sdShortBps > 0) sdBpsx100 = sdShortBps; else if ((mask & 0x40) != 0 && sdLongBps > 0) sdBpsx100 = sdLongBps;
        uint256 sigma2Ppb = uint256(sdBpsx100) * uint256(sdBpsx100) * 10;

        // Inventory skew mode
        uint8 invModeBits = _invMode(bucketID);
        InventorySkew.RiskyAssetMode riskyMode;
        if (invModeBits == INV_MODE_RISKY0_ZERO) riskyMode = InventorySkew.RiskyAssetMode.RISKY0;
        else if (invModeBits == INV_MODE_RISKY1_ZERO) riskyMode = InventorySkew.RiskyAssetMode.RISKY1;
        else riskyMode = InventorySkew.RiskyAssetMode.NEUTRAL;

        // Mid price PPB
        uint256 midPricePpb = Q64x64PriceMath.mulDiv(uint256(midQ), 1_000_000_000, 1 << 64);

        int256 skewPpb = InventorySkew.calculateSkew(
            params.asset0Balance,
            params.asset1Balance,
            params.amount,
            params.zeroForOne,
            riskyMode,
            midPricePpb
        );

        uint32 gammaPpb = StoicovTables.gammaFromScale(kIdx, gammaScalePpb);
        uint256 gammaSigma2Rel = (uint256(gammaPpb) * sigma2Ppb) / 1_000_000_000 / 1_000_000_000;
        int256 reservationAdjustmentPpb = (skewPpb * int256(gammaSigma2Rel));
        int256 adjustmentQ = (int256(uint256(midQ)) * reservationAdjustmentPpb) / 1_000_000_000;
        reservationQ = uint128(uint256(int256(uint256(midQ)) - adjustmentQ));

        uint32 invKPpb = _invKppb(kIdx);
        uint32 term2Ppb = _term2ByGamma(kIdx, gammaScalePpb);
        uint32 term3Ppb;
        if (_sigmaIsFixed(bucketID)) {
            term3Ppb = _term3FixedByGamma(kIdx, gammaScalePpb);
        } else if (gammaPpb == 0 || sigma2Ppb == 0) {
            term3Ppb = 0;
        } else {
            uint256 gammaSigma2 = (uint256(gammaPpb) * sigma2Ppb) / 1_000_000_000;
            term3Ppb = uint32(gammaSigma2 / 2);
        }
        int256 deltaStarPpb = int256(uint256(invKPpb)) - int256(uint256(term2Ppb)) + int256(uint256(term3Ppb));
        if (deltaStarPpb < 0) deltaStarPpb = 0;
        uint32 halfSpreadPpb = uint32(uint256(deltaStarPpb));

        bidQ = uint128(Q64x64PriceMath.mulDiv(uint256(reservationQ), (1_000_000_000 - uint256(halfSpreadPpb)), 1_000_000_000));
        askQ = uint128(Q64x64PriceMath.mulDiv(uint256(reservationQ), (1_000_000_000 + uint256(halfSpreadPpb)), 1_000_000_000));
    }
}


