// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Custom errors for gas-efficient reverts
error PoolManager__InsufficientOutput(uint256 minOut, uint256 actual);
error PoolManager__InvalidQuote();
error PoolManager__AtomicExecutionRequired();
error PoolManager__AccessDenied();
error PoolManager__OperationPaused();

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRouter} from "./QuoteRouter.sol";
import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {Hop} from "./structs/Hop.sol";
import {PoolInfo} from "./structs/PoolInfo.sol";
import {ReentrancyGuard} from "./security/ReentrancyGuard.sol";
import {FlashAccounting} from "./libraries/FlashAccounting.sol";
import {IFlashCallback} from "./interfaces/internal/IFlashCallback.sol";
import {CommitRevealLib} from "./MEV/CommitRevealLib.sol";
import {AtomicExecutionLib} from "./MEV/AtomicExecutionLib.sol";
import {AccessControlLib} from "./MEV/AccessControlLib.sol";
import {SimpleGovernanceLib} from "./libraries/SimpleGovernanceLib.sol";
import {IPoolManager} from "./interfaces/internal/IPoolManager.sol";

/// @title PoolManager
/// @notice Core pool management contract optimized for size
/// @dev Liquidity management moved to external LiquidityManager contract
contract PoolManager is ERC6909Claims, QuoteRouter, ReentrancyGuard, IPoolManager {
    
    // Library storage for total liquidity tracking
    PoolManagerLib.PoolManagerStorage private _storage;
    
    // Address of external LiquidityManager contract
    address public liquidityManager;
    
    constructor(
        address _defaultData0Bridge
    ) QuoteRouter(_defaultData0Bridge) {
        // Initialize libraries with minimal setup
        AtomicExecutionLib.initializeDefaultConfigs(_storage.atomicData);
        AccessControlLib.initializeUniversalAccess(_storage.accessData);
    }
    
    /// @notice Set the liquidity manager address (one-time setup)
    function setLiquidityManager(address _liquidityManager) external {
        require(liquidityManager == address(0), "Already set");
        require(_liquidityManager != address(0), "Invalid address");
        liquidityManager = _liquidityManager;
    }
    
    /// @notice Creates a new pool
    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external nonReentrant returns (uint256 poolID) {
        poolID = PoolManagerLib.createPool(_storage, asset0, asset1, quoter, markings);
        
        if (SimpleGovernanceLib.isProtocolPool(markings)) {
            require(
                SimpleGovernanceLib.canCreateProtocolPool(_storage.simpleGovernance, msg.sender),
                "Only protocol"
            );
            SimpleGovernanceLib.registerProtocolPool(_storage.simpleGovernance, poolID);
        }
    }
    
    /// @notice Get pool information
    function getPoolInfo(uint256 poolID) external view returns (
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) {
        PoolInfo memory poolInfo = PoolManagerLib.getPoolInfo(_storage, poolID);
        return (poolInfo.asset0, poolInfo.asset1, poolInfo.quoter, poolInfo.markings);
    }
    
    /// @notice Get total liquidity for a pool
    function totalLiquidity(uint256 poolID) external view override returns (uint256) {
        return _storage.totalLiquidity[poolID];
    }

    /// @notice Get current pool inventory
    function getInventory(uint256 poolId) external view override returns (uint128 asset0, uint128 asset1) {
        uint256 packed = _storage.poolInventories[poolId];
        asset0 = uint128(packed);
        asset1 = uint128(packed >> 128);
    }

    /// @notice Update inventory (internal helper)
    function _updateInventory(uint256 poolId, int128 asset0Delta, int128 asset1Delta) internal {
        uint256 packed = _storage.poolInventories[poolId];
        uint128 a0 = uint128(int128(uint128(packed)) + asset0Delta);
        uint128 a1 = uint128(int128(uint128(packed >> 128)) + asset1Delta);
        _storage.poolInventories[poolId] = uint256(a0) | (uint256(a1) << 128);
    }

    /// @notice Swap assets in a pool - CORE FUNCTION (kept internal for gas efficiency)
    function swap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable nonReentrant returns (uint256 amountOut) {
        return _executeSwap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minAmountOut, 0x00000000, "");
    }

    /// @notice Swap with trader protection
    function swapWithProtection(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut,
        bytes4 traderProtection
    ) external payable nonReentrant returns (uint256 amountOut) {
        return _executeSwap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minAmountOut, traderProtection, "");
    }

    /// @notice Multi-hop batch swap
    function batchSwap(
        Hop[] calldata hops,
        uint256 amountIn,
        uint256 minAmountOut
    ) external payable nonReentrant returns (uint256 amountOut) {
        address recipient = FlashAccounting.getActiveUser();
        if (recipient == address(0)) recipient = msg.sender;

        amountOut = PoolManagerLib.executeBatchSwap(_storage, hops, amountIn, msg.value, recipient, address(this));
        
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);
    }

    /// @notice Flash session for composable operations
    function flashSession(address callback, bytes calldata data, address[] calldata tokens) external payable nonReentrantKey(keccak256("flashSession")) {
        FlashAccounting.startSession(msg.sender);
        FlashAccounting.setActiveUser(msg.sender);
        IFlashCallback(callback).flashCallback(data);
        PoolManagerLib.settleUserTokens(msg.sender, tokens, msg.value);
        FlashAccounting.clearActiveUser();
        FlashAccounting.endSession(msg.sender);
    }

    /// @notice Get user deltas
    function getUserDeltas(address user, address[] calldata tokens) public view returns (int256[] memory deltas) {
        deltas = new int256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ) {
            deltas[i] = FlashAccounting.getDelta(user, tokens[i]);
            unchecked { ++i; }
        }
    }

    /// @notice Expose quote function for external contracts
    function routerGetQuote(
        SwapParams memory p,
        uint128 asset0Balance,
        uint128 asset1Balance
    ) public override returns (uint256 quote, uint256 poolID) {
        return QuoteRouter.getQuote(p, asset0Balance, asset1Balance);
    }

    /// @notice Execute liquidity addition (called by LiquidityManager)
    function executeLiquidityAdd(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        address user,
        uint256 msgValue
    ) external override returns (uint256 actualLiquidity) {
        require(msg.sender == liquidityManager, "Only LiquidityManager");
        
        // Determine beneficiary
        address beneficiary = FlashAccounting.getActiveUser();
        if (beneficiary == address(0)) beneficiary = user;

        // Flash accounting: record user owes tokens
        FlashAccounting.addDelta(beneficiary, asset0, -int256(amount0));
        FlashAccounting.addDelta(beneficiary, asset1, -int256(amount1));

        // Update inventory
        _updateInventory(poolID, int128(uint128(amount0)), int128(uint128(amount1)));

        // Mint shares and update total
        _mint(beneficiary, poolID, liquidity);
        _storage.totalLiquidity[poolID] += liquidity;

        // Settle if not in session
        if (!FlashAccounting.isSessionActive(beneficiary)) {
            address[] memory tokens = new address[](2);
            tokens[0] = asset0;
            tokens[1] = asset1;
            PoolManagerLib.settleUserTokens(beneficiary, tokens, msgValue);
        }

        return liquidity;
    }

    /// @notice Execute liquidity removal (called by LiquidityManager)  
    function executeLiquidityRemove(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        address user
    ) external override returns (uint256, uint256) {
        require(msg.sender == liquidityManager, "Only LiquidityManager");
        
        address beneficiary = FlashAccounting.getActiveUser();
        if (beneficiary == address(0)) beneficiary = user;

        // Burn shares and update total
        _burn(beneficiary, poolID, liquidity);
        _storage.totalLiquidity[poolID] -= liquidity;
        
        // Update inventory
        _updateInventory(poolID, -int128(uint128(amount0)), -int128(uint128(amount1)));

        // Flash accounting: record user is owed tokens
        FlashAccounting.addDelta(beneficiary, asset0, int256(amount0));
        FlashAccounting.addDelta(beneficiary, asset1, int256(amount1));

        // Settle if not in session
        if (!FlashAccounting.isSessionActive(beneficiary)) {
            address[] memory tokens = new address[](2);
            tokens[0] = asset0;
            tokens[1] = asset1;
            PoolManagerLib.settleUserTokens(beneficiary, tokens, 0);
        }

        return (amount0, amount1);
    }

    /// @notice Internal swap execution - OPTIMIZED FOR FREQUENT USE
    function _executeSwap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut,
        bytes4 traderProtection,
        bytes memory permitData
    ) internal returns (uint256 amountOut) {
        address beneficiary = FlashAccounting.getActiveUser();
        if (beneficiary == address(0)) beneficiary = msg.sender;

        // Validate requirements (optimized checks)
        if ((uint32(traderProtection) & 0x00000100) != 0) {
            if (!AtomicExecutionLib.validateAtomicExecution(
                uint32(traderProtection), 
                FlashAccounting.isSessionActive(beneficiary), 
                _storage.atomicData
            )) {
                revert PoolManager__AtomicExecutionRequired();
            }
        }

        if ((markings & 0x000002) != 0) {
            if (!AccessControlLib.validateUniversalAccess(
                markings, uint32(traderProtection), _storage.accessData, beneficiary, permitData, 0
            )) {
                revert PoolManager__AccessDenied();
            }
        }

        // Calculate poolID and validate governance
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        if ((uint24(markings) & uint24(SimpleGovernanceLib.PROTOCOL_POOL_FLAG)) != 0) {
            uint256 packed = _storage.simpleGovernance.globalPackedState;
            if (uint8(packed) != 0) revert PoolManager__OperationPaused();
            if (uint32((packed >> 8) & 0xFFFFFF) != 0) {
                if (_storage.simpleGovernance.poolStates[poolID] != 0) revert PoolManager__OperationPaused();
            }
        }

        // Get inventory and calculate output
        (uint128 poolAsset0, uint128 poolAsset1) = this.getInventory(poolID);
        
        SwapParams memory swapParams = SwapParams({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: new uint256[](1),
            zeroForOne: zeroForOne,
            marking: new bytes3[](1),
            traderProtection: traderProtection
        });
        swapParams.amount[0] = amountIn;
        swapParams.marking[0] = markings;
        
        (uint256 quote, ) = getQuote(swapParams, poolAsset0, poolAsset1);
        if (quote == 0) revert PoolManager__InvalidQuote();
        amountOut = quote;
        
        PoolManagerLib.validateSwapInventory(poolAsset0, poolAsset1, amountOut, zeroForOne);
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);
        
        // Update inventory in canonical order
        bool canonicalOrder = asset0 < asset1;
        bool canonicalZeroForOne = canonicalOrder ? zeroForOne : !zeroForOne;
        _updateInventory(
            poolID,
            canonicalZeroForOne ? int128(uint128(amountIn)) : -int128(uint128(amountOut)),
            canonicalZeroForOne ? -int128(uint128(amountOut)) : int128(uint128(amountIn))
        );
        
        // Flash accounting
        address inAsset = zeroForOne ? asset0 : asset1;
        address outAsset = zeroForOne ? asset1 : asset0;
        FlashAccounting.addDelta(beneficiary, inAsset, -int256(amountIn));
        FlashAccounting.addDelta(beneficiary, outAsset, int256(amountOut));

        if (!FlashAccounting.isSessionActive(beneficiary)) {
            PoolManagerLib._settleUserDeltas(beneficiary, inAsset, outAsset, 0, 0, msg.value);
        }
    }

    /// @notice Configure protocol fee
    function configureProtocolFee(address treasury, uint16 feeBps) external {
        PoolManagerLib.configureProtocolFee(_storage, treasury, feeBps);
    }

    /// @notice Commit-reveal functions (kept minimal)
    function commitSwap(bytes32 commitment) external {
        CommitRevealLib.storeCommitment(_storage.commitData, commitment, msg.sender);
    }

    function executeCommittedSwap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut,
        uint64 nonce,
        bytes32 salt
    ) external payable nonReentrant returns (uint256 amountOut) {
        bytes32 commitment = CommitRevealLib.generateCommitment(
            asset0, asset1, quoter, markings, amountIn, zeroForOne, minAmountOut, nonce, msg.sender, salt
        );
        CommitRevealLib.validateAndConsumeCommitment(_storage.commitData, commitment, msg.sender, nonce);
        return _executeSwap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minAmountOut, 0x00000000, "");
    }

    function getCommitNonce(address trader) external view returns (uint64 nonce) {
        return CommitRevealLib.getCurrentNonce(_storage.commitData, trader);
    }

    /// @notice Governance functions (minimal)
    function setGovernance(address protocol, address emergency) external {
        require(_storage.simpleGovernance.protocolMultisig == address(0), "Already set");
        require(protocol != address(0) && emergency != address(0), "Invalid addresses");
        _storage.simpleGovernance.protocolMultisig = protocol;
        _storage.simpleGovernance.emergencyMultisig = emergency;
    }

    function emergencyPauseProtocolPools(uint8 newState) external {
        require(
            msg.sender == _storage.simpleGovernance.emergencyMultisig || 
            msg.sender == _storage.simpleGovernance.protocolMultisig, 
            "Only emergency"
        );
        SimpleGovernanceLib.setGlobalEmergencyState(_storage.simpleGovernance, newState);
    }

    function setDataBridge(uint8 overallSlot, address bridge) external {
        require(msg.sender == _storage.simpleGovernance.protocolMultisig, "Only protocol");
        require(overallSlot >= 4 && overallSlot <= 15, "Invalid slot");
        _setConfigurableDataBridge(overallSlot - 4, bridge);
    }
}
