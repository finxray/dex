// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title SimpleGovernanceLib
/// @notice Ultra-efficient governance with flag check + single SLOAD design
/// @dev Following user's optimized architecture for minimal overhead
library SimpleGovernanceLib {
    
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/
    
    // Protocol pool flag in markings (use a HIGH BIT to avoid collisions with data flags)
    // Layout note: low 4 bits are used for data0..data3 in MarkingHelper.
    // We choose bit 16 (0x010000) for protocol features to avoid triggering data fetch logic.
    bytes3 constant PROTOCOL_POOL_FLAG = 0x010000;
    
    // Emergency states (packed in single storage slot)
    uint8 constant NORMAL = 0;
    uint8 constant PAUSED = 1;
    uint8 constant TIMELOCKED = 2;
    
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct SimpleGovernanceData {
        // Single mapping for pool states (poolId => state)
        mapping(uint256 => uint8) poolStates;    // 0=normal, 1=paused, 2=timelocked
        // Packed global state + paused pool count to keep runtime to ONE SLOAD in normal path
        // Layout: [0..7]=globalEmergencyState, [8..31]=pausedPoolsCount (24 bits)
        uint256 globalPackedState;
        // Governance addresses
        address protocolMultisig;                // Can create protocol pools
        address emergencyMultisig;               // Can pause/timelock
    }
    
    /*//////////////////////////////////////////////////////////////
                            VALIDATION (Minimal)
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Check if swap is allowed (ultra-efficient)
    /// @param self Governance data
    /// @param markings Pool markings
    /// @param poolId Pool identifier (already generated)
    /// @return allowed Whether swap is allowed
    function validateSwap(
        SimpleGovernanceData storage self,
        bytes3 markings,
        uint256 poolId
    ) internal view returns (bool allowed) {
        
        // ULTRA-FAST PATH: Check flag first (cheapest operation)
        if ((markings & PROTOCOL_POOL_FLAG) == 0) {
            return true; // Not a protocol pool - no checks needed
        }
        
        // SINGLE SLOAD: Read packed global state
        uint256 packed = self.globalPackedState;
        uint8 globalState = uint8(packed);
        if (globalState != NORMAL) {
            return false; // Globally restricted
        }
        // If no pools are paused/timelocked individually, skip mapping read entirely
        uint32 pausedCount = uint32((packed >> 8) & 0xFFFFFF);
        if (pausedCount == 0) {
            return true;
        }
        // Rare path: some pools are paused; check only this pool
        uint8 poolState = self.poolStates[poolId];
        return poolState == NORMAL;
    }
    
    /*//////////////////////////////////////////////////////////////
                            POOL MANAGEMENT
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register protocol pool (called during creation)
    /// @param self Governance data
    /// @param poolId Pool identifier
    function registerProtocolPool(
        SimpleGovernanceData storage self,
        uint256 poolId
    ) internal {
        self.poolStates[poolId] = NORMAL; // Initialize as normal
    }
    
    /*//////////////////////////////////////////////////////////////
                            EMERGENCY CONTROLS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Emergency pause all protocol pools
    /// @param self Governance data
    /// @param newState Emergency state (PAUSED or TIMELOCKED)
    function setGlobalEmergencyState(
        SimpleGovernanceData storage self,
        uint8 newState
    ) internal {
        uint256 packed = self.globalPackedState;
        // Clear low 8 bits and set
        packed = (packed & ~uint256(0xFF)) | uint256(newState);
        self.globalPackedState = packed;
    }
    
    /// @notice Pause specific protocol pool
    /// @param self Governance data
    /// @param poolId Pool to pause
    /// @param newState Emergency state
    function pauseSpecificPool(
        SimpleGovernanceData storage self,
        uint256 poolId,
        uint8 newState
    ) internal {
        uint8 prev = self.poolStates[poolId];
        if (prev == newState) {
            return;
        }
        // Update paused pool count if transitioning between NORMAL and non-NORMAL
        uint256 packed = self.globalPackedState;
        uint32 count = uint32((packed >> 8) & 0xFFFFFF);
        bool prevPaused = (prev != NORMAL);
        bool newPaused = (newState != NORMAL);
        if (prevPaused && !newPaused) {
            // Unpausing
            if (count > 0) { count -= 1; }
        } else if (!prevPaused && newPaused) {
            // Pausing
            count += 1;
        }
        // Write back pool state and packed count
        self.poolStates[poolId] = newState;
        // Clear count bits and set
        packed = (packed & ~(uint256(0xFFFFFF) << 8)) | (uint256(count) << 8);
        self.globalPackedState = packed;
    }
    
    /*//////////////////////////////////////////////////////////////
                            ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Check if caller can create protocol pools
    /// @param self Governance data
    /// @param creator Pool creator address
    /// @return authorized Whether creator is authorized
    function canCreateProtocolPool(
        SimpleGovernanceData storage self,
        address creator
    ) internal view returns (bool authorized) {
        return creator == self.protocolMultisig;
    }
    
    /// @notice Check if markings indicate protocol pool
    /// @param markings Pool markings
    /// @return isProtocol Whether this is a protocol pool
    function isProtocolPool(bytes3 markings) internal pure returns (bool isProtocol) {
        return (markings & PROTOCOL_POOL_FLAG) != 0;
    }
}
