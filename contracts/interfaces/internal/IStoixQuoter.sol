// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {StoixQuoterRequest} from "../../structs/StoixQuoterRequest.sol";

interface IStoixQuoter {
    function quote(StoixQuoterRequest calldata request) external returns (uint256 quote);
    
}