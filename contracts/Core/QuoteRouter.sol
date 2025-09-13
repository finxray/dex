// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MarkingHelper} from "./libraries/MarkingHelper.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {TransientStorage} from "./libraries/TransientStorage.sol";

import {IQuoter} from "./interfaces/internal/quoters/IQuoter.sol";
import {IDataBridge} from "./interfaces/internal/IDataBridge.sol";

import {SwapParams} from "./structs/SwapParams.sol";
import {Markings} from "./structs/Markings.sol"; 
import {QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";
import {TraderContext, QuoteParamsWithContext, QuoteParamsBatchWithContext} from "./structs/TraderContext.sol";
import {FlashAccounting} from "./libraries/FlashAccounting.sol";

abstract contract QuoteRouter {
    using TransientStorage for address;
    
    // Enhanced context flag in markings (bit 0)
    bytes3 constant ENHANCED_CONTEXT_FLAG = 0x000001;
    
    address immutable public defaultData0Bridge;

    // 12 configurable data bridges (slots 4..15 overall). These are storage-based and can be updated post-deploy.
    // Index mapping:
    // - Overall slots 0..3 map to immutables defaultData0..3 (future expansion)
    // - Overall slots 4..14 map to configurableDataBridges[0..10] 
    // - Overall slot 15 is special consolidated bridge slot (dx) - no caching, uses defaultData0Bridge
    address[12] public configurableDataBridges;

    constructor(
        address _defaultData0Bridge
    ) {
        defaultData0Bridge = _defaultData0Bridge;
    }

    // Internal setter to be called by inheritors (e.g., PoolManager) with proper access control
    function _setConfigurableDataBridge(uint8 slotIndex, address bridge) internal {
        // slotIndex: 0..11 corresponding to overall slots 4..15
        require(slotIndex < 12, "Invalid slot");
        configurableDataBridges[slotIndex] = bridge;
    }

    function _getMarketDataCached(address dataAddress, QuoteParams memory params) internal returns (bytes memory data) {
        if (dataAddress == address(0)) {
            return bytes("");
        }
        // Skip non-contract addresses entirely
        if (dataAddress.code.length == 0) {
            return bytes("");
        }
        // Transient cache: check first
        data = dataAddress.loadTransient();
        bool hit = data.length > 0;
        if (!hit) {
            // Fetch and cache
            try IDataBridge(dataAddress).getData(params) returns (bytes memory fetched) {
                data = fetched;
                if (data.length > 0) {
                    dataAddress.storeTransient(data);
                }
            } catch {
                data = bytes("");
            }
        }
        return data;
    }

    function _getMarketDataNoCache(address dataAddress, QuoteParams memory params) internal returns (bytes memory data) {
        if (dataAddress == address(0)) return bytes("");
        if (dataAddress.code.length == 0) return bytes("");
        try IDataBridge(dataAddress).getData(params) returns (bytes memory fetched) {
            return fetched;
        } catch {
            return bytes("");
        }
    }

   

    // Made public to allow library calls via PoolManager address
    function getQuote(SwapParams memory p, uint128 asset0Balance, uint128 asset1Balance) public returns (uint256 quote, uint256 poolID) {
        poolID = PoolIDAssembly.assemblePoolID(p.asset0, p.asset1, p.quoter, p.marking[0]);
        Markings memory m = MarkingHelper.decodeMarkings(p.marking[0]);

        QuoteParams memory params = QuoteParams({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: p.amount[0],
            asset0Balance: asset0Balance,
            asset1Balance: asset1Balance,
            bucketID: m.bucketID,
            zeroForOne: p.zeroForOne,
            functionFlags: _inferFunctionFlags(m)
        });
        // Efficiently build payload from enabled bridges only
        // Decode bridge flags: extraBridgeSlot can be:
        // - 0: no extra bridges
        // - 1-14: single configurable bridge at that slot (slots 4-14)
        // - 15: special consolidated bridge slot (dx) - uses defaultData0Bridge, no caching
        
        bytes memory d0 = bytes(""); // Reserved for future use (slots 0-3)
        bytes memory d1 = bytes("");
        bytes memory d2 = bytes("");
        bytes memory d3raw = bytes("");
        
        // Handle configurable bridges and special slot 16
        bytes memory dx;
        if (m.extraBridgeSlot == 0) {
            // No extra bridges
            dx = bytes("");
        } else if (m.extraBridgeSlot <= 14) {
            // Single configurable bridge at specified slot (4-14)
            uint8 slotIndex = m.extraBridgeSlot - 4;
            if (m.extraBridgeSlot >= 4 && slotIndex < 11) {
                address bridge = configurableDataBridges[slotIndex];
                dx = (bridge != address(0)) ? _getMarketDataNoCache(bridge, params) : bytes("");
            } else {
                dx = bytes("");
            }
        } else if (m.extraBridgeSlot == 15) {
            // Special slot 15: consolidated bridge (dx) - no caching, uses defaultData0Bridge
            dx = _getMarketDataNoCache(defaultData0Bridge, params);
        } else {
            // Reserved for future expansion
            dx = bytes("");
        }
        // Always include a context slot in d3 as (bytes d3raw, bytes contextBytes)
        bytes memory contextBytes;
        if ((p.marking[0] & ENHANCED_CONTEXT_FLAG) != 0) {
            TraderContext memory context = TraderContext({
                trader: msg.sender,
                txOrigin: tx.origin,
                blockNumber: block.number,
                timestamp: block.timestamp,
                gasPrice: tx.gasprice,
                gasLeft: gasleft(),
                sessionActive: FlashAccounting.isSessionActive(msg.sender)
            });
            contextBytes = abi.encode(context);
        } else {
            contextBytes = bytes("");
        }
        bytes memory d3 = abi.encode(d3raw, contextBytes);
        // Extend routed payload to include dx as fifth element for future-proofing
        bytes memory routed = abi.encode(d0, d1, d2, d3, dx);
        quote = IQuoter(params.quoter).quote(params, routed);
    }

    function getQuoteBatch(SwapParams memory p, uint128[] memory asset0Balances, uint128[] memory asset1Balances) public returns (uint256[] memory quote, uint256[] memory poolID) {
        poolID = new uint256[](p.marking.length);
        quote = new uint256[](p.marking.length);
        uint16[] memory bucketIDs = new uint16[](p.marking.length);
        Markings memory m = MarkingHelper.decodeMarkings(p.marking[0]);
        for (uint i = 0; i < p.marking.length; ) {
            bytes3 mark = p.marking[i];
            poolID[i] = PoolIDAssembly.assemblePoolID(p.asset0, p.asset1, p.quoter, mark);
            bucketIDs[i] = MarkingHelper.decodeMarkings(mark).bucketID;
            unchecked { ++i; }
        }
        QuoteParamsBatch memory params = QuoteParamsBatch({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: p.amount,
            asset0Balances: asset0Balances,
            asset1Balances: asset1Balances,
            bucketID: bucketIDs,
            zeroForOne: p.zeroForOne,
            functionFlags: _inferFunctionFlags(m)
        });
        // For batch, fetch once per marking set; cached fetches to enable hits across hops
        QuoteParams memory baseParams = QuoteParams({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: 0,
            asset0Balance: 0,
            asset1Balance: 0,
            bucketID: 0,
            zeroForOne: p.zeroForOne,
            functionFlags: 0
        });
        // Efficiently build payload with caching for batch operations
        // For StoixDataBridge architecture: put consolidated bridge data in dx, not d0
        bytes memory d0 = bytes("");
        bytes memory d1 = bytes("");
        bytes memory d2 = bytes("");
        bytes memory d3raw = bytes("");
        
        // Handle configurable bridges and special slot 16 with caching
        bytes memory dx;
        if (m.extraBridgeSlot == 0) {
            // No extra bridges
            dx = bytes("");
        } else if (m.extraBridgeSlot <= 14) {
            // Single configurable bridge at specified slot (4-14)
            uint8 slotIndex = m.extraBridgeSlot - 4;
            if (m.extraBridgeSlot >= 4 && slotIndex < 11) {
                address bridge = configurableDataBridges[slotIndex];
                dx = (bridge != address(0)) ? _getMarketDataCached(bridge, baseParams) : bytes("");
            } else {
                dx = bytes("");
            }
        } else if (m.extraBridgeSlot == 15) {
            // Special slot 15: consolidated bridge (dx) - no caching, uses defaultData0Bridge
            dx = _getMarketDataNoCache(defaultData0Bridge, baseParams);
        } else {
            // Reserved for future expansion
            dx = bytes("");
        }
        // Always include a context slot in d3 as (bytes d3raw, bytes contextBytes)
        bool needsContext = false;
        for (uint i = 0; i < p.marking.length; ) {
            if ((p.marking[i] & ENHANCED_CONTEXT_FLAG) != 0) { needsContext = true; break; }
            unchecked { ++i; }
        }
        bytes memory contextBytes;
        if (needsContext) {
            TraderContext memory context = TraderContext({
                trader: msg.sender,
                txOrigin: tx.origin,
                blockNumber: block.number,
                timestamp: block.timestamp,
                gasPrice: tx.gasprice,
                gasLeft: gasleft(),
                sessionActive: FlashAccounting.isSessionActive(msg.sender)
            });
            contextBytes = abi.encode(context);
        } else {
            contextBytes = bytes("");
        }
        bytes memory d3 = abi.encode(d3raw, contextBytes);
        bytes memory routed = abi.encode(d0, d1, d2, d3, dx);
        quote = IQuoter(p.quoter).quoteBatch(params, routed);

    }

    // Helper to check if bytes is (bytes,bytes)
    function _decodeTwoBytes(bytes memory data) external pure returns (bytes memory a, bytes memory b) {
        (a, b) = abi.decode(data, (bytes, bytes));
    }

    /*//////////////////////////////////////////////////////////////
                        ENHANCED CONTEXT QUOTES
    //////////////////////////////////////////////////////////////*/

    // Removed explicit WithContext path in favor of embedding context into routed bytes for standard IQuoter

    // Removed explicit BatchWithContext; we'll embed context into routed bytes in auto path

    /*//////////////////////////////////////////////////////////////
                        CONTEXT ROUTING LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Smart routing that chooses standard vs enhanced context based on markings
    /// @dev Automatically detects if enhanced context is needed and routes accordingly
    function getQuoteAuto(
        SwapParams memory p, 
        uint128 asset0Balance, 
        uint128 asset1Balance,
        address trader
    ) public returns (uint256 quote, uint256 poolID) {
        // Check if enhanced context is required; if so, embed it in d3 and use standard IQuoter
        if ((p.marking[0] & ENHANCED_CONTEXT_FLAG) != 0) {
            poolID = PoolIDAssembly.assemblePoolID(p.asset0, p.asset1, p.quoter, p.marking[0]);
            Markings memory m = MarkingHelper.decodeMarkings(p.marking[0]);

            // Build trader context bytes (encode struct as bytes)
            TraderContext memory context = TraderContext({
                trader: trader,
                txOrigin: tx.origin,
                blockNumber: block.number,
                timestamp: block.timestamp,
                gasPrice: tx.gasprice,
                gasLeft: gasleft(),
                sessionActive: FlashAccounting.isSessionActive(trader)
            });
            bytes memory contextBytes = abi.encode(context);

            // Build payload from up to 4 default bridges, uncached for single swap
            QuoteParams memory qp = QuoteParams({
                asset0: p.asset0,
                asset1: p.asset1,
                quoter: p.quoter,
                amount: p.amount[0],
                asset0Balance: asset0Balance,
                asset1Balance: asset1Balance,
                bucketID: m.bucketID,
                zeroForOne: p.zeroForOne,
                functionFlags: _inferFunctionFlags(m)
            });
            // For StoixDataBridge architecture with context: put bridge data in dx (5th position)
            bytes memory d0 = bytes("");
            bytes memory d1 = bytes("");
            bytes memory d2 = bytes("");
            bytes memory d3raw = bytes("");
            bytes memory dx = m.data0 ? _getMarketDataNoCache(defaultData0Bridge, qp) : bytes("");
            // Combine d3 payload with context: (bytes d3raw, bytes contextBytes)
            bytes memory d3 = abi.encode(d3raw, contextBytes);
            bytes memory routed = abi.encode(d0, d1, d2, d3, dx);
            quote = IQuoter(qp.quoter).quote(qp, routed);
            return (quote, poolID);
        }
        return getQuote(p, asset0Balance, asset1Balance);
    }

    /// @notice Smart batch routing that chooses standard vs enhanced context based on markings
    /// @dev Automatically detects if enhanced context is needed and routes accordingly
    function getQuoteBatchAuto(
        SwapParams memory p, 
        uint128[] memory asset0Balances, 
        uint128[] memory asset1Balances,
        address trader
    ) public returns (uint256[] memory quote, uint256[] memory poolID) {
        // Check if any marking requires enhanced context
        bool needsContext = false;
        for (uint i = 0; i < p.marking.length; ) {
            if ((p.marking[i] & ENHANCED_CONTEXT_FLAG) != 0) {
                needsContext = true;
                break;
            }
            unchecked { ++i; }
        }
        if (!needsContext) {
            return getQuoteBatch(p, asset0Balances, asset1Balances);
        }
        poolID = new uint256[](p.marking.length);
        uint16[] memory bucketIDs = new uint16[](p.marking.length);
        for (uint i = 0; i < p.marking.length; ) {
            bytes3 mark = p.marking[i];
            poolID[i] = PoolIDAssembly.assemblePoolID(p.asset0, p.asset1, p.quoter, mark);
            bucketIDs[i] = MarkingHelper.decodeMarkings(mark).bucketID;
            unchecked { ++i; }
        }
        // Build trader context bytes
        TraderContext memory context = TraderContext({
            trader: trader,
            txOrigin: tx.origin,
            blockNumber: block.number,
            timestamp: block.timestamp,
            gasPrice: tx.gasprice,
            gasLeft: gasleft(),
            sessionActive: FlashAccounting.isSessionActive(trader)
        });
        bytes memory contextBytes = abi.encode(context);
        // For batch, fetch once per marking set; cached fetches to enable hits across hops
        Markings memory m0 = MarkingHelper.decodeMarkings(p.marking[0]);
        QuoteParams memory baseParams = QuoteParams({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: 0,
            asset0Balance: 0,
            asset1Balance: 0,
            bucketID: 0,
            zeroForOne: p.zeroForOne,
            functionFlags: _inferFunctionFlags(m0)
        });
        // For StoixDataBridge architecture with context batch: put bridge data in dx (5th position)
        bytes memory d0 = bytes("");
        bytes memory d1 = bytes("");
        bytes memory d2 = bytes("");
        bytes memory d3raw = bytes("");
        bytes memory dx = m0.data0 ? _getMarketDataCached(defaultData0Bridge, baseParams) : bytes("");
        // Combine d3 payload with context once for batch
        bytes memory d3 = abi.encode(d3raw, contextBytes);
        bytes memory routed = abi.encode(d0, d1, d2, d3, dx);
        QuoteParamsBatch memory params = QuoteParamsBatch({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: p.amount,
            asset0Balances: asset0Balances,
            asset1Balances: asset1Balances,
            bucketID: bucketIDs,
            zeroForOne: p.zeroForOne,
            functionFlags: 0
        });
        quote = IQuoter(p.quoter).quoteBatch(params, routed);
    }

    // Map markings to StoixBridge function flags. Use slot 15 for consolidated bridge.
    function _inferFunctionFlags(Markings memory m) internal pure returns (uint8) {
        // If slot 15 used (consolidated StoixBridge), use bucketID lower 8 bits as function flags.
        // Default to 0x0F (v2|v3|twap|cl) when override is zero.
        if (m.extraBridgeSlot != 15) return 0;
        uint8 overrideFlags = uint8(m.bucketID & 0xFF);
        return overrideFlags == 0 ? 0x0F : overrideFlags;
    }
}

