// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract MockV3TWAPBridge is IDataBridge {
    function getData(QuoteParams memory) external pure override returns (bytes memory) {
        // Return mock V3TWAP data: (spot, twap) both as 1e18 scaled prices
        // WETH/USDC prices around 4,300 USDC per WETH
        uint256 spot = 4300e18; // 4,300 USDC per WETH
        uint256 twap = 4280e18; // 4,280 USDC per WETH (TWAP slightly different)
        return abi.encode(spot, twap);
    }
}
