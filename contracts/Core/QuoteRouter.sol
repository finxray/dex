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
    address immutable public defaultData1Bridge;
    address immutable public defaultData2Bridge;
    address immutable public defaultData3Bridge;

    // 12 configurable data bridges (slots 4..15 overall). These are storage-based and can be updated post-deploy.
    // Index mapping:
    // - Overall slots 0..3 map to immutables defaultData0..3
    // - Overall slots 4..15 map to configurableDataBridges[0..11]
    address[12] public configurableDataBridges;

    constructor(
        address _defaultData0Bridge,
        address _defaultData1Bridge,
        address _defaultData2Bridge,
        address _defaultData3Bridge
    ) {
        defaultData0Bridge = _defaultData0Bridge;
        defaultData1Bridge = _defaultData1Bridge;
        defaultData2Bridge = _defaultData2Bridge;
        defaultData3Bridge = _defaultData3Bridge;
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
            zeroForOne: p.zeroForOne
        });
        // Build payload from default bridges 0..3
        bytes memory d0 = m.data0 ? _getMarketDataNoCache(defaultData0Bridge, params) : bytes("");
        bytes memory d1 = m.data1 ? _getMarketDataNoCache(defaultData1Bridge, params) : bytes("");
        bytes memory d2 = m.data2 ? _getMarketDataNoCache(defaultData2Bridge, params) : bytes("");
        bytes memory d3raw = m.data3 ? _getMarketDataNoCache(defaultData3Bridge, params) : bytes("");
        // Optional extra configurable bridge (overall slots 4..15)
        bytes memory dx = bytes("");
        if (m.extraBridgeSlot >= 4) {
            uint8 slotIndex = m.extraBridgeSlot - 4;
            if (slotIndex < 12) {
                address extra = configurableDataBridges[slotIndex];
                dx = _getMarketDataNoCache(extra, params);
            }
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
            zeroForOne: p.zeroForOne
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
            zeroForOne: p.zeroForOne
        });
        bytes memory d0 = m.data0 ? _getMarketDataCached(defaultData0Bridge, baseParams) : bytes("");
        bytes memory d1 = m.data1 ? _getMarketDataCached(defaultData1Bridge, baseParams) : bytes("");
        bytes memory d2 = m.data2 ? _getMarketDataCached(defaultData2Bridge, baseParams) : bytes("");
        bytes memory d3raw = m.data3 ? _getMarketDataCached(defaultData3Bridge, baseParams) : bytes("");
        bytes memory dx = bytes("");
        {
            uint8 extra = MarkingHelper.decodeMarkings(p.marking[0]).extraBridgeSlot;
            if (extra >= 4) {
                uint8 slotIndex = extra - 4;
                if (slotIndex < 12) {
                    address extraAddr = configurableDataBridges[slotIndex];
                    dx = _getMarketDataCached(extraAddr, baseParams);
                }
            }
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
                zeroForOne: p.zeroForOne
            });
            bytes memory d0 = m.data0 ? _getMarketDataNoCache(defaultData0Bridge, qp) : bytes("");
            bytes memory d1 = m.data1 ? _getMarketDataNoCache(defaultData1Bridge, qp) : bytes("");
            bytes memory d2 = m.data2 ? _getMarketDataNoCache(defaultData2Bridge, qp) : bytes("");
            bytes memory d3raw = m.data3 ? _getMarketDataNoCache(defaultData3Bridge, qp) : bytes("");
            // Combine d3 payload with context: (bytes d3raw, bytes contextBytes)
            bytes memory d3 = abi.encode(d3raw, contextBytes);
            bytes memory routed = abi.encode(d0, d1, d2, d3);
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
        QuoteParams memory baseParams = QuoteParams({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: 0,
            asset0Balance: 0,
            asset1Balance: 0,
            bucketID: 0,
            zeroForOne: p.zeroForOne
        });
        Markings memory m0 = MarkingHelper.decodeMarkings(p.marking[0]);
        bytes memory d0 = m0.data0 ? _getMarketDataCached(defaultData0Bridge, baseParams) : bytes("");
        bytes memory d1 = m0.data1 ? _getMarketDataCached(defaultData1Bridge, baseParams) : bytes("");
        bytes memory d2 = m0.data2 ? _getMarketDataCached(defaultData2Bridge, baseParams) : bytes("");
        bytes memory d3raw = m0.data3 ? _getMarketDataCached(defaultData3Bridge, baseParams) : bytes("");
        // Combine d3 payload with context once for batch
        bytes memory d3 = abi.encode(d3raw, contextBytes);
        bytes memory routed = abi.encode(d0, d1, d2, d3);
        QuoteParamsBatch memory params = QuoteParamsBatch({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: p.amount,
            asset0Balances: asset0Balances,
            asset1Balances: asset1Balances,
            bucketID: bucketIDs,
            zeroForOne: p.zeroForOne
        });
        quote = IQuoter(p.quoter).quoteBatch(params, routed);
    }
}

