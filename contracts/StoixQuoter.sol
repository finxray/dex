// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {StoixQuoterRequest} from "./structs/StoixQuoterRequest.sol";
import {StoixQuoterLib} from "./libraries/StoixQuoterLib.sol";

contract StoixQuoter {
    using StoixQuoterLib for StoixQuoterRequest;

    function quote(StoixQuoterRequest calldata request) public returns (uint256 quote) { 
        return request.calcQuote(); // equivalent to the below one 
        // return StoixQuoterLib.calcQuote(request);    
    }

    function batchQuotes(StoixQuoterRequest[] calldata request) external returns (uint256[] memory quotes) {
        for (uint256 i = 0; i < request.length; i++) {
            quotes[i] = quote(request[i]);
        }
    }
}

