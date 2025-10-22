// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Stoicov precomputed tables for k-level dependent terms
/// @notice Provides hardcoded values for 1/k (in PPB), γ/(2·k²) by γ tier, and k levels.
/// @dev Units: parts-per-billion (PPB) relative to price unless noted.
library StoicovTables {
    // γ scale factors (risk aversion) - gamma = scale × k_small where k_small = 1/δ_min_bps
    uint32 internal constant GAMMA_SCALE_PPB = 1_000_000_000; // informational scale
    uint32 internal constant GAMMA_LOW_SCALE_PPB   = 0;             // 0.0 scale (inventory indifferent)
    uint32 internal constant GAMMA_MID_SCALE_PPB   = 500_000_000;   // 0.5 scale
    uint32 internal constant GAMMA_HIGH_SCALE_PPB  = 1_000_000_000; // 1.0 scale

    // k levels chosen so that 1/k = δ_min[bps]:
    // [ 0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500 ]
    // k values in PPB (parts per billion) for precision
    function kLevelPpb(uint8 idx) internal pure returns (uint32) {
        uint32[16] memory ksPpb = [
            uint32(2_000_000_000),  // k = 2.0 → 1/k = 0.5 bps
            uint32(1_000_000_000),  // k = 1.0 → 1/k = 1.0 bps
            uint32(400_000_000),    // k = 0.4 → 1/k = 2.5 bps
            uint32(200_000_000),    // k = 0.2 → 1/k = 5.0 bps
            uint32(133_333_333),    // k = 0.133 → 1/k = 7.5 bps
            uint32(100_000_000),    // k = 0.1 → 1/k = 10 bps
            uint32(66_666_667),     // k = 0.067 → 1/k = 15 bps
            uint32(50_000_000),     // k = 0.05 → 1/k = 20 bps
            uint32(33_333_333),     // k = 0.033 → 1/k = 30 bps
            uint32(20_000_000),     // k = 0.02 → 1/k = 50 bps
            uint32(13_333_333),     // k = 0.013 → 1/k = 75 bps
            uint32(10_000_000),     // k = 0.01 → 1/k = 100 bps
            uint32(6_666_667),      // k = 0.0067 → 1/k = 150 bps
            uint32(5_000_000),      // k = 0.005 → 1/k = 200 bps
            uint32(3_333_333),      // k = 0.0033 → 1/k = 300 bps
            uint32(2_000_000)       // k = 0.002 → 1/k = 500 bps
        ];
        return ksPpb[idx];
    }

    // invK_ppb[idx] = floor(1e9 / k)
    // Calculate gamma = scale × k where k is chosen so 1/k = δ_min_bps
    function gammaFromScale(uint8 idx, uint32 scalePpb) internal pure returns (uint32) {
        if (scalePpb == 0) return 0;
        // gamma = scale × k, both in PPB
        uint32 kPpb = kLevelPpb(idx);
        return uint32((uint256(scalePpb) * uint256(kPpb)) / 1_000_000_000);
    }

    function invKppb(uint8 idx) internal pure returns (uint32) {
        // 1/k values in PPB, where k is chosen so 1/k = δ_min_bps
        // Test converts PPB to bps by dividing by 1e5, so we need values × 1e5
        uint32[16] memory inv = [
            uint32(50_000),      // 1/k = 0.5 bps → 0.5 * 1e5 PPB
            uint32(100_000),     // 1/k = 1.0 bps → 1.0 * 1e5 PPB
            uint32(250_000),     // 1/k = 2.5 bps → 2.5 * 1e5 PPB
            uint32(500_000),     // 1/k = 5.0 bps → 5.0 * 1e5 PPB
            uint32(750_000),     // 1/k = 7.5 bps → 7.5 * 1e5 PPB
            uint32(1_000_000),   // 1/k = 10 bps → 10 * 1e5 PPB
            uint32(1_500_000),   // 1/k = 15 bps → 15 * 1e5 PPB
            uint32(2_000_000),   // 1/k = 20 bps → 20 * 1e5 PPB
            uint32(3_000_000),   // 1/k = 30 bps → 30 * 1e5 PPB
            uint32(5_000_000),   // 1/k = 50 bps → 50 * 1e5 PPB
            uint32(7_500_000),   // 1/k = 75 bps → 75 * 1e5 PPB
            uint32(10_000_000),  // 1/k = 100 bps → 100 * 1e5 PPB
            uint32(15_000_000),  // 1/k = 150 bps → 150 * 1e5 PPB
            uint32(20_000_000),  // 1/k = 200 bps → 200 * 1e5 PPB
            uint32(30_000_000),  // 1/k = 300 bps → 300 * 1e5 PPB
            uint32(50_000_000)   // 1/k = 500 bps → 500 * 1e5 PPB
        ];
        return inv[idx];
    }

    function term2ByGamma(uint8 idx, uint32 scalePpb) internal pure returns (uint32) {
        if (scalePpb == 0) return 0;
        // Calculate gamma = scale × k, then term2 = gamma / (2 × k²)
        uint32 gammaPpb = gammaFromScale(idx, scalePpb);
        uint32 kPpb = kLevelPpb(idx);
        
        // term2 = gamma / (2 × k²), result should be in same units as 1/k (PPB for bps)
        // gamma is in PPB, k is in PPB, so gamma/k² has units PPB/PPB² = 1/PPB
        // We want result in PPB (for bps), so multiply by 1e9
        uint256 kSquared = uint256(kPpb) * uint256(kPpb) / 1e9; // k² in PPB
        return uint32((uint256(gammaPpb) * 1e5) / (2 * kSquared)); // Convert to match invKppb units
    }
}


