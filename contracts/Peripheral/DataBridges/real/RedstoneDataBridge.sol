// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {IRedstoneFeed} from "../../../Core/interfaces/external/IRedstoneFeed.sol";
import {ITokenAliasRegistry} from "../../../Core/interfaces/external/ITokenAliasRegistry.sol";

contract RedstoneDataBridge is IDataBridge {
    address public immutable adapter; // RedStone adapter exposing getValue(bytes32)
    address public immutable aliasRegistry; // TokenAliasRegistry for token->feedId

    error RedstoneDataBridge__FeedIdMissing();
    error RedstoneDataBridge__BadPrice();

    constructor(address _adapter, address _aliasRegistry) {
        adapter = _adapter;
        aliasRegistry = _aliasRegistry;
    }

    // Returns abi.encode(spot1e18, updatedAt)
    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        bytes32 f0 = ITokenAliasRegistry(aliasRegistry).getRedstoneFeedId(params.asset0);
        bytes32 f1 = ITokenAliasRegistry(aliasRegistry).getRedstoneFeedId(params.asset1);
        if (!(f0 != bytes32(0) && f1 != bytes32(0))) revert RedstoneDataBridge__FeedIdMissing();
        (uint256 p0, uint256 u0) = IRedstoneFeed(adapter).getValue(f0);
        (uint256 p1, uint256 u1) = IRedstoneFeed(adapter).getValue(f1);
        if (!(p0 > 0 && p1 > 0)) revert RedstoneDataBridge__BadPrice();
        uint256 spot = (p0 * 1e18) / p1;
        uint256 updatedAt = u0 < u1 ? u0 : u1;
        return abi.encode(spot, updatedAt);
    }
}
