// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {MarkingHelper} from "./libraries/MarkingHelper.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";
import {Inventory} from "./structs/Inventory.sol";
import {DexMarketData} from "./structs/DexMarketData.sol";
import {Marking} from "./structs/Marking.sol";
import {OracleMarketData} from "./structs/OracleMarketData.sol";

contract PoolManager is ERC6909Claims, QuoteRequester { 

   constructor(address _defaultDexMarketAddress, address _defaultOracleMarketAddress) QuoteRequester(defaultDexMarketAddress, _defaultOracleMarketAddress) {}


    function swap(SwapParams calldata p) public returns (bool success) {
        if (p.markings.length > 1) {
            return _swap(p);
        } else {
            return _swapBatch(p);
        }
    }
    

    function dexData() public view returns (DexMarketData memory) {

    }

    function oracleData() public view returns (OracleMarketData memory) {

    }

    function storeDexData() public view {}

    function storeOracleData() public view {} 

    function getStoredDexData(address dexAddress) public view override returns (DexMarketData memory) {}
    function getStoredOracleData(address oracleAddress) public override view returns (OracleMarketData memory) {}

    
    

    function inventory(bytes32 poolID) public view returns (Inventory memory) {
        // Dummy function. Replace with proper implementation
    
        Inventory memory _inventory = Inventory({
            inventory0: 250,
            inventory1: 1246
        }); 

        return _inventory;
        
    } 

    function _swap(SwapParams calldata p) private returns (bool success) {
        // create poolID 
            bytes32 poolID = PoolIDCreator.createPoolID(p.asset0, p.asset1, p.quoter, p.markings[0]);
            Marking memory m = MarkingHelper.decodeMarkings(p.markings[0]);
            QuoteParams memory quoteParams = QuoteParams({
                asset0: p.asset0,
                asset1: p.asset1, 
                quoter: p.quoter,
                zeroForOne: p.zeroForOne,
                amount: p.amount[0],
                inventory: inventory(poolID), 
                bucketID: m.bucketID
            });
        
        // assemble QuoteRequest 
        // call quote 
        // create dex and oracle market contracts 
        // create storage funactions for these variables     
    }

    function _swapBatch(SwapParams calldata p) private returns (bool success) {

    }

}



