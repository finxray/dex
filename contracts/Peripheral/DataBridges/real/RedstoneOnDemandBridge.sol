// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {ITokenAliasRegistry} from "../../../Core/interfaces/external/ITokenAliasRegistry.sol";
import "@redstone-finance/evm-connector/contracts/core/RedstoneConsumerNumericBase.sol";

abstract contract RedstoneOnDemandBridge is IDataBridge, RedstoneConsumerNumericBase {
    address public immutable aliasRegistry;
    
    event DebugValues(uint256 p0, uint256 p1, uint8 d0, uint8 d1, uint256 spot, uint256 ts);

    error RedstoneOnDemandBridge__BadPrice();
    error RedstoneOnDemandBridge__P1Zero();

    constructor(address _aliasRegistry) { aliasRegistry = _aliasRegistry; }

    // Returns abi.encode(spot1e18, updatedAtMilliseconds)
    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        // Cross via USD: fetch asset0/USD and asset1/USD then compute spot = (a0/a1)
        bytes32 f0 = ITokenAliasRegistry(aliasRegistry).getRedstoneFeedId(params.asset0);
        bytes32 f1 = ITokenAliasRegistry(aliasRegistry).getRedstoneFeedId(params.asset1);
        require(f0 != bytes32(0) && f1 != bytes32(0), "feedId missing");
        // Map each asset feed to USD if the feed id equals the asset symbol already in USD terms
        // For RedStone common feeds, ETH/UNI are USD-denominated, so we just read them directly as X/USD
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = f0; // asset0/USD
        ids[1] = f1; // asset1/USD
        (uint256[] memory vals, uint256 ts) = getOracleNumericValuesAndTimestampFromTxMsg(ids);
        uint256 p0 = vals[0]; // asset0 in USD (1e{d0})
        uint256 p1 = vals[1]; // asset1 in USD (1e{d1})
        if (!(p0 > 0 && p1 > 0)) revert RedstoneOnDemandBridge__BadPrice();
        if (p1 == 0) revert RedstoneOnDemandBridge__P1Zero();
        // RedStone USD feeds appear to be in 18 decimal format
        // Calculate spot with proper precision: (p0 * 1e18) / p1
        // This preserves decimal places instead of truncating like p0/p1 would
        uint256 spot = (p0 * 1e18) / p1;
        return abi.encode(spot, ts);
    }
}
