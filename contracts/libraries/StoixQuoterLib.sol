// SPDX-License-Identifier: MIT 
pragma solidity 0.8.27;

import {StoixQuoterRequest} from "../structs/StoixQuoterRequest.sol";

library StoixQuoterLib {
    struct Variables {
        uint256 alpha;
        uint256 beta;
        uint256 gamma;
    }

    function calcQuote(StoixQuoterRequest calldata r) internal pure returns (uint256 quote) {
        Variables memory v;
        if (r.bucketId == 0) {
            // Dummy calculation for id 0
            v.alpha = 0;
            v.beta = 80;
            v.gamma = 20;
        } else if (r.bucketId == 1) {
            // Dummy calculation for id 1
            v.alpha = 10;
            v.beta = 70;
            v.gamma = 30;
        } else if (r.bucketId == 2) {
            // Dummy calculation for id 2
            v.alpha = 12;
            v.beta = 60;
            v.gamma = 40;
        } else if (r.bucketId == 3) {
            // Dummy calculation for id 3
            v.alpha = 15;
            v.beta = 50;
            v.gamma = 50;
        } else if (r.bucketId == 4) {
            // Dummy calculation for id 4
            v.alpha = 20;
            v.beta = 30;
            v.gamma = 70;
        }

        // we are ignoring r.swapParams here for simplicity
        quote = (v.alpha + v.beta * r.marketData.spot + v.gamma * r.marketData.twa) / 100; 
    } 
}