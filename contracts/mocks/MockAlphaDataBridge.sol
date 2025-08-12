// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

/// @title MockAlphaDataBridge
/// @notice Mock implementation of alpha market data provider for testing
contract MockAlphaDataBridge is IDataBridge {
    uint256 public spotPrice;
    uint256 public twapPrice;
    
    constructor(uint256 _spotPrice, uint256 _twapPrice) {
        spotPrice = _spotPrice;
        twapPrice = _twapPrice;
    }
    
    function getData(QuoteParams memory) external view override returns (bytes memory) {
        return abi.encode(spotPrice, twapPrice);
    }
    
    function updatePrices(uint256 _spotPrice, uint256 _twapPrice) external {
        spotPrice = _spotPrice;
        twapPrice = _twapPrice;
    }
}