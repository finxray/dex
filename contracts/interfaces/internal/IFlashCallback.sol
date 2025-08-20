// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IFlashCallback {
    /// @notice Called within a flash session to perform composed operations
    /// @param data Arbitrary calldata for the callback logic
    function flashCallback(bytes calldata data) external;
}


