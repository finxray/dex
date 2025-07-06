// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {MarkingHelper} from "./libraries/MarkingHelper.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {TransientStorage} from "./libraries/TransientStorage.sol";

import {IQuoterNoData} from "./interfaces/internal/quoters/IQuoterNoData.sol";
import {IQuoterSingleData} from "./interfaces/internal/quoters/IQuoterSingleData.sol";
import {IQuoterDualData} from "./interfaces/internal/quoters/IQuoterDualData.sol";
import {IDataBridge} from "./interfaces/internal/IDataBridge.sol";

import {SwapParams} from "./structs/SwapParams.sol";
import {Marking} from "./structs/Marking.sol"; 
import {Inventory, QuoteParamsBase, QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";



abstract contract QuoteRequester {
    using TransientStorage for address;
    // Temproraly constructotr and immutable variable. Later will be replaced by a function with ownership access or can 
    // be left as it but in that case MarketQuoter will be executed via a proxy contract
    address immutable public defaultAlpha;
    address immutable public defaultBeta;
    // store up to 16 market addresses as alternative to default market data
    mapping (uint8 => address) alphaAddressStorage;
    mapping (uint8 => address) betaAddressStorage;

    constructor(address _defaultAlpha, address _defaultBeta) {
        defaultAlpha = _defaultAlpha;
        defaultBeta = _defaultBeta;
    }

    function inventory(uint256 poolID) public virtual view returns (Inventory memory);

    // function inventories(uint256 poolID) public virtual view returns (Inventory memory);
    function getMarketData(address addr, QuoteParamsBase memory base) internal  returns (bytes memory data) {
        data = addr.loadTransient();
        if (data.length == 0) {
            data = IDataBridge(addr).getData(base);
            addr.storeTransient(data);
        } 
        return data;
    }

    function getQuote(SwapParams calldata p) internal returns (uint256 quote, uint256 poolID) {
        poolID = PoolIDCreator.createPoolID(p.asset0, p.asset1, p.quoter, p.marking[0]);
        Marking memory m = MarkingHelper.decodeMarkings(p.marking[0]);
        QuoteParamsBase memory baseParams = QuoteParamsBase({
            asset0: p.asset0,
            asset1: p.asset1, 
            zeroForOne: p.zeroForOne
        }); 

        QuoteParams memory params = QuoteParams({
            base: baseParams,
            quoter: p.quoter,
            amount: p.amount[0],
            inventory: inventory(poolID), 
            bucketID: m.bucketID
        });

        address alpha = (m.isAlphaDefault) ? defaultAlpha : alphaAddressStorage[m.alphaAddressPointer];
        address beta = (m.isBetaDefault) ? defaultBeta : betaAddressStorage[m.betaAddressPointer];
        if (m.isAlpha && m.isBeta) {
            // Both `m.isAlpha` and `m.isBeta` are true: Placeholder for combined logic
            quote = IQuoterDualData(params.quoter).quote(params, getMarketData(alpha, baseParams), getMarketData(beta, baseParams));
        } else if (!m.isAlpha && !m.isBeta) {
            // Both `m.isAlpha` and `m.isBeta` are false: Call IQuoter
            quote = IQuoterNoData(params.quoter).quote(params);
        } else if (m.isAlpha && !m.isBeta) {
            // `m.isAlpha` is true, `m.isBeta` is false: Call IQuoterDex
            quote = IQuoterSingleData(params.quoter).quote(params, getMarketData(alpha, baseParams));
        } else if (!m.isAlpha && m.isBeta) {
            // `m.isAlpha` is false, `m.isBeta` is true: Call IQuoterOracle
            quote = IQuoterSingleData(params.quoter).quote(params, getMarketData(beta, baseParams));
        } 
    } 
 

    function getQuoteBatch(SwapParams calldata p) internal returns (uint256[] memory quote, uint256[] memory poolID) {
        Inventory[] memory inventories = new Inventory[](poolID.length);
        uint16[] memory bucketIDs = new uint16[](poolID.length);
        Marking memory m = MarkingHelper.decodeMarkings(p.marking[0]);
            for (uint i = 0; i < p.marking.length ;i++) {
            poolID[i] = PoolIDCreator.createPoolID(p.asset0, p.asset1, p.quoter, p.marking[i]);
            inventories[i]= inventory(poolID[i]);
            bucketIDs[i]= MarkingHelper.decodeMarkings(p.marking[i]).bucketID;
        }

        QuoteParamsBase memory baseParams = QuoteParamsBase({
            asset0: p.asset0,
            asset1: p.asset1, 
            zeroForOne: p.zeroForOne
        }); 

        QuoteParamsBatch memory params = QuoteParamsBatch({        
            base: baseParams,
            quoter: p.quoter,
            amount: p.amount,
            inventory: inventories,
            bucketID: bucketIDs
        });  

        address alpha = (m.isAlphaDefault) ? defaultAlpha : alphaAddressStorage[m.alphaAddressPointer];
        address beta = (m.isBetaDefault) ? defaultBeta : betaAddressStorage[m.betaAddressPointer];
        // Routing logic based on marking
        if (m.isAlpha && m.isBeta) {
            // Both `m.isAlpha` and `m.isBeta` are true: Placeholder for combined logic
            quote = IQuoterDualData(params.quoter).quoteBatch(params, getMarketData(alpha, baseParams), getMarketData(beta, baseParams));
        } else if (!m.isAlpha && !m.isBeta) {
            // Both `m.isAlpha` and `m.isBeta` are false: Call IQuoter
            quote = IQuoterNoData(params.quoter).quoteBatch(params);
        } else if (m.isAlpha && !m.isBeta) {
            // `m.isAlpha` is true, `m.isBeta` is false: Call IQuoterDex
            quote = IQuoterSingleData(params.quoter).quoteBatch(params, getMarketData(alpha, baseParams));
        } else if (!m.isAlpha && m.isBeta) {
            // `m.isAlpha` is false, `m.isBeta` is true: Call IQuoterOracle
            quote = IQuoterSingleData(params.quoter).quoteBatch(params, getMarketData(beta, baseParams));
        } 
    } 
} 



