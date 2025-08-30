// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract MockV3DataBridge is IDataBridge {
    function getData(QuoteParams memory) external pure override returns (bytes memory) {
        // Return mock V3Data: (spot, spot) - V3Data doesn't have TWAP
        // WETH/USDC prices around 4,300 USDC per WETH
        uint256 spot = 4310e18; // 4,310 USDC per WETH
        return abi.encode(spot, spot);
    }
}
