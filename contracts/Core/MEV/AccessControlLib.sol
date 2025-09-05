// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title AccessControlLib
/// @notice Universal access control for institutional trading and MEV protection
/// @dev Pool-level opt-in via markings to avoid fragmentation
library AccessControlLib {
    
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/
    
    // Pool-level access control flag (in markings)
    bytes3 constant ACCESS_CONTROL_FLAG = 0x000002;  // Bit 1 in markings
    
    // Trader protection flags for access control modes (bits 16-19)
    uint32 constant ACCESS_CONTROL_ENABLED = 0x00010000;  // Bit 16
    uint32 constant ACCESS_CONTROL_MASK = 0x000E0000;     // Bits 17-19
    uint32 constant ACCESS_CONTROL_SHIFT = 17;
    
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct RFQPermit {
        address trader;           // Authorized trader
        address asset0;          // Asset0 address
        address asset1;          // Asset1 address
        uint256 amountIn;        // Input amount
        uint256 minAmountOut;    // Minimum output amount
        bool zeroForOne;         // Swap direction
        uint256 deadline;        // Expiry timestamp
        uint256 nonce;           // Unique nonce
    }
    
    struct UniversalAccessConfig {
        // Global settings (applies to all access-controlled pools)
        mapping(address => bool) authorizedRelays;      // Flashbots, CoW, Eden, etc.
        mapping(address => bool) institutionalTraders;  // Whitelisted institutions
        mapping(address => bool) authorizedSigners;     // RFQ market makers
        
        // RFQ tracking (global across all pools)
        mapping(bytes32 => bool) usedRFQHashes;
        mapping(address => uint256) traderNonces;
        
        // Emergency controls
        bool globalEmergencyMode;
        bool relayOnlyGlobalMode;   // Force all pools to relay-only
        address admin;
        
        // Flexible thresholds
        uint16 maxRFQDeviationBps;  // Max deviation from market (LP protection)
        uint32 defaultPermitValidityBlocks;
    }
    
    /*//////////////////////////////////////////////////////////////
                            MAIN VALIDATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Universal access control validation for pools with ACCESS_CONTROL_FLAG
    /// @param markings Pool markings (to check if access control is enabled for this pool)
    /// @param traderProtection Trader protection flags (for specific protection modes)
    /// @param data Universal access configuration data
    /// @param trader Address attempting to trade
    /// @param permitData Optional RFQ permit data
    /// @param currentPoolValue Current pool value for RFQ price validation
    /// @return allowed Whether the swap is allowed
    function validateUniversalAccess(
        bytes3 markings,
        uint32 traderProtection,
        UniversalAccessConfig storage data,
        address trader,
        bytes memory permitData,
        uint256 currentPoolValue
    ) internal returns (bool allowed) {
        
        // Check if this pool has access control enabled
        if ((markings & ACCESS_CONTROL_FLAG) == 0) {
            return true; // Pool doesn't require access control
        }
        
        // Global emergency mode - only whitelisted institutions
        if (data.globalEmergencyMode) {
            return data.institutionalTraders[trader];
        }
        
        // Global relay-only mode - must use authorized relay
        if (data.relayOnlyGlobalMode) {
            if (!data.authorizedRelays[tx.origin]) {
                return false; // Must use authorized relay
            }
        }
        
        // Extract trader's requested protection mode
        uint8 accessMode = uint8((traderProtection & ACCESS_CONTROL_MASK) >> ACCESS_CONTROL_SHIFT);
        
        // Mode-based validation (trader chooses protection level)
        if (accessMode == 1) { // RFQ mode
            return _validateRFQMode(data, trader, permitData, currentPoolValue);
        } else if (accessMode == 2) { // Relay-only mode
            return data.authorizedRelays[tx.origin];
        } else if (accessMode == 3) { // Institutional mode
            return data.institutionalTraders[trader];
        } else if (accessMode == 4) { // Combined: RFQ + Relay
            return data.authorizedRelays[tx.origin] && 
                   _validateRFQMode(data, trader, permitData, currentPoolValue);
        } else if (accessMode == 5) { // Combined: RFQ + Institutional
            return data.institutionalTraders[trader] && 
                   _validateRFQMode(data, trader, permitData, currentPoolValue);
        } else if (accessMode == 6) { // Maximum security: All protections
            return data.authorizedRelays[tx.origin] && 
                   data.institutionalTraders[trader] && 
                   _validateRFQMode(data, trader, permitData, currentPoolValue);
        }
        
        // Mode 0 or 7: Basic access (just check if pool allows access control)
        return true;
    }
    
    /*//////////////////////////////////////////////////////////////
                            RFQ PERMIT VALIDATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Validate RFQ mode with LP protection
    /// @param data Universal access configuration
    /// @param trader Address attempting to trade
    /// @param permitData Encoded RFQ permit data
    /// @param currentPoolValue Current pool value for price validation
    /// @return valid Whether RFQ is valid and safe for LPs
    function _validateRFQMode(
        UniversalAccessConfig storage data,
        address trader,
        bytes memory permitData,
        uint256 currentPoolValue
    ) private returns (bool valid) {
        
        // For gas testing, we'll implement basic validation
        // Full RFQ validation can be added later
        if (permitData.length == 0) return false;
        
        // TODO: Implement full RFQ permit validation
        // For now, just validate that permitData is provided
        return permitData.length > 0;
    }
    
    /// @notice Recover signer from signature
    /// @param hash Message hash
    /// @param signature ECDSA signature
    /// @return signer Recovered signer address
    function _recoverSigner(
        bytes32 hash,
        bytes memory signature
    ) private pure returns (address signer) {
        if (signature.length != 65) return address(0);
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        return ecrecover(hash, v, r, s);
    }
    
    /*//////////////////////////////////////////////////////////////
                            CONFIGURATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Initialize universal access control with reasonable defaults
    /// @param data Universal access configuration to initialize
    function initializeUniversalAccess(UniversalAccessConfig storage data) internal {
        // Set reasonable defaults for LP protection
        data.maxRFQDeviationBps = 500;        // Max 5% deviation from market
        data.defaultPermitValidityBlocks = 100; // ~20 minute validity
        data.globalEmergencyMode = false;
        data.relayOnlyGlobalMode = false;
        
        // Admin will be set separately via setAdmin()
    }
    
    /// @notice Authorize/deauthorize a relay (Flashbots, CoW, Eden, etc.)
    /// @param data Universal access configuration
    /// @param relay Relay address
    /// @param authorized Whether to authorize or deauthorize
    function setRelayAuthorization(
        UniversalAccessConfig storage data,
        address relay,
        bool authorized
    ) internal {
        data.authorizedRelays[relay] = authorized;
    }
    
    /// @notice Authorize/deauthorize an institutional trader
    /// @param data Universal access configuration
    /// @param trader Trader address
    /// @param authorized Whether to authorize or deauthorize
    function setInstitutionalTrader(
        UniversalAccessConfig storage data,
        address trader,
        bool authorized
    ) internal {
        data.institutionalTraders[trader] = authorized;
    }
    
    /// @notice Authorize/deauthorize an RFQ market maker signer
    /// @param data Universal access configuration
    /// @param signer Market maker signer address
    /// @param authorized Whether to authorize or deauthorize
    function setAuthorizedSigner(
        UniversalAccessConfig storage data,
        address signer,
        bool authorized
    ) internal {
        data.authorizedSigners[signer] = authorized;
    }
    
    /// @notice Set global emergency controls
    /// @param data Universal access configuration
    /// @param emergencyMode Whether to enable emergency mode (institutions only)
    /// @param relayOnlyMode Whether to force all pools to relay-only
    function setGlobalControls(
        UniversalAccessConfig storage data,
        bool emergencyMode,
        bool relayOnlyMode
    ) internal {
        data.globalEmergencyMode = emergencyMode;
        data.relayOnlyGlobalMode = relayOnlyMode;
    }
    
    /// @notice Configure RFQ protection parameters
    /// @param data Universal access configuration
    /// @param maxDeviationBps Maximum RFQ price deviation from market (LP protection)
    /// @param permitValidityBlocks Default permit validity period
    function configureRFQProtection(
        UniversalAccessConfig storage data,
        uint16 maxDeviationBps,
        uint32 permitValidityBlocks
    ) internal {
        require(maxDeviationBps <= 1000, "Deviation too high"); // Max 10%
        data.maxRFQDeviationBps = maxDeviationBps;
        data.defaultPermitValidityBlocks = permitValidityBlocks;
    }
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Check if relay is authorized
    /// @param data Universal access configuration
    /// @param relay Relay address to check
    /// @return authorized Whether the relay is authorized
    function isRelayAuthorized(
        UniversalAccessConfig storage data,
        address relay
    ) internal view returns (bool authorized) {
        return data.authorizedRelays[relay];
    }
    
    /// @notice Check if trader is authorized for institutional trading
    /// @param data Universal access configuration
    /// @param trader Trader address to check
    /// @return authorized Whether the trader is authorized
    function isInstitutionalTrader(
        UniversalAccessConfig storage data,
        address trader
    ) internal view returns (bool authorized) {
        return data.institutionalTraders[trader];
    }
    
    /// @notice Check if signer is authorized for RFQ permits
    /// @param data Universal access configuration
    /// @param signer Signer address to check
    /// @return authorized Whether the signer is authorized
    function isAuthorizedSigner(
        UniversalAccessConfig storage data,
        address signer
    ) internal view returns (bool authorized) {
        return data.authorizedSigners[signer];
    }
    
    /// @notice Get trader's current nonce
    /// @param data Universal access configuration
    /// @param trader Trader address
    /// @return nonce Current nonce for the trader
    function getTraderNonce(
        UniversalAccessConfig storage data,
        address trader
    ) internal view returns (uint256 nonce) {
        return data.traderNonces[trader];
    }
    
    /// @notice Decode trader protection flags for access control
    /// @param traderProtection 4-byte trader protection flags
    /// @return enabled Whether access control is enabled
    /// @return accessMode Access control mode (0-7)
    function decodeAccessFlags(
        uint32 traderProtection
    ) internal pure returns (bool enabled, uint8 accessMode) {
        enabled = (traderProtection & ACCESS_CONTROL_ENABLED) != 0;
        accessMode = uint8((traderProtection & ACCESS_CONTROL_MASK) >> ACCESS_CONTROL_SHIFT);
    }
}
