// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IFlashCallback} from "../../Core/interfaces/internal/IFlashCallback.sol";

contract DummyFlashCallback is IFlashCallback {
    event Called(bytes data);
    function flashCallback(bytes calldata data) external override {
        emit Called(data);
        // no-op
    }
}


