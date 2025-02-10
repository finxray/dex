// SPDX-License-Identifier: MIT
pragma solidity 0.8.27; 

import {DexMarketData} from "contracts/structs/DexMarketData.sol";

library TStorage {
    function setDexMarketData(address dex, DexMarketData memory data) internal {
        uint256 twap = data.twap;
        uint256 
        bytes32 slotTwap = keccak256(abi.encodePacked(dex, data.twap));
        bytes32 slotSpot = keccak256(abi.encodePacked(dex, data.spot));

        assembly {
            tstore(slotTwap)
        }
    }
}