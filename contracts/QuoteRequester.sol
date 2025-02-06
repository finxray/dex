// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {SwapParams} from "./structs/SwapParams.sol";
import {Marking} from "./structs/Marking.sol";
import {MarkingHelper} from "./libraries/MarkingHelper.sol";
import {IQuoter} from "./interfaces/internal/quoters/IQuoter.sol";
import {IQuoterOracle} from "./interfaces/internal/quoters/IQuoterOracle.sol";
import {IQuoterDexOracle} from "./interfaces/internal/quoters/IQuoterDexOracle.sol";
import {DexMarketData} from "./structs/DexMarketData.sol";
import {OracleMarketData} from "./structs/OracleMarketData.sol"; 
import {MarketDataLib} from "./libraries/MarketDataLib.sol";
import {Inventory, QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";
import {DexMarketData} from "./structs/DexMarketData.sol";
import {OracleMarketData} from "./structs/OracleMarketData.sol";
import {IQuoterDex} from "./interfaces/internal/quoters/IQuoterDex.sol";

abstract contract QuoteRequester {
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
    function getStoredDexData(address dexAddress) public virtual view returns (DexMarketData memory); 
    function getStoredOracleData(address oracleAddress) public virtual view returns (OracleMarketData memory);

    function quote(QuoteParams calldata params, Marking calldata m) external returns (uint256 result) {
        // Routing logic based on markings
        address dexAddress = (m.isDexDefault) ? defaultDexMarketAddress : dexMarketAddress[m.dexStorageAddress];
        address oracleAddress = (m.isOracleDefault) ? defaultOracleMarketAddress : oracleMarketAddress[m.oracleStorageAddress];
        if (m.isDexMarket && m.isOracleMarket) {

            // Both `m.isDexMarket` and `m.isOracleMarket` are true: Placeholder for combined logic
            result = IQuoterDexOracle(params.quoter).quote(params, getStoredDexData(dexAddress), getStoredOracleData(oracleAddress));
        } else if (!m.isDexMarket && !m.isOracleMarket) {
            // Both `m.isDexMarket` and `m.isOracleMarket` are false: Call IQuoter
            result = IQuoter(params.quoter).quote(params);
        } else if (m.isDexMarket && !m.isOracleMarket) {
            // `m.isDexMarket` is true, `m.isOracleMarket` is false: Call IQuoterDex
            result = IQuoterDex(params.quoter).quote(params, getStoredDexData(dexAddress));
        } else if (!m.isDexMarket && m.isOracleMarket) {
            // `m.isDexMarket` is false, `m.isOracleMarket` is true: Call IQuoterOracle
            result = IQuoterOracle(params.quoter).quote(params, getStoredOracleData(oracleAddress));
        } 
    }

    function quoteBatch(QuoteParamsBatch calldata params, Marking calldata m) external returns (uint256[] memory result) {
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



