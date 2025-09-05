// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IFlashCallback} from "../../Core/interfaces/internal/IFlashCallback.sol";

contract NoopFlashCallback is IFlashCallback {
    function flashCallback(bytes calldata) external {}
}


