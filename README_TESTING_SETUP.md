# Quoter Testing Setup Guide

## Current Status

The project has compilation issues due to missing dependencies. Here's how to proceed:

## Option 1: Fix Dependencies (Recommended)

1. **Create missing files:**
   ```bash
   # Create the missing Delta.sol file
   touch contracts/structs/Delta.sol
   
   # Add basic content to Delta.sol
   echo "// SPDX-License-Identifier: MIT
   pragma solidity ^0.8.30;
   
   struct Delta {
       int128 amount0;
       int128 amount1;
   }" > contracts/structs/Delta.sol
   ```

2. **Create missing ERC6909Extended.sol:**
   ```bash
   # This should be created based on your ERC6909 implementation
   # For now, create a minimal version or copy from OpenZeppelin
   ```

3. **Install missing dependencies:**
   ```bash
   npm install
   npx hardhat compile
   ```

## Option 2: Use Focused Testing (Current Setup)

I've created a focused testing environment:

1. **Files created:**
   - `hardhat-quoters.config.js` - Focused Hardhat config
   - `contracts-focused/` - Directory with only essential contracts
   - `test/SimpleQuoterTest.js` - Minimal test example

2. **To run focused tests:**
   ```bash
   # Try compiling with focused config
   npx hardhat compile --config hardhat-quoters.config.js
   
   # Run minimal test
   npx hardhat test test/SimpleQuoterTest.js --config hardhat-quoters.config.js
   ```

## Option 3: Manual Testing (Fallback)

If compilation continues to fail, you can:

1. **Use Remix IDE:**
   - Copy individual quoter contracts to Remix
   - Deploy and test manually using the instruction file
   - Use the markings and parameters from `QUOTER_TESTING_INSTRUCTIONS.md`

2. **Create standalone contracts:**
   - Extract quoter logic into self-contained contracts
   - Remove complex dependencies
   - Test core functionality

## Current Test Structure

The minimal test (`SimpleQuoterTest.js`) demonstrates:
- How to deploy quoter contracts
- Parameter structure for testing
- Manual calculation verification
- Error handling for compilation issues

## Next Steps

1. **Resolve compilation errors** by creating missing dependency files
2. **Run the full test suite** once compilation works
3. **Use the comprehensive test file** (`Quoters.test.js`) for complete coverage

## Key Files for Testing

- `contracts/quoters/` - All quoter implementations
- `test/Quoters.test.js` - Complete test suite (needs compilation fix)
- `test/SimpleQuoterTest.js` - Minimal working test
- `QUOTER_TESTING_INSTRUCTIONS.md` - Manual testing guide

## Manual Calculation Examples

For SimpleQuoter with zeroForOne = true:
```
quote = (amount * asset1Balance) / (asset0Balance + amount) * 997 / 1000

Example:
- amount = 100 ETH
- asset0Balance = 1000 ETH  
- asset1Balance = 1300 ETH
- quote = (100 * 1300) / (1000 + 100) * 0.997 = ~117.45 ETH
```

This gives you multiple paths forward depending on your preference for fixing dependencies vs. using focused testing.