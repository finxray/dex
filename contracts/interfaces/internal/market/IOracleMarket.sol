// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {OracleMarketData} from "../../../structs/OracleMarketData.sol";

interface IOracleMarket {
    function quote(uint256 id) external returns (OracleMarketData memory data);
}