// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract DummyData3 is IDataBridge {
    bytes public value;
    constructor(bytes memory _value) { value = _value; }
    function getData(QuoteParams memory) external override returns (bytes memory) {
        return value;
    }
}


