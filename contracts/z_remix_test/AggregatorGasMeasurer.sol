// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

contract AggregatorGasMeasurer {
    uint256 public lastSpot;
    uint256 public lastTwap;

    event Measured(uint256 spot, uint256 twap);

    function measure(address aggregator, QuoteParams calldata params) external {
        bytes memory data = IDataBridge(aggregator).getData(params);
        (uint256 spot, uint256 twap) = abi.decode(data, (uint256, uint256));
        lastSpot = spot;
        lastTwap = twap;
        emit Measured(spot, twap);
    }
}


