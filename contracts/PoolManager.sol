// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {PoolIDCreator} from "./libraries/PoolIDCreator.sol";
import {QuoteParams} from "./structs/QuoteParams.sol";

contract PoolManager is ERC6909Claims, QuoteRequester { 
    // using PoolIDHelper for *;

   constructor(address _defaultDexMarketAddress, address _defaultOracleMarketAddress) QuoteRequester(defaultDexMarketAddress, _defaultOracleMarketAddress) {}
   

    function swap(SwapParams calldata params) public returns (bool success) {
        
    }



   
    

    function inventory(uint256 poolID) public view returns (uint128 inventory0, uint128 inventory1) {
        // dummy function 
        inventory0 = 250; 
        inventory1 = 1246;
    } 

}



