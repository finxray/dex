// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title AtomicExecutionLib
/// @notice Library for session-only swaps and batch settlement windows
/// @dev Group D: Atomic Execution MEV protections
library AtomicExecutionLib {
    
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/
    
    // Flag 1: Enable AtomicExecution (1 bit)
    uint32 constant ATOMIC_EXECUTION_ENABLED = 0x00000100; // Bit 8
    
    // Flag 2: Batch Window Configuration (3 bits = 8 options)
    uint32 constant BATCH_WINDOW_MASK = 0x00000E00;        // Bits 9-11
    uint32 constant BATCH_WINDOW_SHIFT = 9;
    
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct BatchWindowConfig {
        uint8 cycleLength;      // blocks in cycle (2, 5, 10, 20, etc.)
        uint8 settlementBlocks; // blocks allowed for settlement
        bool enabled;           // whether this config is active
    }
    
    struct AtomicExecutionData {
        // Predefined batch window configurations (8 options)
        BatchWindowConfig[8] batchConfigs;
        bool globalEmergencyMode;  // Override all to batch mode
    }
    
    /*//////////////////////////////////////////////////////////////
                            MAIN VALIDATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Check if swap is allowed based on atomic execution requirements
    /// @param traderProtection 4-byte trader protection flags
    /// @param sessionActive Whether flash session is currently active
    /// @param data Atomic execution configuration data
    /// @return allowed Whether the swap is allowed
    function validateAtomicExecution(
        uint32 traderProtection,
        bool sessionActive,
        AtomicExecutionData storage data
    ) internal view returns (bool allowed) {
        
        // Check if atomic execution is enabled
        if ((traderProtection & ATOMIC_EXECUTION_ENABLED) == 0) {
            return true; // Not enabled, allow normal execution
        }
        
        // Global emergency mode forces batch mode for all
        if (data.globalEmergencyMode) {
            return sessionActive && _isBatchWindowActive(data.batchConfigs[4]); // Use config 4 for emergency
        }
        
        // Extract batch window configuration (3 bits = 8 options)
        uint8 batchMode = uint8((traderProtection & BATCH_WINDOW_MASK) >> BATCH_WINDOW_SHIFT);
        
        // Mode 0: Session-only (no batch window requirement)
        if (batchMode == 0) {
            return sessionActive; // Must be in session
        }
        
        // Modes 1-7: Check batch window
        BatchWindowConfig storage config = data.batchConfigs[batchMode];
        if (!config.enabled) {
            return sessionActive; // Fallback to session-only
        }
        
        bool batchWindowActive = _isBatchWindowActive(config);
        
        // Must be in session AND in batch window
        return sessionActive && batchWindowActive;
    }
    
    /// @notice Check if current block is within a batch settlement window
    /// @param config Batch window configuration
    /// @return active Whether batch window is currently active
    function _isBatchWindowActive(
        BatchWindowConfig storage config
    ) private view returns (bool active) {
        if (config.cycleLength == 0) return true; // Always active if not configured
        
        uint256 cyclePosition = block.number % config.cycleLength;
        return cyclePosition < config.settlementBlocks;
    }
    
    /*//////////////////////////////////////////////////////////////
                            CONFIGURATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Initialize default batch window configurations
    /// @param data Atomic execution data to initialize
    function initializeDefaultConfigs(AtomicExecutionData storage data) internal {
        // Config 0: Reserved for session-only (no batch window)
        
        // Config 1: Every 2 blocks, settle in 1 block
        data.batchConfigs[1] = BatchWindowConfig(2, 1, true);
        
        // Config 2: Every 5 blocks, settle in 2 blocks  
        data.batchConfigs[2] = BatchWindowConfig(5, 2, true);
        
        // Config 3: Every 10 blocks, settle in 3 blocks
        data.batchConfigs[3] = BatchWindowConfig(10, 3, true);
        
        // Config 4: Every 20 blocks, settle in 5 blocks
        data.batchConfigs[4] = BatchWindowConfig(20, 5, true);
        
        // Configs 5-6: Reserved for future custom needs
        data.batchConfigs[5] = BatchWindowConfig(0, 0, false);
        data.batchConfigs[6] = BatchWindowConfig(0, 0, false);
        
        // Config 7: Emergency mode (admin controlled)
        data.batchConfigs[7] = BatchWindowConfig(50, 10, false); // Disabled by default
    }
    
    /// @notice Configure a specific batch window
    /// @param data Atomic execution data
    /// @param configIndex Configuration index (0-7)
    /// @param cycleLength Blocks in cycle
    /// @param settlementBlocks Blocks allowed for settlement
    /// @param enabled Whether this configuration is active
    function configureBatchWindow(
        AtomicExecutionData storage data,
        uint8 configIndex,
        uint8 cycleLength,
        uint8 settlementBlocks,
        bool enabled
    ) internal {
        require(configIndex < 8, "Invalid config index");
        require(settlementBlocks <= cycleLength || cycleLength == 0, "Invalid window");
        
        data.batchConfigs[configIndex] = BatchWindowConfig({
            cycleLength: cycleLength,
            settlementBlocks: settlementBlocks,
            enabled: enabled
        });
    }
    
    /// @notice Set global emergency mode
    /// @param data Atomic execution data
    /// @param emergency Whether to enable emergency mode
    function setEmergencyMode(
        AtomicExecutionData storage data,
        bool emergency
    ) internal {
        data.globalEmergencyMode = emergency;
    }
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get batch window configuration
    /// @param data Atomic execution data
    /// @param configIndex Configuration index
    /// @return config Batch window configuration
    function getBatchConfig(
        AtomicExecutionData storage data,
        uint8 configIndex
    ) internal view returns (BatchWindowConfig memory config) {
        require(configIndex < 8, "Invalid config index");
        return data.batchConfigs[configIndex];
    }
    
    /// @notice Check if a specific batch window is currently active
    /// @param data Atomic execution data
    /// @param configIndex Configuration index
    /// @return active Whether the batch window is active
    function isBatchWindowActive(
        AtomicExecutionData storage data,
        uint8 configIndex
    ) internal view returns (bool active) {
        require(configIndex < 8, "Invalid config index");
        return _isBatchWindowActive(data.batchConfigs[configIndex]);
    }
    
    /// @notice Decode trader protection flags for atomic execution
    /// @param traderProtection 4-byte trader protection flags
    /// @return enabled Whether atomic execution is enabled
    /// @return batchMode Batch window configuration mode (0-7)
    function decodeAtomicFlags(
        uint32 traderProtection
    ) internal pure returns (bool enabled, uint8 batchMode) {
        enabled = (traderProtection & ATOMIC_EXECUTION_ENABLED) != 0;
        batchMode = uint8((traderProtection & BATCH_WINDOW_MASK) >> BATCH_WINDOW_SHIFT);
    }
}
