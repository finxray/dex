// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteParams, QuoteParamsBatch} from "../structs/QuoteParams.sol";

/// @title TestQuoterGasOptimization - Compare Struct vs Simple Parameters
/// @notice Test contract to measure gas differences between struct and simple parameter approaches
contract TestQuoterGasOptimization {

    /*//////////////////////////////////////////////////////////////
                        CURRENT STRUCT APPROACH
    //////////////////////////////////////////////////////////////*/

    /// @notice Current approach using flattened structs (optimized)
    function quoterWithStruct(
        address asset0,
        address asset1,
        address quoter,
        uint256 amount,
        uint128 asset0Balance,
        uint128 asset1Balance,
        uint16 bucketID,
        bool zeroForOne
    ) external pure returns (uint256 quote) {
        // Simulate optimized QuoteRequester logic - no nesting!
        QuoteParams memory params = QuoteParams({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: amount,
            asset0Balance: asset0Balance,
            asset1Balance: asset1Balance,
            bucketID: bucketID,
            zeroForOne: zeroForOne
        });

        // Simulate quoter call
        return simulateQuoterCall(params);
    }

    /// @notice Simulate quoter external call with struct
    function simulateQuoterCall(QuoteParams memory params) internal pure returns (uint256) {
        // Simulate some computation using struct fields
        return params.amount + params.asset0Balance + params.asset1Balance + params.bucketID;
    }

    /*//////////////////////////////////////////////////////////////
                        OPTIMIZED SIMPLE APPROACH
    //////////////////////////////////////////////////////////////*/

    /// @notice Optimized approach using simple parameters
    function quoterWithSimpleParams(
        address asset0,
        address asset1,
        address quoter,
        uint256 amount,
        uint128 asset0Balance,
        uint128 asset1Balance,
        uint16 bucketID,
        bool zeroForOne
    ) external pure returns (uint256 quote) {
        // Direct call without struct creation
        return simulateQuoterCallSimple(
            asset0,
            asset1,
            quoter,
            amount,
            asset0Balance,
            asset1Balance,
            bucketID,
            zeroForOne
        );
    }

    /// @notice Simulate quoter external call with simple parameters
    function simulateQuoterCallSimple(
        address asset0,
        address asset1,
        address quoter,
        uint256 amount,
        uint128 asset0Balance,
        uint128 asset1Balance,
        uint16 bucketID,
        bool zeroForOne
    ) internal pure returns (uint256) {
        // Simulate same computation without structs
        return amount + asset0Balance + asset1Balance + bucketID;
    }

    /*//////////////////////////////////////////////////////////////
                        BATCH OPERATIONS COMPARISON
    //////////////////////////////////////////////////////////////*/

    /// @notice Current batch approach with flattened struct (optimized)
    function batchQuoterWithStruct(
        address asset0,
        address asset1,
        address quoter,
        uint256[] calldata amounts,
        uint128[] calldata asset0Balances,
        uint128[] calldata asset1Balances,
        uint16[] calldata bucketIDs,
        bool zeroForOne
    ) external pure returns (uint256[] memory quotes) {
        // Flattened struct - no nesting!
        QuoteParamsBatch memory params = QuoteParamsBatch({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: amounts,
            asset0Balances: asset0Balances,
            asset1Balances: asset1Balances,
            bucketID: bucketIDs,
            zeroForOne: zeroForOne
        });

        return simulateBatchQuoterCall(params);
    }

    /// @notice Optimized batch approach without struct
    function batchQuoterWithSimpleParams(
        address asset0,
        address asset1,
        address quoter,
        uint256[] calldata amounts,
        uint128[] calldata asset0Balances,
        uint128[] calldata asset1Balances,
        uint16[] calldata bucketIDs,
        bool zeroForOne
    ) external pure returns (uint256[] memory quotes) {
        return simulateBatchQuoterCallSimple(
            asset0,
            asset1,
            quoter,
            amounts,
            asset0Balances,
            asset1Balances,
            bucketIDs,
            zeroForOne
        );
    }

    function simulateBatchQuoterCall(QuoteParamsBatch memory params) internal pure returns (uint256[] memory) {
        uint256[] memory quotes = new uint256[](params.amount.length);
        for (uint i = 0; i < params.amount.length; i++) {
            quotes[i] = params.amount[i] + params.asset0Balances[i] + params.asset1Balances[i] + params.bucketID[i];
        }
        return quotes;
    }

    function simulateBatchQuoterCallSimple(
        address,
        address,
        address,
        uint256[] calldata amounts,
        uint128[] calldata asset0Balances,
        uint128[] calldata asset1Balances,
        uint16[] calldata bucketIDs,
        bool
    ) internal pure returns (uint256[] memory) {
        uint256[] memory quotes = new uint256[](amounts.length);
        for (uint i = 0; i < amounts.length; i++) {
            quotes[i] = amounts[i] + asset0Balances[i] + asset1Balances[i] + bucketIDs[i];
        }
        return quotes;
    }

    /*//////////////////////////////////////////////////////////////
                        GAS MEASUREMENT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Compare gas costs: struct vs simple parameters
    function compareGasCosts() external view returns (
        uint256 structCost,
        uint256 simpleCost,
        uint256 gasSaved,
        uint256 percentSaved
    ) {
        uint256 gasStart;

        // Test struct approach
        gasStart = gasleft();
        this.quoterWithStruct(
            address(0x1111111111111111111111111111111111111111),
            address(0x2222222222222222222222222222222222222222),
            address(0x3333333333333333333333333333333333333333),
            1000000000000000000,
            500000000000000000,
            750000000000000000,
            123,
            true
        );
        structCost = gasStart - gasleft();

        // Test simple approach
        gasStart = gasleft();
        this.quoterWithSimpleParams(
            address(0x1111111111111111111111111111111111111111),
            address(0x2222222222222222222222222222222222222222),
            address(0x3333333333333333333333333333333333333333),
            1000000000000000000,
            500000000000000000,
            750000000000000000,
            123,
            true
        );
        simpleCost = gasStart - gasleft();

        gasSaved = structCost > simpleCost ? structCost - simpleCost : 0;
        percentSaved = structCost > 0 ? (gasSaved * 10000) / structCost : 0; // Basis points (1% = 100)
    }

    /// @notice Compare batch operation gas costs
    function compareBatchGasCosts() external view returns (
        uint256 structBatchCost,
        uint256 simpleBatchCost,
        uint256 batchGasSaved,
        uint256 batchPercentSaved
    ) {
        uint256 gasStart;

        // Prepare test data
        uint256[] memory amounts = new uint256[](3);
        uint128[] memory asset0Balances = new uint128[](3);
        uint128[] memory asset1Balances = new uint128[](3);
        uint16[] memory bucketIDs = new uint16[](3);

        amounts[0] = 1000000000000000000;
        amounts[1] = 2000000000000000000;
        amounts[2] = 3000000000000000000;
        
        asset0Balances[0] = 500000000000000000;
        asset0Balances[1] = 600000000000000000;
        asset0Balances[2] = 700000000000000000;
        
        asset1Balances[0] = 750000000000000000;
        asset1Balances[1] = 850000000000000000;
        asset1Balances[2] = 950000000000000000;
        
        bucketIDs[0] = 123;
        bucketIDs[1] = 456;
        bucketIDs[2] = 789;

        // Test struct batch approach
        gasStart = gasleft();
        this.batchQuoterWithStruct(
            address(0x1111111111111111111111111111111111111111),
            address(0x2222222222222222222222222222222222222222),
            address(0x3333333333333333333333333333333333333333),
            amounts,
            asset0Balances,
            asset1Balances,
            bucketIDs,
            true
        );
        structBatchCost = gasStart - gasleft();

        // Test simple batch approach
        gasStart = gasleft();
        this.batchQuoterWithSimpleParams(
            address(0x1111111111111111111111111111111111111111),
            address(0x2222222222222222222222222222222222222222),
            address(0x3333333333333333333333333333333333333333),
            amounts,
            asset0Balances,
            asset1Balances,
            bucketIDs,
            true
        );
        simpleBatchCost = gasStart - gasleft();

        batchGasSaved = structBatchCost > simpleBatchCost ? structBatchCost - simpleBatchCost : 0;
        batchPercentSaved = structBatchCost > 0 ? (batchGasSaved * 10000) / structBatchCost : 0; // Basis points
    }

    /*//////////////////////////////////////////////////////////////
                        INTERFACE SIMULATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Simulate current quoter interface with struct
    function simulateCurrentInterface(QuoteParams memory params) external pure returns (uint256) {
        // Simulate the work done in current quoter interfaces
        return params.amount + uint256(params.asset0Balance) + uint256(params.asset1Balance);
    }

    /// @notice Simulate optimized quoter interface without struct
    function simulateOptimizedInterface(
        address asset0,
        address asset1,
        address quoter,
        uint256 amount,
        uint128 asset0Balance,
        uint128 asset1Balance,
        uint16 bucketID,
        bool zeroForOne
    ) external pure returns (uint256) {
        // Same computation without struct overhead
        return amount + uint256(asset0Balance) + uint256(asset1Balance);
    }

    /// @notice Test memory allocation overhead
    function testMemoryAllocation() external pure returns (
        uint256 structCreationCost,
        uint256 directUsageCost
    ) {
        uint256 gasStart;

        // Test flattened struct creation and usage
        gasStart = gasleft();
        QuoteParams memory params = QuoteParams({
            asset0: address(0x1111111111111111111111111111111111111111),
            asset1: address(0x2222222222222222222222222222222222222222),
            quoter: address(0x3333333333333333333333333333333333333333),
            amount: 1000000000000000000,
            asset0Balance: 500000000000000000,
            asset1Balance: 750000000000000000,
            bucketID: 123,
            zeroForOne: true
        });
        uint256 result1 = params.amount + params.asset0Balance;
        structCreationCost = gasStart - gasleft();

        // Test direct usage
        gasStart = gasleft();
        uint256 result2 = 1000000000000000000 + 500000000000000000;
        directUsageCost = gasStart - gasleft();

        // Prevent compiler optimization
        assembly {
            let temp := add(result1, result2)
        }
    }
}