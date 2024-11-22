// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {MarketData} from "./structs/MarketData.sol";

contract MarketDataQuoter { 
    function quoteMarket(uint256 id) public virtual returns (MarketData memory data) {
        // once dummy is replaced with real code use `require` to check for valid id
        // dummy data  
        if (id == 0) {
            data.spot = 42;
            data.twa = 45;
        } else if (id == 1) {
            data.spot = 22; 
            data.twa = 23;
        } else if (id == 2) {
            data.spot = 456; 
            data.twa = 440;
        } else {
            revert("Invalid id");
        }
    }
}

