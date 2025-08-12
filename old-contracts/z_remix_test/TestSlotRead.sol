// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract TestSlotRead {
    // Storage mapping to test slot reads
    mapping(uint256 => uint256) private values;
    
    constructor() {
        // Initialize with test value: id 3 = value 777
        values[3] = 777;
        // Add a few more test values
        values[1] = 100;
        values[2] = 200;
        values[4] = 888;
        values[5] = 999;
    }
    
    /// @notice Get value by id - single storage slot read
    /// @param id The key to look up
    /// @return The stored value
    function getValue(uint256 id) public view returns (uint256) {
        return values[id]; // SLOAD operation - test this!
    }
    
    /// @notice Set a value (for additional testing)
    /// @param id The key to set
    /// @param value The value to store
    function setValue(uint256 id, uint256 value) public {
        values[id] = value; // SSTORE operation
    }
    
    /// @notice Get multiple values in one call (for warm vs cold testing)
    /// @param ids Array of keys to look up
    /// @return Array of values
    function getMultipleValues(uint256[] memory ids) public view returns (uint256[] memory) {
        uint256[] memory results = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            results[i] = values[ids[i]]; // Multiple SLOADs - test warm reads!
        }
        return results;
    }
}