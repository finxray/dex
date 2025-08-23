// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30; 

// All bools are default dataBridges. if false (0), then that dataBridge is not used. if true (1), then Router will call
// default data0Bridge for data. 

struct Markings {
    bool data0; // first 1 bit, if true use default data0Bridge - reads from immutable data0Bridge (saving gas)
    bool data1; // second 1 bit, if true use default data1Bridge - reads from immutable data1Bridge (saving gas)
    bool data2; // third 1 bit, if true use default data2Bridge - reads from immutable data2Bridge (saving gas)
    bool data3; // fourth 1 bit, if true use default data3Bridge - reads from immutable data3Bridge (saving gas)
    uint16 bucketID;       // tenth 1 bit
}