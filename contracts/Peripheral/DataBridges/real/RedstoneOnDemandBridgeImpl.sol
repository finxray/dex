// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {RedstoneOnDemandBridge} from "./RedstoneOnDemandBridge.sol";
import "@redstone-finance/evm-connector/contracts/core/RedstoneConsumerBase.sol";
import "@redstone-finance/evm-connector/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol";

contract RedstoneOnDemandBridgeImpl is RedstoneOnDemandBridge, PrimaryProdDataServiceConsumerBase {
    constructor(address aliasRegistry) RedstoneOnDemandBridge(aliasRegistry) {}

    function getDataServiceId() public view override(PrimaryProdDataServiceConsumerBase, RedstoneConsumerBase) returns (string memory) {
        return PrimaryProdDataServiceConsumerBase.getDataServiceId();
    }

    function getAuthorisedSignerIndex(address receivedSigner) public view override(PrimaryProdDataServiceConsumerBase, RedstoneConsumerBase) returns (uint8) {
        return PrimaryProdDataServiceConsumerBase.getAuthorisedSignerIndex(receivedSigner);
    }

    function getUniqueSignersThreshold() public view override(PrimaryProdDataServiceConsumerBase, RedstoneConsumerBase) returns (uint8) {
        return PrimaryProdDataServiceConsumerBase.getUniqueSignersThreshold();
    }
}
