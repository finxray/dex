// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ProtocolRegistry
/// @notice Gas-efficient protocol emergency controls without markings fragmentation
/// @dev Uses global registry + bitmap for O(1) pool type checking
contract ProtocolRegistry {
    
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/
    
    // Pool types (no markings fragmentation)
    uint8 constant PRIVATE_POOL = 0;      // User-created, no protocol control
    uint8 constant COMMUNITY_POOL = 1;    // Community quoter, limited control
    uint8 constant PROTOCOL_POOL = 2;     // Protocol quoter, full control
    
    // Emergency states
    uint8 constant NORMAL = 0;
    uint8 constant RATE_LIMITED = 1;
    uint8 constant PAUSE_LIQUIDITY = 2;
    uint8 constant PAUSE_TRADES = 3;
    uint8 constant FULL_PAUSE = 4;
    uint8 constant MIGRATION_MODE = 5;
    
    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/
    
    address public immutable poolManager;
    address public governance;
    address public emergencyMultisig;
    
    // Gas-efficient pool tracking
    mapping(uint256 => uint8) public poolTypes;           // poolId => type
    mapping(uint256 => uint8) public poolEmergencyStates; // poolId => emergency state
    
    // Global emergency controls (affect all pools of type)
    uint8 public globalProtocolState = NORMAL;    // All protocol pools
    uint8 public globalCommunityState = NORMAL;   // All community pools
    
    // Quoter verification (gas-efficient lookup)
    mapping(address => uint8) public quoterTypes;  // quoter => type
    mapping(address => bool) public verifiedQuoters; // quoter => verified
    
    // Events
    event PoolRegistered(uint256 indexed poolId, uint8 poolType, address quoter);
    event EmergencyStateChanged(uint256 indexed poolId, uint8 oldState, uint8 newState);
    event GlobalStateChanged(uint8 poolType, uint8 oldState, uint8 newState);
    event QuoterVerified(address indexed quoter, uint8 quoterType);
    
    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyGovernance() {
        require(msg.sender == governance, "Only governance");
        _;
    }
    
    modifier onlyEmergency() {
        require(msg.sender == emergencyMultisig || msg.sender == governance, "Only emergency");
        _;
    }
    
    modifier onlyPoolManager() {
        require(msg.sender == poolManager, "Only PoolManager");
        _;
    }
    
    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(
        address _poolManager,
        address _governance,
        address _emergencyMultisig
    ) {
        poolManager = _poolManager;
        governance = _governance;
        emergencyMultisig = _emergencyMultisig;
    }
    
    /*//////////////////////////////////////////////////////////////
                            POOL REGISTRATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register pool type when created (called by PoolManager)
    /// @param poolId Pool identifier
    /// @param quoter Quoter address used
    function registerPool(uint256 poolId, address quoter) external onlyPoolManager {
        uint8 poolType = quoterTypes[quoter]; // Default to PRIVATE_POOL (0)
        poolTypes[poolId] = poolType;
        poolEmergencyStates[poolId] = NORMAL;
        
        emit PoolRegistered(poolId, poolType, quoter);
    }
    
    /*//////////////////////////////////////////////////////////////
                            QUOTER MANAGEMENT
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register and verify quoter (governance controlled)
    /// @param quoter Quoter contract address
    /// @param quoterType Type of quoter (COMMUNITY_POOL or PROTOCOL_POOL)
    function verifyQuoter(address quoter, uint8 quoterType) external onlyGovernance {
        require(quoterType == COMMUNITY_POOL || quoterType == PROTOCOL_POOL, "Invalid type");
        require(quoter != address(0), "Invalid quoter");
        
        quoterTypes[quoter] = quoterType;
        verifiedQuoters[quoter] = true;
        
        emit QuoterVerified(quoter, quoterType);
    }
    
    /*//////////////////////////////////////////////////////////////
                            EMERGENCY CONTROLS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Emergency pause all protocol pools (immediate)
    /// @param newState Emergency state to set
    function emergencyPauseProtocolPools(uint8 newState) external onlyEmergency {
        require(newState >= RATE_LIMITED && newState <= MIGRATION_MODE, "Invalid state");
        
        uint8 oldState = globalProtocolState;
        globalProtocolState = newState;
        
        emit GlobalStateChanged(PROTOCOL_POOL, oldState, newState);
    }
    
    /// @notice Timelock community pools (governance only)
    /// @param newState Emergency state to set  
    /// @param delayBlocks Number of blocks to delay
    function timelockCommunityPools(uint8 newState, uint256 delayBlocks) external onlyGovernance {
        require(newState >= RATE_LIMITED && newState <= MIGRATION_MODE, "Invalid state");
        require(delayBlocks >= 7200, "Minimum 24 hours"); // ~24 hours at 12s blocks
        
        // Schedule the action (simplified - could use full timelock contract)
        // For now, execute immediately for gas testing
        uint8 oldState = globalCommunityState;
        globalCommunityState = newState;
        
        emit GlobalStateChanged(COMMUNITY_POOL, oldState, newState);
    }
    
    /// @notice Pause specific pool (for targeted response)
    /// @param poolId Pool to pause
    /// @param newState Emergency state
    function pauseSpecificPool(uint256 poolId, uint8 newState) external onlyEmergency {
        require(poolTypes[poolId] != PRIVATE_POOL, "Cannot pause private pools");
        require(newState >= RATE_LIMITED && newState <= MIGRATION_MODE, "Invalid state");
        
        uint8 oldState = poolEmergencyStates[poolId];
        poolEmergencyStates[poolId] = newState;
        
        emit EmergencyStateChanged(poolId, oldState, newState);
    }
    
    /*//////////////////////////////////////////////////////////////
                            VALIDATION (Gas Optimized)
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Check if operation is allowed (called by PoolManager)
    /// @param poolId Pool identifier
    /// @param operationType Operation type (0=swap, 1=addLiquidity, 2=removeLiquidity)
    /// @return allowed Whether operation is allowed
    function validateOperation(
        uint256 poolId,
        uint8 operationType
    ) external view returns (bool allowed) {
        
        uint8 poolType = poolTypes[poolId];
        
        // Private pools - always allowed (no protocol control)
        if (poolType == PRIVATE_POOL) {
            return true;
        }
        
        // Get effective emergency state (global or specific)
        uint8 effectiveState;
        if (poolType == PROTOCOL_POOL) {
            effectiveState = _maxState(globalProtocolState, poolEmergencyStates[poolId]);
        } else if (poolType == COMMUNITY_POOL) {
            effectiveState = _maxState(globalCommunityState, poolEmergencyStates[poolId]);
        } else {
            return true; // Unknown type, allow
        }
        
        // State-based operation validation
        return _validateOperationByState(effectiveState, operationType);
    }
    
    /// @notice Validate operation based on emergency state
    /// @param state Emergency state
    /// @param operationType Operation type
    /// @return allowed Whether operation is allowed
    function _validateOperationByState(uint8 state, uint8 operationType) private pure returns (bool allowed) {
        if (state == NORMAL) return true;
        if (state == RATE_LIMITED) return true; // Rate limits handled by quoters
        if (state == PAUSE_LIQUIDITY) return operationType != 1; // Block addLiquidity
        if (state == PAUSE_TRADES) return operationType != 0; // Block swaps
        if (state == FULL_PAUSE) return false; // Block all
        if (state == MIGRATION_MODE) return operationType == 2; // Only removeLiquidity
        return false;
    }
    
    /// @notice Get maximum of two states (more restrictive wins)
    /// @param state1 First state
    /// @param state2 Second state  
    /// @return maxState More restrictive state
    function _maxState(uint8 state1, uint8 state2) private pure returns (uint8 maxState) {
        return state1 > state2 ? state1 : state2;
    }
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get pool information
    /// @param poolId Pool identifier
    /// @return poolType Type of pool
    /// @return emergencyState Current emergency state
    /// @return effectiveState Effective state (considering global controls)
    function getPoolInfo(uint256 poolId) external view returns (
        uint8 poolType,
        uint8 emergencyState, 
        uint8 effectiveState
    ) {
        poolType = poolTypes[poolId];
        emergencyState = poolEmergencyStates[poolId];
        
        if (poolType == PROTOCOL_POOL) {
            effectiveState = _maxState(globalProtocolState, emergencyState);
        } else if (poolType == COMMUNITY_POOL) {
            effectiveState = _maxState(globalCommunityState, emergencyState);
        } else {
            effectiveState = NORMAL; // Private pools not controlled
        }
    }
    
    /// @notice Get quoter information
    /// @param quoter Quoter address
    /// @return quoterType Type of quoter
    /// @return verified Whether quoter is verified
    function getQuoterInfo(address quoter) external view returns (uint8 quoterType, bool verified) {
        return (quoterTypes[quoter], verifiedQuoters[quoter]);
    }
    
    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Update governance addresses
    /// @param _governance New governance address
    /// @param _emergencyMultisig New emergency multisig
    function updateGovernance(
        address _governance,
        address _emergencyMultisig
    ) external onlyGovernance {
        governance = _governance;
        emergencyMultisig = _emergencyMultisig;
    }
}
