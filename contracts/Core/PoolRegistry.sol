// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PoolInfo} from "./structs/PoolInfo.sol";

/**
 * @title PoolRegistry
 * @notice Centralized registry for pool metadata and statistics
 * @dev Separates pool metadata from core pool logic for cleaner architecture
 */
contract PoolRegistry {
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct PoolMetadata {
        address asset0;
        address asset1;
        address quoter;
        bytes3 markings;
        uint256 createdAt;
        uint256 totalVolume;
        uint256 totalFees;
        bool isActive;
        string name;
        string description;
    }
    
    struct PoolStatistics {
        uint256 swapCount;
        uint256 liquidityEventCount;
        uint256 lastActivityTimestamp;
        uint256 highestLiquidity;
        uint256 lowestLiquidity;
        uint128 avgSwapSize;
    }
    
    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/
    
    // Pool metadata storage
    mapping(uint256 => PoolMetadata) public poolMetadata;
    mapping(uint256 => PoolStatistics) public poolStatistics;
    
    // Quick lookup mappings
    mapping(bytes32 => uint256) public poolLookup; // keccak256(asset0, asset1, quoter, markings) => poolId
    mapping(address => uint256[]) public poolsByAsset; // asset => poolIds containing this asset
    mapping(address => uint256[]) public poolsByQuoter; // quoter => poolIds using this quoter
    
    // Pool count for iteration
    uint256 public totalPools;
    uint256[] public allPoolIds;
    
    // Access control
    address public poolManager;
    mapping(address => bool) public authorized;
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event PoolRegistered(
        uint256 indexed poolId,
        address indexed asset0,
        address indexed asset1,
        address quoter,
        bytes3 markings,
        uint256 timestamp
    );
    
    event PoolMetadataUpdated(
        uint256 indexed poolId,
        string name,
        string description
    );
    
    event PoolDeactivated(uint256 indexed poolId, uint256 timestamp);
    event PoolReactivated(uint256 indexed poolId, uint256 timestamp);
    
    event PoolStatisticsUpdated(
        uint256 indexed poolId,
        uint256 swapCount,
        uint256 volume,
        uint256 fees
    );
    
    /*//////////////////////////////////////////////////////////////
                                 MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyPoolManager() {
        require(msg.sender == poolManager, "PoolRegistry: Not PoolManager");
        _;
    }
    
    modifier onlyAuthorized() {
        require(msg.sender == poolManager || authorized[msg.sender], "PoolRegistry: Not authorized");
        _;
    }
    
    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _poolManager) {
        poolManager = _poolManager;
    }
    
    /*//////////////////////////////////////////////////////////////
                            REGISTRATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Register a new pool in the registry
     * @dev Called by PoolManager when creating a new pool
     */
    function registerPool(
        uint256 poolId,
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external onlyPoolManager returns (bool) {
        // Check if pool already exists
        if (poolMetadata[poolId].createdAt != 0) {
            return false; // Pool already registered
        }
        
        // Store metadata
        poolMetadata[poolId] = PoolMetadata({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            markings: markings,
            createdAt: block.timestamp,
            totalVolume: 0,
            totalFees: 0,
            isActive: true,
            name: "",
            description: ""
        });
        
        // Initialize statistics
        poolStatistics[poolId] = PoolStatistics({
            swapCount: 0,
            liquidityEventCount: 0,
            lastActivityTimestamp: block.timestamp,
            highestLiquidity: 0,
            lowestLiquidity: type(uint256).max,
            avgSwapSize: 0
        });
        
        // Update lookup mappings
        bytes32 lookupKey = keccak256(abi.encodePacked(asset0, asset1, quoter, markings));
        poolLookup[lookupKey] = poolId;
        
        // Add to asset mappings
        poolsByAsset[asset0].push(poolId);
        if (asset1 != asset0) {
            poolsByAsset[asset1].push(poolId);
        }
        
        // Add to quoter mapping
        poolsByQuoter[quoter].push(poolId);
        
        // Update global counters
        allPoolIds.push(poolId);
        totalPools++;
        
        emit PoolRegistered(poolId, asset0, asset1, quoter, markings, block.timestamp);
        
        return true;
    }
    
    /*//////////////////////////////////////////////////////////////
                            UPDATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Update pool metadata (name, description)
     * @dev Can be called by authorized addresses to add descriptive information
     */
    function updatePoolMetadata(
        uint256 poolId,
        string calldata name,
        string calldata description
    ) external onlyAuthorized {
        require(poolMetadata[poolId].createdAt != 0, "PoolRegistry: Pool not found");
        
        poolMetadata[poolId].name = name;
        poolMetadata[poolId].description = description;
        
        emit PoolMetadataUpdated(poolId, name, description);
    }
    
    /**
     * @notice Record a swap event for statistics
     * @dev Called by PoolManager after successful swap
     */
    function recordSwap(
        uint256 poolId,
        uint256 swapSize,
        uint256 volumeInUSD,
        uint256 feesCollected
    ) external onlyPoolManager {
        PoolStatistics storage stats = poolStatistics[poolId];
        PoolMetadata storage meta = poolMetadata[poolId];
        
        stats.swapCount++;
        stats.lastActivityTimestamp = block.timestamp;
        
        // Update average swap size (simple moving average)
        if (stats.avgSwapSize == 0) {
            stats.avgSwapSize = uint128(swapSize);
        } else {
            stats.avgSwapSize = uint128((uint256(stats.avgSwapSize) * 9 + swapSize) / 10);
        }
        
        // Update totals
        meta.totalVolume += volumeInUSD;
        meta.totalFees += feesCollected;
        
        emit PoolStatisticsUpdated(poolId, stats.swapCount, meta.totalVolume, meta.totalFees);
    }
    
    /**
     * @notice Record a liquidity event for statistics
     * @dev Called by PoolManager after add/remove liquidity
     */
    function recordLiquidityEvent(
        uint256 poolId,
        uint256 currentLiquidity
    ) external onlyPoolManager {
        PoolStatistics storage stats = poolStatistics[poolId];
        
        stats.liquidityEventCount++;
        stats.lastActivityTimestamp = block.timestamp;
        
        if (currentLiquidity > stats.highestLiquidity) {
            stats.highestLiquidity = currentLiquidity;
        }
        if (currentLiquidity < stats.lowestLiquidity && currentLiquidity > 0) {
            stats.lowestLiquidity = currentLiquidity;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Deactivate a pool (for emergency or maintenance)
     */
    function deactivatePool(uint256 poolId) external onlyAuthorized {
        require(poolMetadata[poolId].isActive, "PoolRegistry: Already inactive");
        poolMetadata[poolId].isActive = false;
        emit PoolDeactivated(poolId, block.timestamp);
    }
    
    /**
     * @notice Reactivate a pool
     */
    function reactivatePool(uint256 poolId) external onlyAuthorized {
        require(!poolMetadata[poolId].isActive, "PoolRegistry: Already active");
        poolMetadata[poolId].isActive = true;
        emit PoolReactivated(poolId, block.timestamp);
    }
    
    /**
     * @notice Authorize an address for admin functions
     */
    function setAuthorized(address account, bool status) external onlyPoolManager {
        authorized[account] = status;
    }
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Get all pools for a specific asset
     */
    function getPoolsByAsset(address asset) external view returns (uint256[] memory) {
        return poolsByAsset[asset];
    }
    
    /**
     * @notice Get all pools using a specific quoter
     */
    function getPoolsByQuoter(address quoter) external view returns (uint256[] memory) {
        return poolsByQuoter[quoter];
    }
    
    /**
     * @notice Get pool by lookup key
     */
    function getPoolByKey(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(asset0, asset1, quoter, markings));
        return poolLookup[key];
    }
    
    /**
     * @notice Check if a pool is active
     */
    function isPoolActive(uint256 poolId) external view returns (bool) {
        return poolMetadata[poolId].isActive;
    }
    
    /**
     * @notice Get all pool IDs (for iteration)
     */
    function getAllPoolIds() external view returns (uint256[] memory) {
        return allPoolIds;
    }
    
    /**
     * @notice Get detailed pool information
     */
    function getPoolDetails(uint256 poolId) external view returns (
        PoolMetadata memory metadata,
        PoolStatistics memory statistics
    ) {
        return (poolMetadata[poolId], poolStatistics[poolId]);
    }
}
