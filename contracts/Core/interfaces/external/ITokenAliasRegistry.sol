// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ITokenAliasRegistry {
    function getChainlinkBase(address token) external view returns (address);
    function getRedstoneFeedId(address token) external view returns (bytes32);
    function getRedstoneDecimals(address token) external view returns (uint8);
}
