// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../../Core/structs/QuoteParams.sol";

contract MockUniV2Bridge is IDataBridge {
    function getData(QuoteParams memory) external pure override returns (bytes memory) {
        // Return mock UniV2 data: (spot, twap)
        // WETH/USDC prices around 4,300 USDC per WETH
        uint256 spot = 4285e18; // 4,285 USDC per WETH
        uint256 twap = 4275e18; // 4,275 USDC per WETH (TWAP)
        return abi.encode(spot, twap);
    }
}
