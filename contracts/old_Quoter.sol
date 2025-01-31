// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {StoixQuoterLib} from "./libraries/StoixQuoterLib.sol";

abstract contract Quoter {
    using StoixQuoterLib for StoixQuoterRequest;

    function quote(
        QuoteParams calldata qParams, 
        MarketData calldata mData
    ) external returns (uint256 quote) {

    }

    function quoteBatch(
        QuoteParamsBatch calldata qParams, 
        MarketData calldata mData
    ) external returns (uint256[] quotes) {

    }


    function __quote(StoixQuoterRequest calldata request) public returns (uint256 quote) { 
        return request.calcQuote(); // equivalent to the below one 
        // return StoixQuoterLib.calcQuote(request);    
    }

    function __batchQuotes(StoixQuoterRequest[] calldata request) external returns (uint256[] memory quotes) {
        for (uint256 i = 0; i < request.length; i++) {
            quotes[i] = __quote(request[i]);
        }
    }
}

