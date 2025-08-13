// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MarkingHelper} from "./libraries/MarkingHelper.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {TransientStorage} from "./libraries/TransientStorage.sol";

import {IQuoterNoData} from "./interfaces/internal/quoters/IQuoterNoData.sol";
import {IQuoterSingleData} from "./interfaces/internal/quoters/IQuoterSingleData.sol";
import {IQuoterDualData} from "./interfaces/internal/quoters/IQuoterDualData.sol";
import {IDataBridge} from "./interfaces/internal/IDataBridge.sol";

import {SwapParams} from "./structs/SwapParams.sol";
import {Marking} from "./structs/Marking.sol"; 
import {QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";

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

    /// @notice Add or update alpha market data address at specified pointer
    /// @param pointer Index (0-15) where to store the alpha address
    /// @param alphaAddress Address of the alpha market data contract
    function addAlphaMarketAddress(uint8 pointer, address alphaAddress) external {
        require(pointer < 16, "Invalid pointer: must be 0-15");
        alphaAddressStorage[pointer] = alphaAddress;
    }

    /// @notice Add or update beta market data address at specified pointer
    /// @param pointer Index (0-15) where to store the beta address
    /// @param betaAddress Address of the beta market data contract
    function addBetaMarketAddress(uint8 pointer, address betaAddress) external {
        require(pointer < 16, "Invalid pointer: must be 0-15");
        betaAddressStorage[pointer] = betaAddress;
    }

    /// @notice Remove alpha market data address at specified pointer
    /// @param pointer Index (0-15) from which to remove the alpha address
    function removeAlphaMarketAddress(uint8 pointer) external {
        require(pointer < 16, "Invalid pointer: must be 0-15");
        delete alphaAddressStorage[pointer];
    }

    /// @notice Remove beta market data address at specified pointer
    /// @param pointer Index (0-15) from which to remove the beta address
    function removeBetaMarketAddress(uint8 pointer) external {
        require(pointer < 16, "Invalid pointer: must be 0-15");
        delete betaAddressStorage[pointer];
    }

    /// @notice Get alpha market data address at specified pointer
    /// @param pointer Index (0-15) to query
    /// @return alphaAddress Address stored at the pointer
    function getAlphaMarketAddress(uint8 pointer) external view returns (address alphaAddress) {
        require(pointer < 16, "Invalid pointer: must be 0-15");
        alphaAddress = alphaAddressStorage[pointer];
    }

    /// @notice Get beta market data address at specified pointer
    /// @param pointer Index (0-15) to query
    /// @return betaAddress Address stored at the pointer
    function getBetaMarketAddress(uint8 pointer) external view returns (address betaAddress) {
        require(pointer < 16, "Invalid pointer: must be 0-15");
        betaAddress = betaAddressStorage[pointer];
    }



    // Dummy quoter returns a fixed exchange rate (asset0/asset1 = 1.3)
    function dummyQuoter(
        address, 
        address,
        uint128,
        uint128
    ) public pure returns (uint256 rate) {
        // For now, just receives inventories but doesn't use them
        // Return 1.3 * 1e18 for fixed-point math
        rate = 1300000000000000000; // 1.3 * 1e18
    }

    /// @notice Get market data with transient storage caching
    /// @param dataAddress Address of the market data provider (alpha/beta)
    /// @param params Quote parameters containing all necessary context
    /// @return data Cached or freshly fetched market data
    function getMarketData(address dataAddress, QuoteParams memory params) internal returns (bytes memory data) {
        // Try to load from transient storage cache first
        data = dataAddress.loadTransient();
        
        if (data.length == 0) {
            // Cache miss - fetch fresh data from data bridge
            data = IDataBridge(dataAddress).getData(params);
            // Only store in transient storage if data is not empty to avoid tstore void value issues
            if (data.length > 0) {
                dataAddress.storeTransient(data);
            }
        }
        
        return data;
    }

    function getQuote(SwapParams memory p, uint128 asset0Balance, uint128 asset1Balance) internal returns (uint256 quote, uint256 poolID) {
        // Calculate poolID using assembly function
        poolID = PoolIDAssembly.assemblePoolID(p.asset0, p.asset1, p.quoter, p.marking[0]);
        
        // Decode markings to determine quoter type and data requirements
        Marking memory m = MarkingHelper.decodeMarkings(p.marking[0]);
        
        // Resolve addresses based on marking flags
        address alpha = (m.isAlphaDefault) ? defaultAlpha : alphaAddressStorage[m.alphaAddressPointer];
        address beta = (m.isBetaDefault) ? defaultBeta : betaAddressStorage[m.betaAddressPointer];
        
        // Validate addresses
        require(alpha != address(0), "Alpha address is zero");
        require(beta != address(0), "Beta address is zero");
        
        // Create params struct
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

        // Call appropriate quoter based on marking flags with transient storage caching
        if (m.isAlpha && m.isBeta) {
            // Both alpha and beta data required - dual data quoter
            quote = IQuoterDualData(params.quoter).quote(
                params, 
                getMarketData(alpha, params), 
                getMarketData(beta, params)
            );
        } else if (!m.isAlpha && !m.isBeta) {
            // No external market data required - pure on-chain quoter
            quote = IQuoterNoData(params.quoter).quote(params);
        } else if (m.isAlpha && !m.isBeta) {
            // Only alpha data required - single data quoter
            quote = IQuoterSingleData(params.quoter).quote(params, getMarketData(alpha, params));
        } else if (!m.isAlpha && m.isBeta) {
            // Only beta data required - single data quoter  
            quote = IQuoterSingleData(params.quoter).quote(params, getMarketData(beta, params));
        } 
    }

 

    function getQuoteBatch(SwapParams memory p, uint128[] memory asset0Balances, uint128[] memory asset1Balances) internal returns (uint256[] memory quote, uint256[] memory poolID) {
        poolID = new uint256[](p.marking.length);
        quote = new uint256[](p.marking.length);
        uint16[] memory bucketIDs = new uint16[](p.marking.length);
        Marking memory m = MarkingHelper.decodeMarkings(p.marking[0]);
        
        for (uint i = 0; i < p.marking.length; i++) {
            poolID[i] = PoolIDAssembly.assemblePoolID(p.asset0, p.asset1, p.quoter, p.marking[i]);
            bucketIDs[i] = MarkingHelper.decodeMarkings(p.marking[i]).bucketID;
        }

        // Create flattened struct - no nesting!
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

        address alpha = (m.isAlphaDefault) ? defaultAlpha : alphaAddressStorage[m.alphaAddressPointer];
        address beta = (m.isBetaDefault) ? defaultBeta : betaAddressStorage[m.betaAddressPointer];
        
        // Create base params for market data fetching
        QuoteParams memory baseParams = QuoteParams({
            asset0: p.asset0,
            asset1: p.asset1,
            quoter: p.quoter,
            amount: 0, // Not used for market data
            asset0Balance: 0, // Not used for market data
            asset1Balance: 0, // Not used for market data
            bucketID: 0, // Not used for market data
            zeroForOne: p.zeroForOne
        });
        
        // Routing logic based on marking
        if (m.isAlpha && m.isBeta) {
            // Both alpha and beta data required - dual data quoter
            quote = IQuoterDualData(params.quoter).quoteBatch(
                params, 
                getMarketData(alpha, baseParams), 
                getMarketData(beta, baseParams)
            );
        } else if (!m.isAlpha && !m.isBeta) {
            // No external market data required - pure on-chain quoter
            quote = IQuoterNoData(params.quoter).quoteBatch(params);
        } else if (m.isAlpha && !m.isBeta) {
            // Only alpha data required - single data quoter
            quote = IQuoterSingleData(params.quoter).quoteBatch(params, getMarketData(alpha, baseParams));
        } else if (!m.isAlpha && m.isBeta) {
            // Only beta data required - single data quoter
            quote = IQuoterSingleData(params.quoter).quoteBatch(params, getMarketData(beta, baseParams));
        } 
    }

    /// @notice Backward compatibility version of getQuoteBatch without balances
    function getQuoteBatch(SwapParams calldata p) internal returns (uint256[] memory quote, uint256[] memory poolID) {
        // Create empty balance arrays - quoters will use default/zero balances
        uint128[] memory emptyAsset0Balances = new uint128[](p.marking.length);
        uint128[] memory emptyAsset1Balances = new uint128[](p.marking.length);
        
        return getQuoteBatch(p, emptyAsset0Balances, emptyAsset1Balances);
    }
}