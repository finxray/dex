// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

struct Marking {
        bool isAlpha;
        bool isBeta;
        bool isAlphaDefault;
        bool isBetaDefault;
        uint8 alphaAddressPointer; // 4 bits
        uint8 betaAddressPointer; // 4 bits
        uint16 bucketID; // 12 bits
}