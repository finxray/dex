// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
// ssssssss
// Custom errors for gas-efficient reverts
error PoolManager__InsufficientWithdrawal(uint256 amount0, uint256 amount1);
error PoolManager__InsufficientOutput(uint256 minOut, uint256 actual);
error PoolManager__InvalidQuote();
error PoolManager__Reentrancy();
error PoolManager__InvalidInitialAmounts();
error PoolManager__InvalidLiquidityAmount();
error PoolManager__NoLiquidity();

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

// Using library for clean storage access
using PoolManagerLib for PoolManagerLib.PoolManagerStorage;

contract PoolManager is ERC6909Claims, QuoteRouter, ReentrancyGuard {
    constructor(
        address _defaultData0Bridge,
        address _defaultData1Bridge,
        address _defaultData2Bridge,
        address _defaultData3Bridge
    ) QuoteRouter(_defaultData0Bridge, _defaultData1Bridge, _defaultData2Bridge, _defaultData3Bridge) {}

    // Library storage for total liquidity tracking
    PoolManagerLib.PoolManagerStorage private _storage;

    
    // PoolID: 42955307580170980946467815337668002166680498660974576864971747189779899351040
    /// @notice Creates a new pool using library logic
    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external nonReentrant returns (uint256 poolID) {
        return PoolManagerLib.createPool(_storage, asset0, asset1, quoter, markings);
    }
    
    /// @notice Get pool information by poolID
    /// @param poolID Pool identifier
    /// @return asset0 First asset address (canonical order)
    /// @return asset1 Second asset address (canonical order)
    /// @return quoter Quoter contract address
    /// @return markings Pool configuration markings
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
    function totalLiquidity(uint256 poolID) external view returns (uint256) {
        return _storage.totalLiquidity[poolID];
    }

    /*//////////////////////////////////////////////////////////////
                            POOL INVENTORY MANAGEMENT
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get current pool inventory - PUBLIC INTERFACE
    function getInventory(uint256 poolId) external view returns (uint128 asset0, uint128 asset1) {
        return _getInventory(poolId);
    }

    // Internal helpers to avoid Remix parser issues with using-for dot calls
    function _getInventory(uint256 poolId) internal view returns (uint128 asset0, uint128 asset1) {
        uint256 packed = _storage.poolInventories[poolId];
        asset0 = uint128(packed);
        asset1 = uint128(packed >> 128);
    }

    function _updateInventory(
        uint256 poolId,
        int128 asset0Delta,
        int128 asset1Delta
    ) internal {
        uint256 packed = _storage.poolInventories[poolId];
        uint128 a0 = uint128(packed);
        uint128 a1 = uint128(packed >> 128);
        a0 = uint128(int128(a0) + asset0Delta);
        a1 = uint128(int128(a1) + asset1Delta);
        uint256 newPacked = uint256(a0) | (uint256(a1) << 128);
        if (newPacked != packed) {
            _storage.poolInventories[poolId] = newPacked;
        }
    }

    // Execution cost: 147,458..
    // Transactin cost:  170, 158
    /// @notice Add liquidity to a pool - SIMPLIFIED IMPLEMENTATION
    function addLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amount0,
        uint256 amount1
    ) external payable nonReentrant returns (uint256 liquidity) {
        // Calculate poolID (canonicalizes asset order internally)
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Canonicalize amounts to match asset ordering used in poolID
        (address a0, address a1) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        (uint256 amt0, uint256 amt1) = asset0 < asset1 ? (amount0, amount1) : (amount1, amount0);
        
        // Get current pool balances (canonical order)
        (uint128 poolAsset0, uint128 poolAsset1) = _getInventory(poolID);
        
        // Determine rate: if first liquidity, derive from provided amounts; otherwise, use inventory ratio
        uint256 rate;
        if (_storage.totalLiquidity[poolID] == 0) {
            if (!(amt0 > 0 && amt1 > 0)) revert PoolManager__InvalidInitialAmounts();
            rate = (amt0 * 1e18) / amt1;
        } else {
            // Use inventory-implied rate to avoid quoter bias on profit calculation
            rate = PoolManagerLib.getInventoryRateAsset0Per1e18Asset1(poolAsset0, poolAsset1);
            if (rate == 0) {
                // Fallback to quoter if inventory is unbalanced
                SwapParams memory p = SwapParams({
                    asset0: a0,
                    asset1: a1,
                    quoter: quoter,
                    amount: new uint256[](1),
                    zeroForOne: false,
                    marking: new bytes3[](1),
                    traderProtection: 0x00000000
                });
                p.amount[0] = 1e18;
                p.marking[0] = markings;
                (uint256 quoteAmount, ) = getQuote(p, poolAsset0, poolAsset1);
                if (quoteAmount == 0) revert PoolManager__InvalidQuote();
                rate = quoteAmount;
            }
        }

        // Charge protocol fee on profit since last checkpoint (no-op if disabled or first liquidity)
        if (_storage.totalLiquidity[poolID] > 0) {
            PoolManagerLib.chargeProtocolProfitFee(_storage, poolID, rate);
            // Refresh balances after fee (if any)
            (poolAsset0, poolAsset1) = _getInventory(poolID);
        }
        
        liquidity = PoolManagerLib.calculateLiquidityToMint(
            _storage, amt0, amt1, poolAsset0, poolAsset1, poolID, rate
        );

        // Determine beneficiary (session-aware originator)
        address beneficiary = FlashAccounting.getActiveUser();
        if (beneficiary == address(0)) beneficiary = msg.sender;

        // Flash accounting: record user owes tokens; defer actual transfer to settlement
        FlashAccounting.addDelta(beneficiary, a0, -int256(amt0));
        FlashAccounting.addDelta(beneficiary, a1, -int256(amt1));

        // Update inventory with canonical amounts
        _updateInventory(poolID, int128(uint128(amt0)), int128(uint128(amt1)));

        // Mint shares and update total directly
        _mint(beneficiary, poolID, liquidity);
        _storage.totalLiquidity[poolID] += liquidity;

        // If not in a session, settle immediately
        if (!FlashAccounting.isSessionActive(beneficiary)) {
            address[] memory tokens = new address[](2);
            tokens[0] = a0;
            tokens[1] = a1;
            PoolManagerLib.settleUserTokens(beneficiary, tokens, msg.value);
        }

        // Update profit baseline after liquidity event to current pool value
        (poolAsset0, poolAsset1) = _getInventory(poolID);
        uint256 newBaseline = PoolManagerLib.getPoolValueInAsset0(poolAsset0, poolAsset1, rate);
        PoolManagerLib.updateProfitBaseline(_storage, poolID, newBaseline);
    }

    /// @notice Remove liquidity from a pool - OPTIMAL IMPLEMENTATION
    function removeLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 liquidity
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (liquidity == 0) revert PoolManager__InvalidLiquidityAmount();
        
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = _getInventory(poolID);
        if (!(_storage.totalLiquidity[poolID] > 0)) revert PoolManager__NoLiquidity();

        // Use inventory-implied rate for consistent profit measurement
        uint256 rate = PoolManagerLib.getInventoryRateAsset0Per1e18Asset1(poolAsset0, poolAsset1);

        // Charge protocol fee on profit since last checkpoint (no-op if disabled)
        PoolManagerLib.chargeProtocolProfitFee(_storage, poolID, rate);
        // Refresh balances after fee (if any)
        (poolAsset0, poolAsset1) = _getInventory(poolID);
        
        // Calculate proportional amounts - simple math, inline
        amount0 = (liquidity * poolAsset0) / _storage.totalLiquidity[poolID];
        amount1 = (liquidity * poolAsset1) / _storage.totalLiquidity[poolID];
        if (amount0 == 0 && amount1 == 0) revert PoolManager__InsufficientWithdrawal(amount0, amount1);
        
        // Determine beneficiary (session-aware originator)
        address beneficiary = FlashAccounting.getActiveUser();
        if (beneficiary == address(0)) beneficiary = msg.sender;

        // Burn shares and update total directly
        _burn(beneficiary, poolID, liquidity);
        _storage.totalLiquidity[poolID] -= liquidity;
        
        // Update inventory via helper
        _updateInventory(poolID, -int128(uint128(amount0)), -int128(uint128(amount1)));

        // Flash accounting: record user is owed tokens; defer actual transfer to settlement
        bool canonicalOrder = asset0 < asset1;
        (uint256 out0, uint256 out1) = canonicalOrder ? (amount0, amount1) : (amount1, amount0);
        address a0 = canonicalOrder ? asset0 : asset1;
        address a1 = canonicalOrder ? asset1 : asset0;
        FlashAccounting.addDelta(beneficiary, a0, int256(out0));
        FlashAccounting.addDelta(beneficiary, a1, int256(out1));

        // If not in a session, settle immediately
        if (!FlashAccounting.isSessionActive(beneficiary)) {
            address[] memory tokens = new address[](2);
            tokens[0] = a0;
            tokens[1] = a1;
            PoolManagerLib.settleUserTokens(beneficiary, tokens, 0);
        }

        // Update profit baseline after liquidity event to current pool value
        (poolAsset0, poolAsset1) = _getInventory(poolID);
        uint256 newBaseline = PoolManagerLib.getPoolValueInAsset0(poolAsset0, poolAsset1, rate);
        PoolManagerLib.updateProfitBaseline(_storage, poolID, newBaseline);
    }

    // Execution (without market) cost: 67,670 
    // Execution cost (DualQuoter): 96,785
    // Transaction cost: 77,821
    /// @notice Swap assets in a pool - lean implementation
    function swap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable nonReentrant returns (uint256 amountOut) {
        return _executeSwap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minAmountOut);
    }

    /// @notice Multi-hop batch swap within a single transaction. Outputs of each hop feed into the next.
    /// @dev Uses gas-optimized Hop structure with arrays for markings and amounts
    /// @param hops Array of hops, each containing arrays of markings and amounts
    /// @param amountIn Input amount for the first hop
    /// @param minAmountOut Minimum acceptable final output amount
    /// @return amountOut Final output amount after the last hop
    function batchSwap(
        Hop[] calldata hops,
        uint256 amountIn,
        uint256 minAmountOut
    ) external payable nonReentrant returns (uint256 amountOut) {
        // Determine effective recipient (session-aware originator)
        address recipient = FlashAccounting.getActiveUser();
        if (recipient == address(0)) recipient = msg.sender;

        amountOut = PoolManagerLib.executeBatchSwap(
            _storage,
            hops,
            amountIn,
            msg.value,
            recipient,
            address(this)
        );
        
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);
    }

    /// @notice Start a flash session to compose multiple operations with net settlement
    /// @param callback Address implementing IFlashCallback
    /// @param data Calldata forwarded to callback
    /// @param tokens List of tokens to settle at the end (scope what might be touched)
    function flashSession(address callback, bytes calldata data, address[] calldata tokens) external payable nonReentrantKey(keccak256("flashSession")) {
        // Mark session active and set active user context
        FlashAccounting.startSession(msg.sender);
        FlashAccounting.setActiveUser(msg.sender);

        // Execute user-provided logic
        IFlashCallback(callback).flashCallback(data);

        // Settle all touched tokens
        PoolManagerLib.settleUserTokens(msg.sender, tokens, msg.value);

        // End session and clear context
        FlashAccounting.clearActiveUser();
        FlashAccounting.endSession(msg.sender);
    }

    /// @notice Same as flashSession but returns per-token deltas for verification (should be zeros)
    function flashSessionWithReturn(address callback, bytes calldata data, address[] calldata tokens)
        external payable nonReentrantKey(keccak256("flashSession")) returns (int256[] memory deltas)
    {
        FlashAccounting.startSession(msg.sender);
        FlashAccounting.setActiveUser(msg.sender);
        IFlashCallback(callback).flashCallback(data);
        PoolManagerLib.settleUserTokens(msg.sender, tokens, msg.value);
        deltas = getUserDeltas(msg.sender, tokens);
        FlashAccounting.clearActiveUser();
        FlashAccounting.endSession(msg.sender);
    }

    /// @notice View helper to read current deltas for a user and tokens (transient storage)
    function getUserDeltas(address user, address[] calldata tokens) public view returns (int256[] memory deltas) {
        deltas = new int256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ) {
            deltas[i] = FlashAccounting.getDelta(user, tokens[i]);
            unchecked { ++i; }
        }
    }

    // Expose QuoterRouter's internal quote functions for library calls
    function routerGetQuote(
        SwapParams memory p,
        uint128 asset0Balance,
        uint128 asset1Balance
    ) public returns (uint256 quote, uint256 poolID) {
        return QuoteRouter.getQuote(p, asset0Balance, asset1Balance);
    }

    function routerGetQuoteBatch(
        SwapParams memory p,
        uint128[] memory asset0Balances,
        uint128[] memory asset1Balances
    ) public returns (uint256[] memory quote, uint256[] memory poolID) {
        return QuoteRouter.getQuoteBatch(p, asset0Balances, asset1Balances);
    }

    /// @notice Configure protocol fee on liquidity events (profit-based). Set treasury to 0 to disable.
    function configureProtocolFee(address treasury, uint16 feeBps) external {
        PoolManagerLib.configureProtocolFee(_storage, treasury, feeBps);
    }

    /*//////////////////////////////////////////////////////////////
                            COMMIT-REVEAL MEV PROTECTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Commit to a future swap (Phase 1 of commit-reveal)
    /// @param commitment Hash of swap parameters + nonce + salt
    function commitSwap(bytes32 commitment) external {
        CommitRevealLib.storeCommitment(_storage.commitData, commitment, msg.sender);
    }

    /// @notice Execute a previously committed swap (Phase 2 of commit-reveal)
    /// @param asset0 First asset address
    /// @param asset1 Second asset address
    /// @param quoter Quoter contract address
    /// @param markings Pool markings
    /// @param amountIn Input amount
    /// @param zeroForOne Swap direction
    /// @param minAmountOut Minimum output amount
    /// @param nonce Trader's nonce (must match expected)
    /// @param salt Random salt used in commitment
    /// @return amountOut Actual output amount
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
        // Validate commitment
        bytes32 commitment = CommitRevealLib.generateCommitment(
            asset0, asset1, quoter, markings,
            amountIn, zeroForOne, minAmountOut,
            nonce, msg.sender, salt
        );
        
        CommitRevealLib.validateAndConsumeCommitment(
            _storage.commitData, commitment, msg.sender, nonce
        );
        
        // Execute normal swap logic
        return _executeSwap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minAmountOut);
    }

    /// @notice Get current nonce for commit-reveal system
    /// @param trader Address to check
    /// @return nonce Current nonce
    function getCommitNonce(address trader) external view returns (uint64 nonce) {
        return CommitRevealLib.getCurrentNonce(_storage.commitData, trader);
    }

    /// @notice Internal swap execution logic (shared between normal and committed swaps)
    function _executeSwap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // Determine beneficiary (session-aware originator)
        address beneficiary = FlashAccounting.getActiveUser();
        if (beneficiary == address(0)) beneficiary = msg.sender;

        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);

        // Get inventory and calculate output using quoter system
        (uint128 poolAsset0, uint128 poolAsset1) = _getInventory(poolID);
        
        // Create swap params for quoter
        SwapParams memory swapParams = SwapParams({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: new uint256[](1),
            zeroForOne: zeroForOne,
            marking: new bytes3[](1),
            traderProtection: 0x00000000  // No additional protection for committed swaps
        });
        swapParams.amount[0] = amountIn;
        swapParams.marking[0] = markings;
        
        // Get quote and validate
        (uint256 quote, ) = getQuote(swapParams, poolAsset0, poolAsset1);
        if (quote == 0) revert PoolManager__InvalidQuote();
        amountOut = quote;
        
        // Validate minimums
        PoolManagerLib.validateSwapInventory(poolAsset0, poolAsset1, amountOut, zeroForOne);
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);
        
        // Update inventory in canonical asset order
        bool canonicalOrder = asset0 < asset1;
        bool canonicalZeroForOne = canonicalOrder ? zeroForOne : !zeroForOne;
        _updateInventory(
            poolID,
            canonicalZeroForOne ? int128(uint128(amountIn)) : -int128(uint128(amountOut)),
            canonicalZeroForOne ? -int128(uint128(amountOut)) : int128(uint128(amountIn))
        );
        
        // Flash accounting: record deltas for input and output; settle if not in session
        address inAsset = zeroForOne ? asset0 : asset1;
        address outAsset = zeroForOne ? asset1 : asset0;
        FlashAccounting.addDelta(beneficiary, inAsset, -int256(amountIn));
        FlashAccounting.addDelta(beneficiary, outAsset, int256(amountOut));

        if (!FlashAccounting.isSessionActive(beneficiary)) {
            PoolManagerLib._settleUserDeltas(beneficiary, inAsset, outAsset, 0, 0, msg.value);
        }
    }
}