// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MEVProtection} from "../security/MEVProtection.sol";
import {MEVProtectionLevel} from "../structs/MEVProtectionLevel.sol";
import {ExtendedMarkings} from "../structs/ExtendedMarkings.sol";

/**
 * @title MEVIntegration
 * @notice Helper library to integrate MEV protection with PoolManager
 * @dev Simplifies MEV checks and enforcement in swap/liquidity operations
 */
library MEVIntegration {
    using MEVProtectionLevel for uint8;
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct MEVContext {
        bool requiresProtection;
        uint8 protectionType;
        uint256 adjustedFee;
        bool canProceed;
        string rejectReason;
    }
    
    /*//////////////////////////////////////////////////////////////
                            CHECK FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Comprehensive MEV check before swap
     * @dev Single entry point for all MEV validations
     */
    function checkSwapMEV(
        MEVProtection mevProtection,
        uint256 poolId,
        address trader,
        uint256 amountIn,
        bytes4 markings
    ) internal returns (MEVContext memory context) {
        // Extract MEV configuration from markings
        ExtendedMarkings.ExtendedPoolConfig memory config = ExtendedMarkings.decode(markings);
        
        if (config.mevProtection == MEVProtectionLevel.NONE) {
            context.canProceed = true;
            context.adjustedFee = config.feeTier * 10; // Convert to basis points
            return context;
        }
        
        // Check if trade needs protection
        bool isLarge = amountIn > 10 ether; // Example threshold
        (
            context.requiresProtection,
            context.protectionType,
            context.adjustedFee
        ) = mevProtection.checkTradeProtection(poolId, trader, amountIn, isLarge);
        
        if (!context.requiresProtection) {
            context.canProceed = true;
            return context;
        }
        
        // Check specific protections
        context.canProceed = true; // Assume success unless check fails
        
        // Time lock check
        if (config.mevProtection.isEnabled(MEVProtectionLevel.TIME_LOCK)) {
            (bool allowed, uint256 timeRemaining) = mevProtection.canTrade(poolId, trader);
            if (!allowed) {
                context.canProceed = false;
                context.rejectReason = string(abi.encodePacked(
                    "Time lock active: ",
                    uint2str(timeRemaining),
                    " seconds remaining"
                ));
                return context;
            }
        }
        
        // Private pool check
        if (config.mevProtection.isEnabled(MEVProtectionLevel.PRIVATE_POOL)) {
            if (!mevProtection.isWhitelisted(poolId, trader)) {
                context.canProceed = false;
                context.rejectReason = "Not whitelisted for private pool";
                return context;
            }
        }
        
        // Sandwich detection
        bool suspected = mevProtection.detectSandwichPattern(poolId, trader, amountIn, true);
        if (suspected && config.mevProtection.isEnabled(MEVProtectionLevel.DYNAMIC_FEE)) {
            // Don't reject, but increase fee significantly
            context.adjustedFee = context.adjustedFee * 2;
        }
        
        return context;
    }
    
    /**
     * @notice Check if commit-reveal is required
     * @dev For two-phase trading
     */
    function requiresCommitReveal(
        bytes4 markings,
        uint256 amountIn,
        uint256 threshold
    ) internal pure returns (bool) {
        ExtendedMarkings.ExtendedPoolConfig memory config = ExtendedMarkings.decode(markings);
        
        if (!config.mevProtection.isEnabled(MEVProtectionLevel.COMMIT_REVEAL)) {
            return false;
        }
        
        // Only require commit-reveal for large trades
        return amountIn >= threshold;
    }
    
    /**
     * @notice Calculate effective swap parameters after MEV adjustments
     * @dev Applies fees and protections to swap amounts
     */
    function applyMEVAdjustments(
        uint256 amountIn,
        uint256 expectedOut,
        uint256 mevFee,
        bool zeroForOne
    ) internal pure returns (
        uint256 adjustedAmountIn,
        uint256 adjustedAmountOut,
        uint256 feeAmount
    ) {
        // Calculate fee
        feeAmount = (amountIn * mevFee) / 10000;
        
        // Adjust amounts based on direction
        if (zeroForOne) {
            adjustedAmountIn = amountIn - feeAmount;
            adjustedAmountOut = (expectedOut * adjustedAmountIn) / amountIn;
        } else {
            adjustedAmountIn = amountIn - feeAmount;
            adjustedAmountOut = (expectedOut * adjustedAmountIn) / amountIn;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                        GRADUAL FILL HELPERS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Check if trade should use gradual fill
     * @dev Based on size and pool configuration
     */
    function shouldUseGradualFill(
        bytes4 markings,
        uint256 amountIn,
        uint256 poolLiquidity
    ) internal pure returns (bool) {
        ExtendedMarkings.ExtendedPoolConfig memory config = ExtendedMarkings.decode(markings);
        
        if (!config.mevProtection.isEnabled(MEVProtectionLevel.GRADUAL_FILL)) {
            return false;
        }
        
        // Use gradual fill for trades > 1% of pool liquidity
        return amountIn > poolLiquidity / 100;
    }
    
    /**
     * @notice Calculate gradual fill parameters
     * @dev Determines start/end prices for Dutch auction
     */
    function calculateGradualFillParams(
        uint256 currentPrice,
        bool isBuy,
        uint256 priceImpact
    ) internal pure returns (
        uint256 startPrice,
        uint256 endPrice
    ) {
        // Start with unfavorable price (5% worse)
        // End with favorable price (at fair value)
        
        if (isBuy) {
            // Buying - start high, end at fair
            startPrice = currentPrice + (currentPrice * 5) / 100;
            endPrice = currentPrice;
        } else {
            // Selling - start low, end at fair
            startPrice = currentPrice - (currentPrice * 5) / 100;
            endPrice = currentPrice;
        }
        
        // Adjust based on expected price impact
        if (priceImpact > 100) { // > 1% impact
            // Wider range for large trades
            uint256 adjustment = (currentPrice * priceImpact) / 10000;
            if (isBuy) {
                startPrice += adjustment;
            } else {
                startPrice -= adjustment;
            }
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            FEE CALCULATIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Calculate tiered fees based on trade size and MEV risk
     * @dev Progressive fee structure
     */
    function calculateTieredFee(
        uint256 amountIn,
        uint256 poolLiquidity,
        uint256 baseFee,
        uint256 mevMultiplier
    ) internal pure returns (uint256 effectiveFee) {
        uint256 sizeRatio = (amountIn * 10000) / poolLiquidity;
        
        if (sizeRatio < 10) {
            // < 0.1% of pool - base fee
            effectiveFee = baseFee;
        } else if (sizeRatio < 100) {
            // 0.1% - 1% of pool - 1.5x fee
            effectiveFee = (baseFee * 15) / 10;
        } else if (sizeRatio < 500) {
            // 1% - 5% of pool - 2x fee
            effectiveFee = baseFee * 2;
        } else {
            // > 5% of pool - 3x fee
            effectiveFee = baseFee * 3;
        }
        
        // Apply MEV multiplier for suspected attacks
        effectiveFee = (effectiveFee * mevMultiplier) / 100;
        
        // Cap at 2% total fee
        if (effectiveFee > 200) {
            effectiveFee = 200;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            UTILITY FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Convert uint to string (for error messages)
     */
    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
    
    /**
     * @notice Get recommended MEV level based on asset pair
     * @dev Heuristic for suggesting protection level
     */
    function recommendMEVLevel(
        address asset0,
        address asset1,
        uint256 expectedVolume
    ) internal pure returns (uint8) {
        // High-value pairs need more protection
        // This is simplified - production would check actual asset values
        
        if (expectedVolume > 1000000 ether) {
            // High volume pool - maximum protection
            return MEVProtectionLevel.MAX_PROTECTION;
        } else if (expectedVolume > 100000 ether) {
            // Medium volume - high protection
            return MEVProtectionLevel.HIGH_PROTECTION;
        } else if (expectedVolume > 10000 ether) {
            // Low-medium volume - medium protection
            return MEVProtectionLevel.MEDIUM_PROTECTION;
        } else {
            // Low volume - minimal protection
            return MEVProtectionLevel.LOW_PROTECTION;
        }
    }
}
