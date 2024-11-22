// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {MarketData} from "../../structs/MarketData.sol";

interface IMarketDataQuoter {
    function quoteMarket(uint256 id) external returns (MarketData memory data);
}