// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  
import {DexMarketData} from "../../../structs/DexMarketData.sol";

interface IDexMarket {
    function quote(uint256 id) external returns (DexMarketData memory data);
}