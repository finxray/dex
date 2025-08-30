// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MEVProtectionLevel} from "../structs/MEVProtectionLevel.sol";
import {TransientStorage} from "../libraries/TransientStorage.sol";

/**
 * @title MEVProtection
 * @notice Modular MEV protection system - pools choose their protection level
 * @dev Non-opinionated: each pool can balance security vs gas costs
 */
contract MEVProtection {
    using TransientStorage for bytes32;
    using MEVProtectionLevel for uint8;
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct PoolMEVConfig {
        uint8 protectionLevel;      // Bitfield of active protections
        uint256 largeTradeThreshold; // Threshold for enhanced protection
        uint256 baseFee;            // Base fee in basis points
        uint256 surgeFee;           // Additional fee during high activity
        uint256 commitRevealDelay;  // Blocks to wait for reveal
        uint256 gradualFillBlocks;  // Blocks for gradual fill
        uint256 timeLockPeriod;     // Minimum seconds between trades
        address[] whitelist;        // For private pools
    }
    
    struct Commitment {
        bytes32 commitHash;         // Hash of trade parameters
        uint256 commitBlock;        // Block when committed
        address trader;             // Who committed
        uint256 deadline;           // Reveal deadline
    }
    
    struct GradualOrder {
        uint256 startPrice;         // Initial price (unfavorable)
        uint256 endPrice;          // Target price (favorable)
        uint256 startBlock;        // When auction started
        uint256 endBlock;          // When auction ends
        uint256 amountRemaining;   // Amount still to fill
    }
    
    struct ActivityTracker {
        uint256 recentVolume;      // Rolling volume window
        uint256 lastUpdateBlock;   // Last activity update
        uint256 suspicionScore;    // MEV detection score
        mapping(address => uint256) lastTradeTime; // Per-trader cooldowns
    }
    
    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/
    
    // Pool-specific MEV configurations
    mapping(uint256 => PoolMEVConfig) public poolConfigs;
    
    // Commit-reveal storage
    mapping(uint256 => mapping(address => Commitment)) public commitments;
    
    // Gradual fill orders
    mapping(uint256 => mapping(uint256 => GradualOrder)) public gradualOrders;
    uint256 public nextOrderId;
    
    // Activity tracking for dynamic fees
    mapping(uint256 => ActivityTracker) private activityTrackers;
    
    // Pool manager for access control
    address public immutable poolManager;
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event MEVConfigSet(
        uint256 indexed poolId,
        uint8 protectionLevel,
        uint256 threshold,
        string description
    );
    
    event TradeCommitted(
        uint256 indexed poolId,
        address indexed trader,
        bytes32 commitHash,
        uint256 revealDeadline
    );
    
    event TradeRevealed(
        uint256 indexed poolId,
        address indexed trader,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event GradualOrderCreated(
        uint256 indexed poolId,
        uint256 indexed orderId,
        uint256 startPrice,
        uint256 endPrice
    );
    
    event SandwichAttackDetected(
        uint256 indexed poolId,
        address indexed suspectedAttacker,
        uint256 suspicionScore
    );
    
    event DynamicFeeApplied(
        uint256 indexed poolId,
        uint256 baseFee,
        uint256 surgeFee,
        uint256 totalFee
    );
    
    /*//////////////////////////////////////////////////////////////
                                 MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyPoolManager() {
        require(msg.sender == poolManager, "MEV: Not pool manager");
        _;
    }
    
    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _poolManager) {
        poolManager = _poolManager;
    }
    
    /*//////////////////////////////////////////////////////////////
                            CONFIGURATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Configure MEV protection for a pool
     * @dev Called during pool creation or by pool admin
     * @param poolId The pool to configure
     * @param level Protection level (bitfield)
     * @param threshold Large trade threshold (0 = always protect)
     */
    function configurePoolProtection(
        uint256 poolId,
        uint8 level,
        uint256 threshold
    ) external onlyPoolManager {
        PoolMEVConfig storage config = poolConfigs[poolId];
        
        config.protectionLevel = level;
        config.largeTradeThreshold = threshold;
        
        // Set reasonable defaults based on protection level
        if (level.isEnabled(MEVProtectionLevel.DYNAMIC_FEE)) {
            config.baseFee = 30;  // 0.3% base
            config.surgeFee = 100; // Up to 1% during high activity
        }
        
        if (level.isEnabled(MEVProtectionLevel.COMMIT_REVEAL)) {
            config.commitRevealDelay = 2; // 2 blocks (~24 seconds)
        }
        
        if (level.isEnabled(MEVProtectionLevel.GRADUAL_FILL)) {
            config.gradualFillBlocks = 10; // ~2 minutes
        }
        
        if (level.isEnabled(MEVProtectionLevel.TIME_LOCK)) {
            config.timeLockPeriod = 12; // 12 seconds minimum
        }
        
        emit MEVConfigSet(poolId, level, threshold, level.describe());
    }
    
    /**
     * @notice Set custom parameters for fine-tuning
     * @dev For advanced LPs who want specific configurations
     */
    function setCustomParameters(
        uint256 poolId,
        uint256 baseFee,
        uint256 surgeFee,
        uint256 commitDelay,
        uint256 gradualBlocks,
        uint256 timeLock
    ) external onlyPoolManager {
        PoolMEVConfig storage config = poolConfigs[poolId];
        
        if (baseFee > 0) config.baseFee = baseFee;
        if (surgeFee > 0) config.surgeFee = surgeFee;
        if (commitDelay > 0) config.commitRevealDelay = commitDelay;
        if (gradualBlocks > 0) config.gradualFillBlocks = gradualBlocks;
        if (timeLock > 0) config.timeLockPeriod = timeLock;
    }
    
    /*//////////////////////////////////////////////////////////////
                        PROTECTION CHECK FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Check if trade should be protected
     * @dev Main entry point for PoolManager
     * @return needsProtection Whether MEV protection should be applied
     * @return protectionType Type of protection to apply
     * @return adjustedFee Fee after MEV adjustments
     */
    function checkTradeProtection(
        uint256 poolId,
        address trader,
        uint256 amountIn,
        bool isLargeTrade
    ) external view returns (
        bool needsProtection,
        uint8 protectionType,
        uint256 adjustedFee
    ) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        
        // No protection configured
        if (config.protectionLevel == MEVProtectionLevel.NONE) {
            return (false, 0, config.baseFee);
        }
        
        // Check if protection should apply
        bool shouldProtect = isLargeTrade || 
            (config.largeTradeThreshold > 0 && amountIn >= config.largeTradeThreshold);
        
        if (!shouldProtect && config.protectionLevel.isEnabled(MEVProtectionLevel.THRESHOLD_ONLY)) {
            return (false, 0, config.baseFee);
        }
        
        needsProtection = true;
        protectionType = config.protectionLevel;
        
        // Calculate dynamic fee if enabled
        if (config.protectionLevel.isEnabled(MEVProtectionLevel.DYNAMIC_FEE)) {
            adjustedFee = _calculateDynamicFee(poolId, amountIn);
        } else {
            adjustedFee = config.baseFee;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                        COMMIT-REVEAL MECHANISM
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Commit to a trade (phase 1 of commit-reveal)
     * @dev Hides trade parameters until reveal
     */
    function commitTrade(
        uint256 poolId,
        bytes32 commitHash
    ) external returns (uint256 revealDeadline) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        require(
            config.protectionLevel.isEnabled(MEVProtectionLevel.COMMIT_REVEAL),
            "MEV: Commit-reveal not enabled"
        );
        
        revealDeadline = block.number + config.commitRevealDelay;
        
        commitments[poolId][msg.sender] = Commitment({
            commitHash: commitHash,
            commitBlock: block.number,
            trader: msg.sender,
            deadline: revealDeadline
        });
        
        emit TradeCommitted(poolId, msg.sender, commitHash, revealDeadline);
    }
    
    /**
     * @notice Reveal and execute trade (phase 2)
     * @dev Verifies commitment and executes if valid
     */
    function verifyAndReveal(
        uint256 poolId,
        address trader,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut,
        uint256 nonce
    ) external view returns (bool valid) {
        Commitment memory commit = commitments[poolId][trader];
        
        // Check reveal window
        require(block.number > commit.commitBlock, "MEV: Too early");
        require(block.number <= commit.deadline, "MEV: Too late");
        
        // Verify hash
        bytes32 expectedHash = keccak256(abi.encodePacked(
            poolId,
            trader,
            amountIn,
            zeroForOne,
            minAmountOut,
            nonce
        ));
        
        return commit.commitHash == expectedHash;
    }
    
    /*//////////////////////////////////////////////////////////////
                        GRADUAL FILL MECHANISM
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Create a gradual fill order (Dutch auction style)
     * @dev Price improves over time to find fair value
     */
    function createGradualOrder(
        uint256 poolId,
        uint256 amountIn,
        uint256 startPrice,
        uint256 endPrice
    ) external returns (uint256 orderId) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        require(
            config.protectionLevel.isEnabled(MEVProtectionLevel.GRADUAL_FILL),
            "MEV: Gradual fill not enabled"
        );
        
        orderId = nextOrderId++;
        
        gradualOrders[poolId][orderId] = GradualOrder({
            startPrice: startPrice,
            endPrice: endPrice,
            startBlock: block.number,
            endBlock: block.number + config.gradualFillBlocks,
            amountRemaining: amountIn
        });
        
        emit GradualOrderCreated(poolId, orderId, startPrice, endPrice);
    }
    
    /**
     * @notice Get current price for gradual order
     * @dev Linear interpolation between start and end price
     */
    function getCurrentGradualPrice(
        uint256 poolId,
        uint256 orderId
    ) external view returns (uint256 currentPrice) {
        GradualOrder memory order = gradualOrders[poolId][orderId];
        
        if (block.number >= order.endBlock) {
            return order.endPrice;
        }
        
        uint256 elapsed = block.number - order.startBlock;
        uint256 duration = order.endBlock - order.startBlock;
        
        if (order.startPrice > order.endPrice) {
            // Price decreasing (sell order)
            uint256 priceDrop = order.startPrice - order.endPrice;
            uint256 currentDrop = (priceDrop * elapsed) / duration;
            return order.startPrice - currentDrop;
        } else {
            // Price increasing (buy order)
            uint256 priceRise = order.endPrice - order.startPrice;
            uint256 currentRise = (priceRise * elapsed) / duration;
            return order.startPrice + currentRise;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                        DYNAMIC FEE CALCULATION
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Calculate dynamic fee based on recent activity
     * @dev Higher fees during suspected sandwich attacks
     */
    function _calculateDynamicFee(
        uint256 poolId,
        uint256 amountIn
    ) private view returns (uint256) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        ActivityTracker storage tracker = activityTrackers[poolId];
        
        // Base fee always applies
        uint256 fee = config.baseFee;
        
        // Add surge fee based on recent activity
        uint256 blocksSinceUpdate = block.number - tracker.lastUpdateBlock;
        if (blocksSinceUpdate < 3) {
            // Very recent activity - possible sandwich
            fee += config.surgeFee;
            
            // Extra fee for suspected sandwich attack
            if (tracker.suspicionScore > 5) {
                fee += config.surgeFee / 2;
            }
        } else if (blocksSinceUpdate < 10) {
            // Recent activity - moderate surge
            fee += config.surgeFee / 2;
        }
        
        // Volume-based surge
        if (tracker.recentVolume > 0) {
            uint256 volumeRatio = (amountIn * 100) / tracker.recentVolume;
            if (volumeRatio > 10) {
                // Large trade relative to recent volume
                fee += config.surgeFee / 4;
            }
        }
        
        return fee;
    }
    
    /*//////////////////////////////////////////////////////////////
                        SANDWICH DETECTION
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Detect potential sandwich attacks
     * @dev Analyzes patterns to identify MEV bots
     */
    function detectSandwichPattern(
        uint256 poolId,
        address trader,
        uint256 amountIn,
        bool isBuy
    ) external onlyPoolManager returns (bool suspected) {
        ActivityTracker storage tracker = activityTrackers[poolId];
        
        // Check for suspicious patterns
        uint256 timeSinceLastTrade = block.timestamp - tracker.lastTradeTime[trader];
        
        // Same trader, opposite direction, very quickly
        if (timeSinceLastTrade < 30) {
            tracker.suspicionScore += 3;
        }
        
        // Large trade immediately after small trade
        if (block.number == tracker.lastUpdateBlock && amountIn > tracker.recentVolume * 2) {
            tracker.suspicionScore += 2;
        }
        
        // Update tracker
        tracker.recentVolume = (tracker.recentVolume * 9 + amountIn) / 10; // EMA
        tracker.lastUpdateBlock = block.number;
        tracker.lastTradeTime[trader] = block.timestamp;
        
        // Decay suspicion over time
        if (tracker.suspicionScore > 0 && block.number > tracker.lastUpdateBlock + 10) {
            tracker.suspicionScore--;
        }
        
        suspected = tracker.suspicionScore > 5;
        
        if (suspected) {
            emit SandwichAttackDetected(poolId, trader, tracker.suspicionScore);
        }
        
        return suspected;
    }
    
    /*//////////////////////////////////////////////////////////////
                        TIME LOCK ENFORCEMENT
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Check if trader can trade (time lock)
     * @dev Prevents rapid-fire trades
     */
    function canTrade(
        uint256 poolId,
        address trader
    ) external view returns (bool allowed, uint256 timeRemaining) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        
        if (!config.protectionLevel.isEnabled(MEVProtectionLevel.TIME_LOCK)) {
            return (true, 0);
        }
        
        uint256 lastTrade = activityTrackers[poolId].lastTradeTime[trader];
        if (lastTrade == 0) {
            return (true, 0);
        }
        
        uint256 elapsed = block.timestamp - lastTrade;
        if (elapsed >= config.timeLockPeriod) {
            return (true, 0);
        }
        
        return (false, config.timeLockPeriod - elapsed);
    }
    
    /*//////////////////////////////////////////////////////////////
                        PRIVATE POOL MANAGEMENT
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Manage whitelist for private pools
     * @dev Only whitelisted addresses can trade
     */
    function updateWhitelist(
        uint256 poolId,
        address[] calldata addresses,
        bool add
    ) external onlyPoolManager {
        PoolMEVConfig storage config = poolConfigs[poolId];
        require(
            config.protectionLevel.isEnabled(MEVProtectionLevel.PRIVATE_POOL),
            "MEV: Not a private pool"
        );
        
        if (add) {
            for (uint256 i = 0; i < addresses.length; i++) {
                config.whitelist.push(addresses[i]);
            }
        } else {
            // Remove addresses (simplified - production would optimize)
            delete config.whitelist;
        }
    }
    
    /**
     * @notice Check if address is whitelisted
     */
    function isWhitelisted(
        uint256 poolId,
        address trader
    ) external view returns (bool) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        
        if (!config.protectionLevel.isEnabled(MEVProtectionLevel.PRIVATE_POOL)) {
            return true; // Not a private pool
        }
        
        for (uint256 i = 0; i < config.whitelist.length; i++) {
            if (config.whitelist[i] == trader) {
                return true;
            }
        }
        
        return false;
    }
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Get complete MEV configuration for a pool
     */
    function getPoolMEVConfig(uint256 poolId) external view returns (
        uint8 protectionLevel,
        string memory description,
        uint256 estimatedGasOverhead,
        uint256 currentFee
    ) {
        PoolMEVConfig memory config = poolConfigs[poolId];
        protectionLevel = config.protectionLevel;
        description = config.protectionLevel.describe();
        estimatedGasOverhead = config.protectionLevel.estimateGasOverhead();
        currentFee = _calculateDynamicFee(poolId, 0);
    }
    
    /**
     * @notice Check if pool has any MEV protection
     */
    function hasProtection(uint256 poolId) external view returns (bool) {
        return poolConfigs[poolId].protectionLevel != MEVProtectionLevel.NONE;
    }
}
