// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../libraries/PoolIDAssembly.sol";

/// @title TestAssemblePoolID - Gas Cost Comparison Contract
/// @notice Simple contract to test assemblePoolID function and compare gas costs
contract TestAssemblePoolID {
    
    /// @notice Test assemblePoolID function - direct library call
    /// @param asset0 First asset address (lower address)
    /// @param asset1 Second asset address (higher address)
    /// @param quoter Quoter contract address
    /// @param markings 3-byte marking data
    /// @return poolID The assembled pool identifier
    function assemblePoolID(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external pure returns (uint256 poolID) {
        return PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
    }

    /// @notice Test multiple poolID assemblies in one transaction
    /// @param asset0s Array of first asset addresses
    /// @param asset1s Array of second asset addresses  
    /// @param quoters Array of quoter addresses
    /// @param markingsArray Array of markings
    /// @return poolIDs Array of assembled pool identifiers
    function assembleMultiplePoolIDs(
        address[] calldata asset0s,
        address[] calldata asset1s,
        address[] calldata quoters,
        bytes3[] calldata markingsArray
    ) external pure returns (uint256[] memory poolIDs) {
        require(asset0s.length == asset1s.length, "Arrays length mismatch");
        require(asset0s.length == quoters.length, "Arrays length mismatch");
        require(asset0s.length == markingsArray.length, "Arrays length mismatch");
        
        poolIDs = new uint256[](asset0s.length);
        
        for (uint256 i = 0; i < asset0s.length; i++) {
            poolIDs[i] = PoolIDAssembly.assemblePoolID(
                asset0s[i], 
                asset1s[i], 
                quoters[i], 
                markingsArray[i]
            );
        }
    }

    /// @notice Test poolID assembly with pre-defined test data
    /// @return poolID1 ETH/TokenA pool ID
    /// @return poolID2 TokenA/TokenB pool ID  
    /// @return poolID3 Custom test pool ID
    function assembleTestPoolIDs() external pure returns (
        uint256 poolID1,
        uint256 poolID2, 
        uint256 poolID3
    ) {
        // ETH/TokenA pool
        poolID1 = PoolIDAssembly.assemblePoolID(
            address(0),
            0x1111111111111111111111111111111111111111,
            0x3333333333333333333333333333333333333333,
            0x123456
        );
        
        // TokenA/TokenB pool
        poolID2 = PoolIDAssembly.assemblePoolID(
            0x1111111111111111111111111111111111111111,
            0x2222222222222222222222222222222222222222,
            0x3333333333333333333333333333333333333333,
            0xabcdef
        );
        
        // Custom test pool
        poolID3 = PoolIDAssembly.assemblePoolID(
            0x4444444444444444444444444444444444444444,
            0x5555555555555555555555555555555555555555,
            0x6666666666666666666666666666666666666666,
            0x789abc
        );
    }

    /// @notice Compare gas cost: single vs batch assembly
    /// @return singleCost Gas cost for single assembly
    /// @return batchCost Gas cost for batch assembly (per item)
    function compareGasCosts() external view returns (uint256 singleCost, uint256 batchCost) {
        uint256 gasStart;
        uint256 gasUsed;
        
        // Test single assembly
        gasStart = gasleft();
        PoolIDAssembly.assemblePoolID(
            address(0),
            0x1111111111111111111111111111111111111111,
            0x3333333333333333333333333333333333333333,
            0x123456
        );
        singleCost = gasStart - gasleft();
        
        // Test batch assembly (3 items)
        gasStart = gasleft();
        PoolIDAssembly.assemblePoolID(address(0), 0x1111111111111111111111111111111111111111, 0x3333333333333333333333333333333333333333, 0x123456);
        PoolIDAssembly.assemblePoolID(0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222, 0x3333333333333333333333333333333333333333, 0xabcdef);
        PoolIDAssembly.assemblePoolID(0x4444444444444444444444444444444444444444, 0x5555555555555555555555555555555555555555, 0x6666666666666666666666666666666666666666, 0x789abc);
        gasUsed = gasStart - gasleft();
        batchCost = gasUsed / 3; // Average per assembly
    }

    /*//////////////////////////////////////////////////////////////
                        POOL ID DISASSEMBLY FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Disassemble poolID back into its components
    /// @param poolID The pool identifier to disassemble
    /// @return asset0 First asset address
    /// @return asset1 Second asset address
    /// @return quoter Quoter contract address
    /// @return markings 3-byte marking data
    function disassemblePoolID(uint256 poolID) external pure returns (
        address asset0,
        address asset1, 
        address quoter,
        bytes3 markings
    ) {
        // Extract components using bit operations
        // PoolID structure: asset0 (160 bits) + asset1 (160 bits) + quoter (160 bits) + markings (24 bits)
        
        markings = bytes3(uint24(poolID)); // Last 24 bits
        quoter = address(uint160(poolID >> 24)); // Next 160 bits
        asset1 = address(uint160(poolID >> 184)); // Next 160 bits
        asset0 = address(uint160(poolID >> 344)); // First 160 bits
    }

    /// @notice Disassemble multiple poolIDs
    /// @param poolIDs Array of pool identifiers to disassemble
    /// @return asset0s Array of first asset addresses
    /// @return asset1s Array of second asset addresses
    /// @return quoters Array of quoter addresses
    /// @return markingsArray Array of markings
    function disassembleMultiplePoolIDs(uint256[] calldata poolIDs) external pure returns (
        address[] memory asset0s,
        address[] memory asset1s,
        address[] memory quoters,
        bytes3[] memory markingsArray
    ) {
        uint256 length = poolIDs.length;
        asset0s = new address[](length);
        asset1s = new address[](length);
        quoters = new address[](length);
        markingsArray = new bytes3[](length);
        
        for (uint256 i = 0; i < length; i++) {
            uint256 poolID = poolIDs[i];
            markingsArray[i] = bytes3(uint24(poolID));
            quoters[i] = address(uint160(poolID >> 24));
            asset1s[i] = address(uint160(poolID >> 184));
            asset0s[i] = address(uint160(poolID >> 344));
        }
    }

    /// @notice Test round-trip: assemble then disassemble
    /// @param asset0 First asset address
    /// @param asset1 Second asset address
    /// @param quoter Quoter contract address
    /// @param markings 3-byte marking data
    /// @return success True if round-trip preserves all data
    /// @return assembledID The assembled pool ID
    /// @return recoveredAsset0 Recovered asset0 address
    /// @return recoveredAsset1 Recovered asset1 address
    /// @return recoveredQuoter Recovered quoter address
    /// @return recoveredMarkings Recovered markings
    function testRoundTrip(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external pure returns (
        bool success,
        uint256 assembledID,
        address recoveredAsset0,
        address recoveredAsset1,
        address recoveredQuoter,
        bytes3 recoveredMarkings
    ) {
        // Assemble poolID
        assembledID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Disassemble poolID
        recoveredMarkings = bytes3(uint24(assembledID));
        recoveredQuoter = address(uint160(assembledID >> 24));
        recoveredAsset1 = address(uint160(assembledID >> 184));
        recoveredAsset0 = address(uint160(assembledID >> 344));
        
        // Check if all components match
        success = (asset0 == recoveredAsset0) && 
                 (asset1 == recoveredAsset1) && 
                 (quoter == recoveredQuoter) && 
                 (markings == recoveredMarkings);
    }

    /// @notice Test disassembly with known poolID
    /// @return asset0 Should be 0x0000000000000000000000000000000000000000
    /// @return asset1 Should be 0x1111111111111111111111111111111111111111
    /// @return quoter Should be 0x3333333333333333333333333333333333333333
    /// @return markings Should be 0x123456
    function testKnownPoolID() external pure returns (
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) {
        // Using the known poolID from comments: 42955307580170980946467815337668002166680498660974576864971747189779899351040
        uint256 knownPoolID = 42955307580170980946467815337668002166680498660974576864971747189779899351040;
        
        markings = bytes3(uint24(knownPoolID));
        quoter = address(uint160(knownPoolID >> 24));
        asset1 = address(uint160(knownPoolID >> 184));
        asset0 = address(uint160(knownPoolID >> 344));
    }

    /// @notice Compare gas costs: assembly vs disassembly
    /// @return assemblyCost Gas cost for assembly
    /// @return disassemblyCost Gas cost for disassembly
    function compareAssemblyVsDisassembly() external view returns (uint256 assemblyCost, uint256 disassemblyCost) {
        uint256 gasStart;
        
        // Test assembly cost
        gasStart = gasleft();
        PoolIDAssembly.assemblePoolID(
            address(0),
            0x1111111111111111111111111111111111111111,
            0x3333333333333333333333333333333333333333,
            0x123456
        );
        assemblyCost = gasStart - gasleft();
        
        // Test disassembly cost
        uint256 poolID = 42955307580170980946467815337668002166680498660974576864971747189779899351040;
        gasStart = gasleft();
        bytes3 markings = bytes3(uint24(poolID));
        address quoter = address(uint160(poolID >> 24));
        address asset1 = address(uint160(poolID >> 184));
        address asset0 = address(uint160(poolID >> 344));
        disassemblyCost = gasStart - gasleft();
        
        // Prevent compiler optimization
        assembly {
            let temp := add(add(asset0, asset1), add(quoter, markings))
        }
    }

    /*//////////////////////////////////////////////////////////////
                        STORAGE RETRIEVAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    // Storage mappings to simulate pool data storage
    mapping(uint256 => address) public poolAsset0;
    mapping(uint256 => address) public poolAsset1; 
    mapping(uint256 => address) public poolQuoter;
    mapping(uint256 => bytes3) public poolMarkings;

    /// @notice Initialize test pool data in storage
    /// @dev Call this first to set up test data for poolID = 1
    function initializeTestPool() external {
        poolAsset0[1] = address(0);
        poolAsset1[1] = 0x1111111111111111111111111111111111111111;
        poolQuoter[1] = 0x3333333333333333333333333333333333333333;
        poolMarkings[1] = 0x123456;
    }

    /// @notice Retrieve pool data from storage
    /// @param poolID The pool identifier
    /// @return asset0 First asset address from storage
    /// @return asset1 Second asset address from storage
    /// @return quoter Quoter contract address from storage
    /// @return markings 3-byte marking data from storage
    function retrieveFromStorage(uint256 poolID) external view returns (
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) {
        asset0 = poolAsset0[poolID];
        asset1 = poolAsset1[poolID];
        quoter = poolQuoter[poolID];
        markings = poolMarkings[poolID];
    }

    /// @notice Compare gas costs: storage retrieval vs disassembly
    /// @param poolID The pool identifier (use 1 for test data)
    /// @return storageCost Gas cost for storage retrieval
    /// @return disassemblyCost Gas cost for disassembly
    function compareStorageVsDisassembly(uint256 poolID) external view returns (
        uint256 storageCost, 
        uint256 disassemblyCost
    ) {
        uint256 gasStart;
        
        // Test storage retrieval cost (4 SLOAD operations)
        gasStart = gasleft();
        address asset0 = poolAsset0[poolID];
        address asset1 = poolAsset1[poolID];
        address quoter = poolQuoter[poolID];
        bytes3 markings = poolMarkings[poolID];
        storageCost = gasStart - gasleft();
        
        // Test disassembly cost (bit operations on poolID)
        gasStart = gasleft();
        bytes3 disMarkings = bytes3(uint24(poolID));
        address disQuoter = address(uint160(poolID >> 24));
        address disAsset1 = address(uint160(poolID >> 184));
        address disAsset0 = address(uint160(poolID >> 344));
        disassemblyCost = gasStart - gasleft();
        
        // Prevent compiler optimization
        assembly {
            let temp1 := add(add(asset0, asset1), add(quoter, markings))
            let temp2 := add(add(disAsset0, disAsset1), add(disQuoter, disMarkings))
        }
    }

    /// @notice Test multiple storage retrievals (warm vs cold)
    /// @return firstCallCost Cost of first retrieval (cold storage)
    /// @return secondCallCost Cost of second retrieval (warm storage)
    function testWarmVsColdStorage() external view returns (
        uint256 firstCallCost,
        uint256 secondCallCost
    ) {
        uint256 gasStart;
        
        // First call (cold storage reads)
        gasStart = gasleft();
        address asset0_1 = poolAsset0[1];
        address asset1_1 = poolAsset1[1];
        address quoter_1 = poolQuoter[1];
        bytes3 markings_1 = poolMarkings[1];
        firstCallCost = gasStart - gasleft();
        
        // Second call (warm storage reads)
        gasStart = gasleft();
        address asset0_2 = poolAsset0[1];
        address asset1_2 = poolAsset1[1];
        address quoter_2 = poolQuoter[1];
        bytes3 markings_2 = poolMarkings[1];
        secondCallCost = gasStart - gasleft();
        
        // Prevent compiler optimization
        assembly {
            let temp1 := add(add(asset0_1, asset1_1), add(quoter_1, markings_1))
            let temp2 := add(add(asset0_2, asset1_2), add(quoter_2, markings_2))
        }
    }

    /// @notice Comprehensive gas comparison
    /// @return storageRetrievalCost 4 SLOAD operations
    /// @return disassemblyCost Bit operations on poolID
    /// @return assemblyThenDisassemblyCost Full round-trip cost
    function comprehensiveGasComparison() external view returns (
        uint256 storageRetrievalCost,
        uint256 disassemblyCost,
        uint256 assemblyThenDisassemblyCost
    ) {
        uint256 gasStart;
        
        // 1. Storage retrieval (4 SLOAD operations)
        gasStart = gasleft();
        address asset0 = poolAsset0[1];
        address asset1 = poolAsset1[1];
        address quoter = poolQuoter[1];
        bytes3 markings = poolMarkings[1];
        storageRetrievalCost = gasStart - gasleft();
        
        // 2. Disassembly only
        uint256 testPoolID = 42955307580170980946467815337668002166680498660974576864971747189779899351040;
        gasStart = gasleft();
        bytes3 disMarkings = bytes3(uint24(testPoolID));
        address disQuoter = address(uint160(testPoolID >> 24));
        address disAsset1 = address(uint160(testPoolID >> 184));
        address disAsset0 = address(uint160(testPoolID >> 344));
        disassemblyCost = gasStart - gasleft();
        
        // 3. Assembly then disassembly (full round-trip)
        gasStart = gasleft();
        uint256 assembledID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        bytes3 roundTripMarkings = bytes3(uint24(assembledID));
        address roundTripQuoter = address(uint160(assembledID >> 24));
        address roundTripAsset1 = address(uint160(assembledID >> 184));
        address roundTripAsset0 = address(uint160(assembledID >> 344));
        assemblyThenDisassemblyCost = gasStart - gasleft();
        
        // Prevent compiler optimization
        assembly {
            let temp1 := add(add(asset0, asset1), add(quoter, markings))
            let temp2 := add(add(disAsset0, disAsset1), add(disQuoter, disMarkings))
            let temp3 := add(add(roundTripAsset0, roundTripAsset1), add(roundTripQuoter, roundTripMarkings))
        }
    }
}