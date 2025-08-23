// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IFlashCallback} from "../../Core/interfaces/internal/IFlashCallback.sol";

interface IPoolManagerFlash {
    function flashSession(address callback, bytes calldata data, address[] calldata tokens) external payable;
}

contract ReenterFlashSessionCallback is IFlashCallback {
    function flashCallback(bytes calldata data) external override {
        (address pm, address cb2, bytes memory inner, address[] memory toks) = abi.decode(data, (address, address, bytes, address[]));
        // Attempt to re-enter flashSession
        IPoolManagerFlash(pm).flashSession(cb2, inner, toks);
    }
}


