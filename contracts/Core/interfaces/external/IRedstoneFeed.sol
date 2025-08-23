// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IRedstoneFeed {
    function getValue(bytes32 dataFeedId) external view returns (uint256 price, uint256 updatedAt);
}
