// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteParams} from "../../structs/QuoteParams.sol";

interface IDataBridge {
    function getData(QuoteParams memory params) external returns (bytes memory);
}