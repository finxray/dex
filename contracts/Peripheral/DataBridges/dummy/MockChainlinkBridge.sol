// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract MockChainlinkBridge is IDataBridge {
    function getData(QuoteParams memory) external view override returns (bytes memory) {
        // Return mock Chainlink data: (spot, updatedAt)
        // WETH/USDC prices around 4,300 USDC per WETH
        uint256 spot = 4290e18; // 4,290 USDC per WETH
        uint256 updatedAt = block.timestamp - 60; // Updated 1 minute ago
        return abi.encode(spot, updatedAt);
    }
}
