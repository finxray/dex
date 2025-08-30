// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract MockSushiV2Bridge is IDataBridge {
    function getData(QuoteParams memory) external pure override returns (bytes memory) {
        // Return mock SushiV2 data: (spot, spot) - treating as spot only
        // WETH/USDC prices around 4,300 USDC per WETH
        uint256 spot = 4305e18; // 4,305 USDC per WETH
        return abi.encode(spot, spot);
    }
}
