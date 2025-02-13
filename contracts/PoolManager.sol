// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {MarkingHelper} from "./libraries/MarkingHelper.sol"; 


import {SwapParams} from "./structs/SwapParams.sol";
import {QuoteParams, QuoteParamsBatch} from "./structs/QuoteParams.sol";
import {Inventory} from "./structs/Inventory.sol";
import {Pool} from "./structs/Pool.sol";

import {Marking} from "./structs/Marking.sol";


contract PoolManager is ERC6909Claims, QuoteRequester { 
    mapping(bytes32 => Pool) public pools;
    
    constructor(address _defaultDexMarketAddress, address _defaultOracleMarketAddress) QuoteRequester(_defaultDexMarketAddress, _defaultOracleMarketAddress) {}

    function completeSwapParams(SwapParams[] calldata p) public returns (bool success) {
        
    }
    // QuoteBatch are used to save gas on obtaining quotes. After quotes are received normal swap for each pool is done. 

    function _completeSwapParams(SwapParams calldata p) private returns (bool success) {
        if (p.markings.length == 1) {
            uint256 quote = quote(p);
        } else if (p.markings.length > 1) {
            uint256[] memory batchQuote = quoteBatch(p);
        } else {
            // Error goes heare
        }
    }


    function inventory(bytes32 poolID) public view override  returns (Inventory memory) {
        // Dummy function. Replace with proper implementation
        Inventory memory _inventory = Inventory({
            inventory0: 250,
            inventory1: 1246
        }); 
        return _inventory;
    } 

}



