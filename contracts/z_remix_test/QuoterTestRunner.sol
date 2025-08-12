// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {QuoteParams, QuoteParamsBatch} from "../structs/QuoteParams.sol";
import {IQuoterNoData} from "../interfaces/internal/quoters/IQuoterNoData.sol";
import {IQuoterSingleData} from "../interfaces/internal/quoters/IQuoterSingleData.sol";
import {IQuoterDualData} from "../interfaces/internal/quoters/IQuoterDualData.sol";

/**
 * @title QuoterTestRunner
 * @notice Single contract for testing all 4 quoter types in Remix
 * @dev Copy-paste this into Remix and update addresses after deployment
 */
contract QuoterTestRunner {
    
    // 📝 UPDATE THESE ADDRESSES AFTER DEPLOYMENT
    address constant TOKEN_A = 0x0000000000000000000000000000000000000000;
    address constant TOKEN_B = 0x0000000000000000000000000000000000000000;
    address constant SIMPLE_QUOTER = 0x0000000000000000000000000000000000000000;
    address constant ALPHA_QUOTER = 0x0000000000000000000000000000000000000000;
    address constant BETA_QUOTER = 0x0000000000000000000000000000000000000000;
    address constant DUAL_QUOTER = 0x0000000000000000000000000000000000000000;
    
    // Test constants
    uint256 constant SWAP_AMOUNT = 100 ether;
    uint128 constant ASSET0_BALANCE = 1000 ether;
    uint128 constant ASSET1_BALANCE = 1300 ether;
    uint16 constant BUCKET_ID = 0;
    bool constant ZERO_FOR_ONE = true;
    
    // Market data constants
    uint256 constant ALPHA_SPOT_PRICE = 1.3 ether;
    uint256 constant ALPHA_TWAP_PRICE = 1.28 ether;
    uint256 constant BETA_SPOT_PRICE = 1.32 ether;
    
    // Events for logging results
    event QuoteResult(string quoterType, uint256 quote, uint256 gasUsed);
    event BatchQuoteResult(string quoterType, uint256[] quotes, uint256 gasUsed);
    
    /**
     * @notice Test SimpleQuoter - No external data required
     * @return quote The calculated quote
     */
    function testSimpleQuoter() external returns (uint256 quote) {
        uint256 gasStart = gasleft();
        
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: SIMPLE_QUOTER,
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: ZERO_FOR_ONE
        });
        
        quote = IQuoterNoData(SIMPLE_QUOTER).quote(params);
        uint256 gasUsed = gasStart - gasleft();
        
        emit QuoteResult("SimpleQuoter", quote, gasUsed);
        return quote;
    }
    
    /**
     * @notice Test SimpleQuoter batch functionality
     * @return quotes Array of calculated quotes
     */
    function testSimpleQuoterBatch() external returns (uint256[] memory quotes) {
        uint256 gasStart = gasleft();
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 50 ether;
        amounts[1] = 100 ether;
        amounts[2] = 200 ether;
        
        uint128[] memory asset0Balances = new uint128[](3);
        asset0Balances[0] = 1000 ether;
        asset0Balances[1] = 1000 ether;
        asset0Balances[2] = 1200 ether;
        
        uint128[] memory asset1Balances = new uint128[](3);
        asset1Balances[0] = 1300 ether;
        asset1Balances[1] = 1300 ether;
        asset1Balances[2] = 1500 ether;
        
        uint16[] memory bucketIDs = new uint16[](3);
        bucketIDs[0] = 0;
        bucketIDs[1] = 0;
        bucketIDs[2] = 1;
        
        QuoteParamsBatch memory params = QuoteParamsBatch({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: SIMPLE_QUOTER,
            amount: amounts,
            asset0Balances: asset0Balances,
            asset1Balances: asset1Balances,
            bucketID: bucketIDs,
            zeroForOne: ZERO_FOR_ONE
        });
        
        quotes = IQuoterNoData(SIMPLE_QUOTER).quoteBatch(params);
        uint256 gasUsed = gasStart - gasleft();
        
        emit BatchQuoteResult("SimpleQuoter", quotes, gasUsed);
        return quotes;
    }
    
    /**
     * @notice Test AlphaDataQuoter - Requires alpha market data
     * @return quote The calculated quote
     */
    function testAlphaDataQuoter() external returns (uint256 quote) {
        uint256 gasStart = gasleft();
        
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: ALPHA_QUOTER,
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: ZERO_FOR_ONE
        });
        
        // Encode alpha market data (spot price and TWAP)
        bytes memory alphaData = abi.encode(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
        
        quote = IQuoterSingleData(ALPHA_QUOTER).quote(params, alphaData);
        uint256 gasUsed = gasStart - gasleft();
        
        emit QuoteResult("AlphaDataQuoter", quote, gasUsed);
        return quote;
    }
    
    /**
     * @notice Test BetaDataQuoter - Requires beta market data
     * @return quote The calculated quote
     */
    function testBetaDataQuoter() external returns (uint256 quote) {
        uint256 gasStart = gasleft();
        
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: BETA_QUOTER,
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: ZERO_FOR_ONE
        });
        
        // Encode beta market data (spot price only)
        bytes memory betaData = abi.encode(BETA_SPOT_PRICE);
        
        quote = IQuoterSingleData(BETA_QUOTER).quote(params, betaData);
        uint256 gasUsed = gasStart - gasleft();
        
        emit QuoteResult("BetaDataQuoter", quote, gasUsed);
        return quote;
    }
    
    /**
     * @notice Test DualDataQuoter - Requires both alpha and beta market data
     * @return quote The calculated quote
     */
    function testDualDataQuoter() external returns (uint256 quote) {
        uint256 gasStart = gasleft();
        
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: DUAL_QUOTER,
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: ZERO_FOR_ONE
        });
        
        // Encode market data
        bytes memory alphaData = abi.encode(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
        bytes memory betaData = abi.encode(BETA_SPOT_PRICE);
        
        quote = IQuoterDualData(DUAL_QUOTER).quote(params, alphaData, betaData);
        uint256 gasUsed = gasStart - gasleft();
        
        emit QuoteResult("DualDataQuoter", quote, gasUsed);
        return quote;
    }
    
    /**
     * @notice Run all quoter tests in sequence
     * @return results Array of quotes from all quoters
     */
    function testAllQuoters() external returns (uint256[4] memory results) {
        results[0] = this.testSimpleQuoter();
        results[1] = this.testAlphaDataQuoter();
        results[2] = this.testBetaDataQuoter();
        results[3] = this.testDualDataQuoter();
        return results;
    }
    
    /**
     * @notice Test edge case: zero amount
     * @return results Array of quotes with zero amount
     */
    function testZeroAmount() external returns (uint256[4] memory results) {
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: address(0), // Will be overridden
            amount: 0, // Zero amount
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: ZERO_FOR_ONE
        });
        
        bytes memory alphaData = abi.encode(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
        bytes memory betaData = abi.encode(BETA_SPOT_PRICE);
        
        // Test all quoters with zero amount
        params.quoter = SIMPLE_QUOTER;
        results[0] = IQuoterNoData(SIMPLE_QUOTER).quote(params);
        
        params.quoter = ALPHA_QUOTER;
        results[1] = IQuoterSingleData(ALPHA_QUOTER).quote(params, alphaData);
        
        params.quoter = BETA_QUOTER;
        results[2] = IQuoterSingleData(BETA_QUOTER).quote(params, betaData);
        
        params.quoter = DUAL_QUOTER;
        results[3] = IQuoterDualData(DUAL_QUOTER).quote(params, alphaData, betaData);
        
        return results;
    }
    
    /**
     * @notice Test edge case: reverse direction (oneForZero)
     * @return results Array of quotes in reverse direction
     */
    function testReverseDirection() external returns (uint256[4] memory results) {
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: address(0), // Will be overridden
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: false // Reverse direction
        });
        
        bytes memory alphaData = abi.encode(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
        bytes memory betaData = abi.encode(BETA_SPOT_PRICE);
        
        // Test all quoters in reverse direction
        params.quoter = SIMPLE_QUOTER;
        results[0] = IQuoterNoData(SIMPLE_QUOTER).quote(params);
        
        params.quoter = ALPHA_QUOTER;
        results[1] = IQuoterSingleData(ALPHA_QUOTER).quote(params, alphaData);
        
        params.quoter = BETA_QUOTER;
        results[2] = IQuoterSingleData(BETA_QUOTER).quote(params, betaData);
        
        params.quoter = DUAL_QUOTER;
        results[3] = IQuoterDualData(DUAL_QUOTER).quote(params, alphaData, betaData);
        
        return results;
    }
    
    /**
     * @notice Test different bucket IDs (0-9)
     * @param bucketId The bucket ID to test
     * @return results Array of quotes for the specified bucket
     */
    function testDifferentBucket(uint16 bucketId) external returns (uint256[4] memory results) {
        require(bucketId <= 9, "Bucket ID must be 0-9");
        
        QuoteParams memory params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: address(0), // Will be overridden
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: bucketId,
            zeroForOne: ZERO_FOR_ONE
        });
        
        bytes memory alphaData = abi.encode(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
        bytes memory betaData = abi.encode(BETA_SPOT_PRICE);
        
        // Test all quoters with specified bucket
        params.quoter = SIMPLE_QUOTER;
        results[0] = IQuoterNoData(SIMPLE_QUOTER).quote(params);
        
        params.quoter = ALPHA_QUOTER;
        results[1] = IQuoterSingleData(ALPHA_QUOTER).quote(params, alphaData);
        
        params.quoter = BETA_QUOTER;
        results[2] = IQuoterSingleData(BETA_QUOTER).quote(params, betaData);
        
        params.quoter = DUAL_QUOTER;
        results[3] = IQuoterDualData(DUAL_QUOTER).quote(params, alphaData, betaData);
        
        return results;
    }
    
    /**
     * @notice Get encoded market data for manual testing
     * @return alphaData Encoded alpha market data
     * @return betaData Encoded beta market data
     */
    function getEncodedMarketData() external pure returns (bytes memory alphaData, bytes memory betaData) {
        alphaData = abi.encode(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
        betaData = abi.encode(BETA_SPOT_PRICE);
        return (alphaData, betaData);
    }
    
    /**
     * @notice Get standard test parameters for manual testing
     * @return params Standard QuoteParams structure
     */
    function getStandardParams() external pure returns (QuoteParams memory params) {
        params = QuoteParams({
            asset0: TOKEN_A,
            asset1: TOKEN_B,
            quoter: address(0), // Set manually
            amount: SWAP_AMOUNT,
            asset0Balance: ASSET0_BALANCE,
            asset1Balance: ASSET1_BALANCE,
            bucketID: BUCKET_ID,
            zeroForOne: ZERO_FOR_ONE
        });
        return params;
    }
}

/**
 * @title Expected Results Reference
 * @notice Use these values to verify your test results
 * 
 * EXPECTED QUOTE RESULTS (approximate):
 * - SimpleQuoter: ~117.827 ETH (after 0.3% fee)
 * - AlphaDataQuoter: ~129.14 ETH (weighted price calculation)
 * - BetaDataQuoter: ~130.95 ETH (with volatility adjustment)
 * - DualDataQuoter: ~128.86 ETH (sophisticated dual-data pricing)
 * 
 * EXPECTED GAS USAGE:
 * - SimpleQuoter: ~24,000-26,000 gas
 * - AlphaDataQuoter: ~26,000-28,000 gas
 * - BetaDataQuoter: ~25,000-27,000 gas
 * - DualDataQuoter: ~28,000-30,000 gas
 * 
 * TESTING STEPS:
 * 1. Deploy all required contracts (tokens, quoters, mock bridges)
 * 2. Update contract addresses at the top of this file
 * 3. Deploy this QuoterTestRunner contract
 * 4. Call test functions and compare results with expected values
 * 5. Monitor gas usage in Remix transaction logs
 * 6. Test edge cases with provided functions
 */