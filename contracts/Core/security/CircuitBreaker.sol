// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title CircuitBreaker
 * @notice Emergency pause mechanism and rate limiting for pools
 * @dev Provides multiple layers of protection against attacks and unusual activity
 */
contract CircuitBreaker {
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct PoolLimits {
        uint256 maxSwapSize;           // Maximum size for a single swap
        uint256 dailyVolumeLimit;      // Maximum volume in 24 hours
        uint256 cooldownPeriod;        // Minimum time between large operations
        uint256 maxPriceImpact;        // Maximum allowed price impact (basis points)
        bool isPaused;                 // Emergency pause flag
        uint256 pausedUntil;          // Timestamp when pause ends (0 = indefinite)
    }
    
    struct PoolActivity {
        uint256 lastLargeOperation;    // Timestamp of last large operation
        uint256 dailyVolume;          // Rolling 24-hour volume
        uint256 lastVolumeReset;      // Last time daily volume was reset
        uint256 consecutiveFailures;  // Count of consecutive failed operations
        uint256 suspiciousActivity;   // Counter for suspicious patterns
    }
    
    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/
    
    // Pool-specific limits and activity tracking
    mapping(uint256 => PoolLimits) public poolLimits;
    mapping(uint256 => PoolActivity) public poolActivity;
    
    // Global circuit breaker
    bool public globalPause;
    uint256 public globalPauseUntil;
    
    // Thresholds for automatic triggers
    uint256 public constant MAX_CONSECUTIVE_FAILURES = 3;
    uint256 public constant SUSPICIOUS_ACTIVITY_THRESHOLD = 5;
    uint256 public constant DEFAULT_COOLDOWN = 1 minutes;
    uint256 public constant VOLUME_RESET_PERIOD = 24 hours;
    
    // Access control
    address public poolManager;
    mapping(address => bool) public guardians; // Can trigger emergency pause
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event CircuitBreakerTriggered(
        uint256 indexed poolId,
        string reason,
        uint256 pausedUntil
    );
    
    event CircuitBreakerReset(uint256 indexed poolId);
    
    event GlobalPauseActivated(uint256 pausedUntil);
    event GlobalPauseDeactivated();
    
    event LimitsUpdated(
        uint256 indexed poolId,
        uint256 maxSwapSize,
        uint256 dailyVolumeLimit,
        uint256 cooldownPeriod
    );
    
    event SuspiciousActivityDetected(
        uint256 indexed poolId,
        string activityType,
        uint256 severity
    );
    
    /*//////////////////////////////////////////////////////////////
                                 MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyPoolManager() {
        require(msg.sender == poolManager, "CircuitBreaker: Not PoolManager");
        _;
    }
    
    modifier onlyGuardian() {
        require(guardians[msg.sender] || msg.sender == poolManager, "CircuitBreaker: Not guardian");
        _;
    }
    
    modifier notGloballyPaused() {
        require(!globalPause || block.timestamp > globalPauseUntil, "CircuitBreaker: Globally paused");
        _;
    }
    
    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _poolManager) {
        poolManager = _poolManager;
        guardians[_poolManager] = true;
    }
    
    /*//////////////////////////////////////////////////////////////
                            CIRCUIT BREAKER CHECKS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Check if an operation should be allowed
     * @dev Main entry point for PoolManager to check before operations
     * @param poolId The pool to check
     * @param operationSize Size of the operation (in base units)
     * @param isLargeOperation Whether this is considered a large operation
     * @return allowed Whether the operation should proceed
     * @return reason If not allowed, the reason why
     */
    function checkOperation(
        uint256 poolId,
        uint256 operationSize,
        bool isLargeOperation
    ) external view notGloballyPaused returns (bool allowed, string memory reason) {
        PoolLimits memory limits = poolLimits[poolId];
        PoolActivity memory activity = poolActivity[poolId];
        
        // Check if pool is paused
        if (limits.isPaused) {
            if (limits.pausedUntil == 0 || block.timestamp < limits.pausedUntil) {
                return (false, "Pool is paused");
            }
        }
        
        // Check max swap size
        if (limits.maxSwapSize > 0 && operationSize > limits.maxSwapSize) {
            return (false, "Exceeds max swap size");
        }
        
        // Check cooldown for large operations
        if (isLargeOperation && limits.cooldownPeriod > 0) {
            if (block.timestamp < activity.lastLargeOperation + limits.cooldownPeriod) {
                return (false, "Cooldown period active");
            }
        }
        
        // Check daily volume limit
        if (limits.dailyVolumeLimit > 0) {
            uint256 currentDailyVolume = _getCurrentDailyVolume(poolId);
            if (currentDailyVolume + operationSize > limits.dailyVolumeLimit) {
                return (false, "Exceeds daily volume limit");
            }
        }
        
        // Check for suspicious activity
        if (activity.suspiciousActivity >= SUSPICIOUS_ACTIVITY_THRESHOLD) {
            return (false, "Suspicious activity detected");
        }
        
        // Check consecutive failures
        if (activity.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            return (false, "Too many consecutive failures");
        }
        
        return (true, "");
    }
    
    /**
     * @notice Record a successful operation
     * @dev Called by PoolManager after successful operation
     */
    function recordSuccess(
        uint256 poolId,
        uint256 operationSize,
        bool isLargeOperation
    ) external onlyPoolManager {
        PoolActivity storage activity = poolActivity[poolId];
        
        // Reset consecutive failures on success
        activity.consecutiveFailures = 0;
        
        // Update volume tracking
        _updateDailyVolume(poolId, operationSize);
        
        // Record large operation timestamp
        if (isLargeOperation) {
            activity.lastLargeOperation = block.timestamp;
        }
        
        // Decay suspicious activity counter on successful operations
        if (activity.suspiciousActivity > 0) {
            activity.suspiciousActivity--;
        }
    }
    
    /**
     * @notice Record a failed operation
     * @dev Called by PoolManager after failed operation
     */
    function recordFailure(uint256 poolId) external onlyPoolManager {
        PoolActivity storage activity = poolActivity[poolId];
        activity.consecutiveFailures++;
        
        // Auto-pause if too many failures
        if (activity.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            _triggerCircuitBreaker(poolId, "Max consecutive failures", 1 hours);
        }
    }
    
    /**
     * @notice Report suspicious activity
     * @dev Can be called by guardians or automated monitoring
     */
    function reportSuspiciousActivity(
        uint256 poolId,
        string calldata activityType,
        uint256 severity
    ) external onlyGuardian {
        require(severity > 0 && severity <= 10, "Invalid severity");
        
        PoolActivity storage activity = poolActivity[poolId];
        activity.suspiciousActivity += severity;
        
        emit SuspiciousActivityDetected(poolId, activityType, severity);
        
        // Auto-pause if threshold reached
        if (activity.suspiciousActivity >= SUSPICIOUS_ACTIVITY_THRESHOLD) {
            _triggerCircuitBreaker(poolId, "Suspicious activity threshold", 6 hours);
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    function _triggerCircuitBreaker(
        uint256 poolId,
        string memory reason,
        uint256 pauseDuration
    ) internal {
        poolLimits[poolId].isPaused = true;
        poolLimits[poolId].pausedUntil = block.timestamp + pauseDuration;
        
        emit CircuitBreakerTriggered(poolId, reason, poolLimits[poolId].pausedUntil);
    }
    
    function _getCurrentDailyVolume(uint256 poolId) internal view returns (uint256) {
        PoolActivity memory activity = poolActivity[poolId];
        
        // Reset if more than 24 hours have passed
        if (block.timestamp > activity.lastVolumeReset + VOLUME_RESET_PERIOD) {
            return 0;
        }
        
        return activity.dailyVolume;
    }
    
    function _updateDailyVolume(uint256 poolId, uint256 amount) internal {
        PoolActivity storage activity = poolActivity[poolId];
        
        // Reset if more than 24 hours have passed
        if (block.timestamp > activity.lastVolumeReset + VOLUME_RESET_PERIOD) {
            activity.dailyVolume = amount;
            activity.lastVolumeReset = block.timestamp;
        } else {
            activity.dailyVolume += amount;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Set limits for a pool
     * @dev Should be called when a pool is created or limits need updating
     */
    function setPoolLimits(
        uint256 poolId,
        uint256 maxSwapSize,
        uint256 dailyVolumeLimit,
        uint256 cooldownPeriod,
        uint256 maxPriceImpact
    ) external onlyPoolManager {
        poolLimits[poolId] = PoolLimits({
            maxSwapSize: maxSwapSize,
            dailyVolumeLimit: dailyVolumeLimit,
            cooldownPeriod: cooldownPeriod,
            maxPriceImpact: maxPriceImpact,
            isPaused: false,
            pausedUntil: 0
        });
        
        emit LimitsUpdated(poolId, maxSwapSize, dailyVolumeLimit, cooldownPeriod);
    }
    
    /**
     * @notice Emergency pause a specific pool
     */
    function pausePool(uint256 poolId, uint256 duration) external onlyGuardian {
        poolLimits[poolId].isPaused = true;
        poolLimits[poolId].pausedUntil = duration == 0 ? 0 : block.timestamp + duration;
        
        emit CircuitBreakerTriggered(poolId, "Manual pause", poolLimits[poolId].pausedUntil);
    }
    
    /**
     * @notice Resume a paused pool
     */
    function resumePool(uint256 poolId) external onlyGuardian {
        poolLimits[poolId].isPaused = false;
        poolLimits[poolId].pausedUntil = 0;
        poolActivity[poolId].consecutiveFailures = 0;
        poolActivity[poolId].suspiciousActivity = 0;
        
        emit CircuitBreakerReset(poolId);
    }
    
    /**
     * @notice Activate global pause (emergency only)
     */
    function activateGlobalPause(uint256 duration) external onlyGuardian {
        globalPause = true;
        globalPauseUntil = duration == 0 ? 0 : block.timestamp + duration;
        
        emit GlobalPauseActivated(globalPauseUntil);
    }
    
    /**
     * @notice Deactivate global pause
     */
    function deactivateGlobalPause() external onlyGuardian {
        globalPause = false;
        globalPauseUntil = 0;
        
        emit GlobalPauseDeactivated();
    }
    
    /**
     * @notice Add or remove a guardian
     */
    function setGuardian(address guardian, bool status) external onlyPoolManager {
        guardians[guardian] = status;
    }
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Check if a pool is currently paused
     */
    function isPoolPaused(uint256 poolId) external view returns (bool) {
        if (globalPause && (globalPauseUntil == 0 || block.timestamp < globalPauseUntil)) {
            return true;
        }
        
        PoolLimits memory limits = poolLimits[poolId];
        return limits.isPaused && (limits.pausedUntil == 0 || block.timestamp < limits.pausedUntil);
    }
    
    /**
     * @notice Get remaining cooldown time for a pool
     */
    function getRemainingCooldown(uint256 poolId) external view returns (uint256) {
        PoolActivity memory activity = poolActivity[poolId];
        PoolLimits memory limits = poolLimits[poolId];
        
        if (block.timestamp >= activity.lastLargeOperation + limits.cooldownPeriod) {
            return 0;
        }
        
        return (activity.lastLargeOperation + limits.cooldownPeriod) - block.timestamp;
    }
}
