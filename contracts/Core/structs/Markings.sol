// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30; 

// All bools are default dataBridges. if false (0), then that dataBridge is not used. if true (1), then Router will call
// default data0Bridge for data. 

struct Markings {
    // Layout in bytes3 (24 bits total):
    // bits [0..3]   -> data0..data3 (booleans)
    // bits [4..15]  -> bucketID (12 bits)
    // bits [16]     -> reserved (protocol flag used elsewhere)
    // bits [17..19] -> reserved
    // bits [20..23] -> extraBridgeSlot (0 = none, 4..15 = configurable slots)
    bool data0;
    bool data1;
    bool data2;
    bool data3;
    uint16 bucketID;
    uint8 extraBridgeSlot; // 0 = none, 4..15 = overall slot index
}