// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title InventorySkew
/// @notice Calculates normalized inventory skew for Avellaneda-Stoikov market making
/// @dev Implements inventory skew calculation that produces values in range [-1, +1]
///      representing LP's deviation from desired inventory position
library InventorySkew {

    /// @notice Inventory skew modes defining which asset is considered risky
    /// @dev Determines how inventory imbalance is calculated
    enum RiskyAssetMode {
        NEUTRAL,    // Value-neutral: q = inventory0 - inventory1_in_asset0
        RISKY0,     // Asset0 is risky: q = inventory0
        RISKY1      // Asset1 is risky: q = inventory1_in_asset0
    }

    /// @notice Calculate inventory skew based on value-weighted inventory deviation from target
    /// @dev Computes skew as the change in inventory imbalance due to the trade:
    ///      
    ///      Logic:
    ///      1. Convert both inventories to common value (asset0 terms) using midPrice
    ///      2. Calculate skew before trade based on risky asset mode
    ///      3. Calculate skew after trade (simulate trade effect)
    ///      4. For RISKY0/RISKY1: skew = skew_after - skew_before
    ///      5. For NEUTRAL: skew = abs(skew_before) - abs(skew_after) (improvement metric)
    ///      
    ///      Skew formulas by mode:
    ///      - NEUTRAL: skew = (value0 / [(value0 + value1)/2]) - 1
    ///      - RISKY0: skew = value0 / (value0 + value1)
    ///      - RISKY1: skew = value1 / (value0 + value1)
    ///      
    ///      where values are in asset0 terms: value0 = inv0, value1 = inv1 * midPrice
    ///
    /// @param inventory0Raw Current inventory of asset0
    /// @param inventory1Raw Current inventory of asset1
    /// @param amount Trade amount in input asset units
    /// @param zeroForOne Trade direction (true = asset0→asset1, false = asset1→asset0)
    /// @param riskyMode Determines which asset is considered risky
    /// @param midPricePpb Mid price (asset0/asset1) in PPB - how many asset1 per asset0
    /// @return skew Trade-induced skew change in range [-1e9, +1e9] in PPB
    function calculateSkew(
        uint256 inventory0Raw,
        uint256 inventory1Raw,
        uint256 amount,
        bool zeroForOne,
        RiskyAssetMode riskyMode,
        uint256 midPricePpb
    ) internal pure returns (int256 skew) {
        // Calculate value0 and value1 in asset0 terms
        // midPrice is asset0/asset1 (how many asset1 per asset0)
        // So: value0 = inventory0, value1 = inventory1 / midPrice
        uint256 value0Before = inventory0Raw;
        uint256 value1Before = (inventory1Raw * 1e9) / midPricePpb; // Convert to asset0 terms
        
        // Simulate trade effect
        uint256 value0After;
        uint256 value1After;
        
        if (zeroForOne) {
            // Selling asset0 for asset1
            value0After = inventory0Raw > amount ? inventory0Raw - amount : 0;
            // Buying asset1: receive (amount × midPrice) of asset1, convert to asset0 terms
            uint256 receivedAsset1 = (amount * midPricePpb) / 1e9;
            uint256 receivedAsset1InAsset0 = (receivedAsset1 * 1e9) / midPricePpb;
            value1After = value1Before + receivedAsset1InAsset0;
        } else {
            // Selling asset1 for asset0
            // Convert amount (in asset1) to asset0 terms for comparison
            uint256 amountInAsset0 = (amount * 1e9) / midPricePpb;
            value1After = value1Before > amountInAsset0 ? value1Before - amountInAsset0 : 0;
            // Buying asset0: receive amount/midPrice of asset0
            uint256 receivedAsset0 = (amount * 1e9) / midPricePpb;
            value0After = inventory0Raw + receivedAsset0;
        }
        
        // Calculate skew before and after
        int256 skewBefore = _calculateSkewAtState(value0Before, value1Before, riskyMode);
        int256 skewAfter = _calculateSkewAtState(value0After, value1After, riskyMode);
        
        // For all cases: skew = skew_after - skew_before
        // For NEUTRAL: use abs values
        if (riskyMode == RiskyAssetMode.NEUTRAL) {
            int256 absSkewBefore = skewBefore >= 0 ? skewBefore : -skewBefore;
            int256 absSkewAfter = skewAfter >= 0 ? skewAfter : -skewAfter;
            skew = absSkewAfter - absSkewBefore; // Positive if imbalance increased
        } else {
            skew = skewAfter - skewBefore;
        }
        
        // Clamp to [-1e9, +1e9]
        if (skew > 1e9) return 1e9;
        if (skew < -1e9) return -1e9;
        return skew;
    }

    /// @notice Calculate skew at a given inventory state
    /// @dev Internal helper for before/after comparison
    function _calculateSkewAtState(
        uint256 value0,
        uint256 value1,
        RiskyAssetMode riskyMode
    ) private pure returns (int256 skewPpb) {
        uint256 totalValue = value0 + value1;
        if (totalValue == 0) return 0;
        
        if (riskyMode == RiskyAssetMode.NEUTRAL) {
            // NEUTRAL: skew = (value0 / [(value0 + value1)/2]) - 1
            // = (2*value0 / totalValue) - 1
            int256 ratio = (int256(value0) * 2 * 1e9) / int256(totalValue);
            return ratio - 1e9; // Subtract 1.0 in PPB
            
        } else if (riskyMode == RiskyAssetMode.RISKY0) {
            // RISKY0: skew = value0 / (value0 + value1)
            return (int256(value0) * 1e9) / int256(totalValue);
            
        } else { // RISKY1
            // RISKY1: skew = value1 / (value0 + value1)
            return (int256(value1) * 1e9) / int256(totalValue);
        }
    }

    /// @notice Calculate half-spread with inventory adjustment, ensuring non-negative result
    /// @dev Implements the full A-S spread formula with safety constraint:
    ///      Half_Spread = max(0, 1/k - gam/(2*k²) + (gam*σ²)/2 + q*gam*σ²)
    ///      
    ///      The last term (q*gam*σ²) can be negative for beneficial trades, potentially
    ///      making the spread negative. We enforce Half_Spread >= 0 to prevent invalid quotes.
    ///
    /// @param invKPpb The 1/k term in PPB (base spread)
    /// @param term2Ppb The gam/(2*k²) term in PPB  
    /// @param term3Ppb The (gam*σ²)/2 term in PPB
    /// @param skewPpb The inventory skew in range [-1e9, +1e9]
    /// @param gammaStDev2Ppb The gam*σ² product in PPB (for inventory adjustment)
    /// @return halfSpreadPpb The final half-spread in PPB, guaranteed >= 0
    function calculateHalfSpreadWithInventory(
        uint32 invKPpb,
        uint32 term2Ppb,
        uint32 term3Ppb,
        int256 skewPpb,
        uint32 gammaStDev2Ppb
    ) internal pure returns (uint32 halfSpreadPpb) {
        // Calculate inventory adjustment: q * gam * σ²
        // skewPpb is in [-1e9, +1e9] (actual value × 1e9)
        // gammaStDev2Ppb is in PPB (actual value × 1e9)
        // We want result in same units as invKPpb (bps × 1e5)
        // (skewPpb / 1e9) * (gammaStDev2Ppb / 1e9) * 1e5 = (skewPpb * gammaStDev2Ppb) / (1e9 * 1e4)
        int256 inventoryAdjustmentPpb = (skewPpb * int256(uint256(gammaStDev2Ppb))) / 1e13;
        
        // Calculate base spread: 1/k - gam/(2*k²) + (gam*σ²)/2
        int256 baseSpread = int256(uint256(invKPpb)) - int256(uint256(term2Ppb)) + int256(uint256(term3Ppb));
        
        // Add inventory adjustment
        int256 finalSpread = baseSpread + inventoryAdjustmentPpb;
        
        // Enforce non-negativity
        if (finalSpread < 0) return 0;
        
        return uint32(uint256(finalSpread));
    }

}

