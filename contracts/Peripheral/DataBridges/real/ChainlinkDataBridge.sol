// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";
import {IChainlinkFeedRegistry} from "../../../Core/interfaces/external/IChainlinkFeedRegistry.sol";
import {ITokenAliasRegistry} from "../../../Core/interfaces/external/ITokenAliasRegistry.sol";
import {ChainlinkAliasBase} from "./ChainlinkAliasBase.sol";

/// @notice Chainlink-based bridge using Feed Registry with TokenAliasRegistry for broad coverage
contract ChainlinkDataBridge is IDataBridge {
    address public immutable registry; // Chainlink Feed Registry
    address public immutable aliasRegistry; // TokenAliasRegistry

    address internal constant USD_SENTINEL = address(840);

    error Chainlink__DenominatorZero();
    error Chainlink__BadAnswer();
    error Chainlink__BadInverse();
    error Chainlink__FeedMissing();

    constructor(address _registry, address _aliasRegistry) {
        registry = _registry;
        aliasRegistry = _aliasRegistry;
    }

    function getData(QuoteParams memory params) external view override returns (bytes memory) {
        address b0 = _alias(params.asset0);
        address b1 = _alias(params.asset1);
        (uint256 p0, uint8 d0, uint256 u0) = _latestUsd(b0);
        (uint256 p1, uint8 d1, uint256 u1) = _latestUsd(b1);
        uint256 num = p0 * (10 ** (18 + d1));
        uint256 den = p1 * (10 ** d0);
        if (den == 0) revert Chainlink__DenominatorZero();
        uint256 spot = num / den;
        uint256 updatedAt = u0 < u1 ? u0 : u1;
        return abi.encode(spot, updatedAt);
    }

    function _alias(address token) internal view returns (address) {
        address base = ITokenAliasRegistry(aliasRegistry).getChainlinkBase(token);
        return base == address(0) ? token : base;
    }

    function _latestUsd(address base) internal view returns (uint256, uint8, uint256) {
        IChainlinkFeedRegistry r = IChainlinkFeedRegistry(registry);
        // Try base/USD
        try r.latestRoundData(base, USD_SENTINEL) returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            if (!(answer > 0)) revert Chainlink__BadAnswer();
            uint8 dec = r.decimals(base, USD_SENTINEL);
            return (uint256(answer), dec, updatedAt);
        } catch {}
        // Try USD/base and invert
        try r.latestRoundData(USD_SENTINEL, base) returns (uint80, int256 answerInv, uint256, uint256 updatedAtInv, uint80) {
            if (!(answerInv > 0)) revert Chainlink__BadInverse();
            uint8 decInv = r.decimals(USD_SENTINEL, base);
            uint256 tenPow = 10 ** decInv;
            uint256 p = (tenPow * tenPow) / uint256(answerInv);
            return (p, decInv, updatedAtInv);
        } catch {}
        revert Chainlink__FeedMissing();
    }
}
