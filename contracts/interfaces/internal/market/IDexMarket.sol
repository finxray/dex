// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {QuoteParamsBase} from "../../../structs/QuoteParams.sol"  ;

interface IDexMarket {
    function getData(QuoteParamsBase memory, uint256 totalAmount) external returns (bytes memory);
}