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
}


