// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {QuoteParamsBase} from "../../structs/QuoteParams.sol";

interface IDataBridge {
  
    function getData(QuoteParamsBase memory) external returns (bytes memory);

}