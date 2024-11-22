// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {MarketData} from "./MarketData.sol";
import {QuoteParams} from "./QuoteParams.sol";

struct StoixQuoterRequest {
    uint256 bucketId; 
    MarketData marketData;
    QuoteParams quoteParams;
} 


