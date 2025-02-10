// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {MarkingHelper} from "./libraries/MarkingHelper.sol"; 
// import {IDexMarket} from "./interfaces/internal/market/IDexMarket.sol";
// import {IOracleMarket} from "./interfaces/internal/market/IOracleMarket.sol";

import {SwapParams} from "./structs/SwapParams.sol";
import {QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";
import {Inventory} from "./structs/Inventory.sol";
import {DexMarketData} from "./structs/DexMarketData.sol";
import {Marking} from "./structs/Marking.sol";
import {OracleMarketData} from "./structs/OracleMarketData.sol";

abstract contract PoolManager is ERC6909Claims, QuoteRequester { 

   constructor(address _defaultDexMarketAddress, address _defaultOracleMarketAddress) QuoteRequester(_defaultDexMarketAddress, _defaultOracleMarketAddress) {}


    function swap(SwapParams calldata p) public returns (bool success) {
        if (p.markings.length > 1) {
            uint256 quote = quote(p);
        } else {
            uint256[] memory batchQuote = quoteBatch(p);
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

    
    

    function inventory(bytes32 poolID) public view override  returns (Inventory memory) {
        // Dummy function. Replace with proper implementation
        Inventory memory _inventory = Inventory({
            inventory0: 250,
            inventory1: 1246
        }); 
        return _inventory;
    } 

  


}



