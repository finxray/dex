// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {RedstoneOnDemandBridge} from "./RedstoneOnDemandBridge.sol";
import "@redstone-finance/evm-connector/contracts/core/RedstoneConsumerBase.sol";
import "@redstone-finance/evm-connector/contracts/data-services/PrimaryDemoDataServiceConsumerBase.sol";

contract RedstoneOnDemandBridgeImplDemo is RedstoneOnDemandBridge, PrimaryDemoDataServiceConsumerBase {
    constructor(address aliasRegistry) RedstoneOnDemandBridge(aliasRegistry) {}

    function getDataServiceId() public view override(PrimaryDemoDataServiceConsumerBase, RedstoneConsumerBase) returns (string memory) {
        return PrimaryDemoDataServiceConsumerBase.getDataServiceId();
    }

    function getAuthorisedSignerIndex(address receivedSigner) public view override(PrimaryDemoDataServiceConsumerBase, RedstoneConsumerBase) returns (uint8) {
        return PrimaryDemoDataServiceConsumerBase.getAuthorisedSignerIndex(receivedSigner);
    }

    function getUniqueSignersThreshold() public view override(PrimaryDemoDataServiceConsumerBase, RedstoneConsumerBase) returns (uint8) {
        return PrimaryDemoDataServiceConsumerBase.getUniqueSignersThreshold();
    }
}
