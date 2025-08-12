// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

/// @title MockBetaDataBridge
/// @notice Mock implementation of beta market data provider for testing
contract MockBetaDataBridge is IDataBridge {
    uint256 public spotPrice;
    
    constructor(uint256 _spotPrice) {
        spotPrice = _spotPrice;
    }
    
    function getData(QuoteParams memory) external view override returns (bytes memory) {
        return abi.encode(spotPrice);
    }
    
    function updatePrice(uint256 _spotPrice) external {
        spotPrice = _spotPrice;
    }
}