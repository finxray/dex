// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SwapParams} from "../../structs/SwapParams.sol";

interface IQuoteRouter {
    function getQuote(
        SwapParams memory p,
        uint128 asset0Balance,
        uint128 asset1Balance
    ) external returns (uint256 quote, uint256 poolID);

    function getQuoteBatch(
        SwapParams memory p,
        uint128[] memory asset0Balances,
        uint128[] memory asset1Balances
    ) external returns (uint256[] memory quote, uint256[] memory poolID);
}

