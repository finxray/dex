// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library AssetTransferLib {
    error AssetTransferLib__IncorrectEthSent();
    error AssetTransferLib__EthNotExpected();
    error AssetTransferLib__Erc20TransferFailed();
    /// @notice Handles transfer of ERC20 or ETH from user to contract
    /// @param asset The asset address (address(0) for ETH)
    /// @param from The sender address
    /// @param amount The amount to transfer
    /// @param msgValue The msg.value passed to the function (for ETH validation)
    function transferIn(address asset, address from, uint256 amount, uint256 msgValue) internal {
        if (asset == address(0)) {
            // ETH
            if (msgValue != amount) revert AssetTransferLib__IncorrectEthSent();
        } else {
            // ERC20
            if (msgValue != 0) revert AssetTransferLib__EthNotExpected();
            if (!IERC20(asset).transferFrom(from, address(this), amount)) revert AssetTransferLib__Erc20TransferFailed();
        }
    }

    /// @notice Handles transfer of ERC20 or ETH from contract to recipient
    /// @param asset The asset address (address(0) for ETH)
    /// @param recipient The recipient address
    /// @param amount The amount to transfer
    function transferOut(address asset, address recipient, uint256 amount) internal {
        if (asset == address(0)) {
            // ETH
            payable(recipient).transfer(amount);
        } else {
            // ERC20
            if (!IERC20(asset).transfer(recipient, amount)) revert AssetTransferLib__Erc20TransferFailed();
        }
    }
} 