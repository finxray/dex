// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract MockRedstoneBridge is IDataBridge {
    function getData(QuoteParams memory) external view override returns (bytes memory) {
        // Return mock RedStone data: (spot, updatedAt)
        // WETH/USDC prices around 4,300 USDC per WETH
        uint256 spot = 4295e18; // 4,295 USDC per WETH
        uint256 updatedAt = block.timestamp - 30; // Updated 30 seconds ago
        return abi.encode(spot, updatedAt);
    }
}
