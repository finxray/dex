// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;


import {MarkingHelper} from "./libraries/MarkingHelper.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {MarketDataLib} from "./libraries/MarketDataLib.sol";
import {TransientStorage} from "./libraries/TransientStorage.sol";

import {IQuoterNoData} from "./interfaces/internal/quoters/IQuoterNoData.sol";
import {IQuoterSingleData} from "./interfaces/internal/quoters/IQuoterSingleData.sol";
import {IQuoterBothData} from "./interfaces/internal/quoters/IQuoterBothData.sol";
import {IMarketQuoter} from "./interfaces/internal/IMarketQuoter.sol";

import {SwapParams} from "./structs/SwapParams.sol";
import {Marking} from "./structs/Marking.sol"; 
import {Inventory, QuoteParamsBase, QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";



abstract contract QuoteRequester {
    using TransientStorage for address;
    // Temproraly constructotr and immutable variable. Later will be replaced by a function with ownership access or can 
    // be left as it but in that case MarketQuoter will be executed via a proxy contract
    address immutable public defaultDexMarketAddress;
    address immutable public defaultOracleMarketAddress;
    // store up to 16 market addresses as alternative to default market data
    mapping (uint8 => address) dexMarketAddress;
    mapping (uint8 => address) oracleMarketAddress;

    constructor(address _defaultDexMarketAddress, address _defaultOracleMarketAddress) {
        defaultDexMarketAddress = _defaultDexMarketAddress;
        defaultOracleMarketAddress = _defaultOracleMarketAddress;
    }

    // function inventories(bytes32 poolID) public virtual view returns (Inventory memory);
    function getMarketData(address addr, QuoteParamsBase memory base) public view returns (bytes memory data) {
        data = addr.loadTransient();
        if (data.length == 0) {
            data = IMarketQuoter(addr).getData(base);
            addr.storeTransient(data);
        } 
        return data;
    }

    
    function inventory(bytes32 poolID) public virtual view returns (Inventory memory);

    function quote(SwapParams calldata p) internal returns (uint256 result) {
         bytes32 poolID = PoolIDCreator.createPoolID(p.asset0, p.asset1, p.quoter, p.markings[0]);
        Marking memory m = MarkingHelper.decodeMarkings(p.markings[0]);
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

        address dexAddress = (m.isDexDefault) ? defaultDexMarketAddress : dexMarketAddress[m.dexStorageAddress];
        address oracleAddress = (m.isOracleDefault) ? defaultOracleMarketAddress : oracleMarketAddress[m.oracleStorageAddress];
        if (m.isDexMarket && m.isOracleMarket) {

            // Both `m.isDexMarket` and `m.isOracleMarket` are true: Placeholder for combined logic
            result = IQuoterDexOracle(params.quoter).quote(params, getMarketData(dexAddress), getMarketData(oracleAddress));
        } else if (!m.isDexMarket && !m.isOracleMarket) {
            // Both `m.isDexMarket` and `m.isOracleMarket` are false: Call IQuoter
            result = IQuoter(params.quoter).quote(params);
        } else if (m.isDexMarket && !m.isOracleMarket) {
            // `m.isDexMarket` is true, `m.isOracleMarket` is false: Call IQuoterDex
            result = IQuoterDex(params.quoter).quote(params, getMarketData(dexAddress));
        } else if (!m.isDexMarket && m.isOracleMarket) {
            // `m.isDexMarket` is false, `m.isOracleMarket` is true: Call IQuoterOracle
            result = IQuoterOracle(params.quoter).quote(params, getMarketData(oracleAddress));
        } 
    } 
 

    function quoteBatch(SwapParams calldata p) internal returns (uint256[] memory result) {
            bytes32[] memory poolIDs = new bytes32[](p.markings.length);
            Inventory[] memory inventories = new Inventory[](poolIDs.length);
            uint16[] memory bucketIDs;
            Marking memory m = MarkingHelper.decodeMarkings(p.markings[0]);
             for (uint i = 0; i < p.markings.length ;i++) {
                poolIDs[i] = PoolIDCreator.createPoolID(p.asset0, p.asset1, p.quoter, p.markings[i]);
                inventories[i]= inventory(poolIDs[i]);
                bucketIDs[i]= MarkingHelper.decodeMarkings(p.markings[i]).bucketID;
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

        address dexAddress = (m.isDexDefault) ? defaultDexMarketAddress : dexMarketAddress[m.dexStorageAddress];
        address oracleAddress = (m.isOracleDefault) ? defaultOracleMarketAddress : oracleMarketAddress[m.oracleStorageAddress];
        // Routing logic based on markings
        if (m.isDexMarket && m.isOracleMarket) {
            // Both `m.isDexMarket` and `m.isOracleMarket` are true: Placeholder for combined logic
            result = IQuoterDexOracle(params.quoter).quoteBatch(params, getStoredDexData(dexAddress), getStoredOracleData(oracleAddress));
        } else if (!m.isDexMarket && !m.isOracleMarket) {
            // Both `m.isDexMarket` and `m.isOracleMarket` are false: Call IQuoter
            result = IQuoter(params.quoter).quoteBatch(params);
        } else if (m.isDexMarket && !m.isOracleMarket) {
            // `m.isDexMarket` is true, `m.isOracleMarket` is false: Call IQuoterDex
            result = IQuoterDex(params.quoter).quoteBatch(params, getStoredDexData(dexAddress));
        } else if (!m.isDexMarket && m.isOracleMarket) {
            // `m.isDexMarket` is false, `m.isOracleMarket` is true: Call IQuoterOracle
            result = IQuoterOracle(params.quoter).quoteBatch(params, getStoredOracleData(oracleAddress));
        } 
    } 
} 



