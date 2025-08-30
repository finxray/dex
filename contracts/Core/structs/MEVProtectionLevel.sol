// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title MEVProtectionLevel
 * @notice Defines MEV protection levels that pools can choose
 * @dev Part of the flexible, non-opinionated architecture
 */
library MEVProtectionLevel {
    
    // Protection levels (can be combined with bitwise OR)
    uint8 constant NONE = 0x00;              // No protection, cheapest gas
    uint8 constant COMMIT_REVEAL = 0x01;     // Commit-reveal for large trades
    uint8 constant GRADUAL_FILL = 0x02;      // Dutch auction style fills
    uint8 constant PRIVATE_POOL = 0x04;      // Whitelist-only trading
    uint8 constant DYNAMIC_FEE = 0x08;       // Anti-sandwich fee escalation
    uint8 constant TIME_LOCK = 0x10;         // Minimum time between trades
    uint8 constant THRESHOLD_ONLY = 0x20;    // Protection only above threshold
    
    // Common presets for convenience
    uint8 constant LOW_PROTECTION = DYNAMIC_FEE;                    // Just dynamic fees
    uint8 constant MEDIUM_PROTECTION = DYNAMIC_FEE | TIME_LOCK;    // Fees + cooldown
    uint8 constant HIGH_PROTECTION = COMMIT_REVEAL | DYNAMIC_FEE;  // Commit + fees
    uint8 constant MAX_PROTECTION = 0x3F;                          // All features
    
    /**
     * @notice Check if a specific protection is enabled
     * @param level The protection level byte
     * @param protection The specific protection to check
     */
    function isEnabled(uint8 level, uint8 protection) internal pure returns (bool) {
        return (level & protection) != 0;
    }
    
    /**
     * @notice Get human-readable description of protection level
     * @dev Useful for UI/monitoring
     */
    function describe(uint8 level) internal pure returns (string memory) {
        if (level == NONE) return "No MEV Protection";
        if (level == LOW_PROTECTION) return "Low: Dynamic Fees";
        if (level == MEDIUM_PROTECTION) return "Medium: Fees + Timelock";
        if (level == HIGH_PROTECTION) return "High: Commit-Reveal + Fees";
        if (level == MAX_PROTECTION) return "Maximum: All Protections";
        return "Custom Configuration";
    }
    
    /**
     * @notice Calculate gas overhead for protection level
     * @dev Helps LPs understand cost implications
     * @return gasOverhead Estimated additional gas cost
     */
    function estimateGasOverhead(uint8 level) internal pure returns (uint256 gasOverhead) {
        if (isEnabled(level, COMMIT_REVEAL)) gasOverhead += 50000;  // Two-phase trades
        if (isEnabled(level, GRADUAL_FILL)) gasOverhead += 30000;   // Price calculations
        if (isEnabled(level, PRIVATE_POOL)) gasOverhead += 10000;   // Whitelist check
        if (isEnabled(level, DYNAMIC_FEE)) gasOverhead += 20000;    // Fee calculation
        if (isEnabled(level, TIME_LOCK)) gasOverhead += 5000;       // Timestamp check
        return gasOverhead;
    }
}
