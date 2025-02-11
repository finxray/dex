// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParamsBase} from "contracts/structs/QuoteParams.sol";

interface IMarketQuoter {
    function quote(QuoteParamsBase memory) external returns (bytes memory);
}