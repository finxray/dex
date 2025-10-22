// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../InventorySkew.sol";

/// @title InventorySkewTest
/// @notice Test harness for InventorySkew library
contract InventorySkewTest {
    function calculateSkew(
        uint256 inventory0Raw,
        uint256 inventory1Raw,
        uint256 amount,
        bool zeroForOne,
        uint8 riskyModeUint,
        uint256 midPricePpb
    ) external pure returns (int256) {
        InventorySkew.RiskyAssetMode riskyMode = InventorySkew.RiskyAssetMode(riskyModeUint);
        return InventorySkew.calculateSkew(
            inventory0Raw,
            inventory1Raw,
            amount,
            zeroForOne,
            riskyMode,
            midPricePpb
        );
    }

    function calculateHalfSpreadWithInventory(
        uint32 invKPpb,
        uint32 term2Ppb,
        uint32 term3Ppb,
        int256 skewPpb,
        uint32 gammaStDev2Ppb
    ) external pure returns (uint32) {
        return InventorySkew.calculateHalfSpreadWithInventory(
            invKPpb,
            term2Ppb,
            term3Ppb,
            skewPpb,
            gammaStDev2Ppb
        );
    }
}

