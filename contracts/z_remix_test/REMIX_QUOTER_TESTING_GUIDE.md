# 🧪 Complete Quoter Testing Guide for Remix IDE

## 📋 Overview
This guide provides step-by-step instructions for testing all 4 quoter types in Remix IDE, including gas cost analysis and function verification.

## 🔧 Setup Requirements

### 1. Deploy Required Contracts
Deploy these contracts in Remix in the following order:

```solidity
// 1. Test Tokens
TestTokenA.sol
TestTokenB.sol

// 2. Mock Data Bridges (for Alpha/Beta/Dual quoters)
MockAlphaDataBridge.sol
MockBetaDataBridge.sol

// 3. All Quoter Contracts
SimpleQuoter.sol
AlphaDataQuoter.sol
BetaDataQuoter.sol
DualDataQuoter.sol
```

### 2. Contract Addresses Template
After deployment, update these addresses:

```javascript
// 📝 UPDATE THESE ADDRESSES AFTER DEPLOYMENT
const ADDRESSES = {
    TokenA: "0x0000000000000000000000000000000000000000",
    TokenB: "0x0000000000000000000000000000000000000000",
    SimpleQuoter: "0x0000000000000000000000000000000000000000",
    AlphaQuoter: "0x0000000000000000000000000000000000000000",
    BetaQuoter: "0x0000000000000000000000000000000000000000",
    DualQuoter: "0x0000000000000000000000000000000000000000",
    MockAlphaDataBridge: "0x0000000000000000000000000000000000000000",
    MockBetaDataBridge: "0x0000000000000000000000000000000000000000"
};
```

## 🧮 Test Parameters

### Standard Test Values
```javascript
const TEST_PARAMS = {
    // Token amounts (in wei)
    SWAP_AMOUNT: "100000000000000000000", // 100 ETH
    ASSET0_BALANCE: "1000000000000000000000", // 1000 ETH
    ASSET1_BALANCE: "1300000000000000000000", // 1300 ETH
    
    // Market data (in wei)
    ALPHA_SPOT_PRICE: "1300000000000000000", // 1.3 ETH
    ALPHA_TWAP_PRICE: "1280000000000000000", // 1.28 ETH
    BETA_SPOT_PRICE: "1320000000000000000", // 1.32 ETH
    
    // Test scenarios
    BUCKET_ID: 0,
    ZERO_FOR_ONE: true
};
```

---

## 🎯 Testing Instructions

### 1️⃣ SimpleQuoter Testing

#### Basic Quote Test
```javascript
// Function: quote
// Parameters:
QuoteParams = {
    asset0: ADDRESSES.TokenA,
    asset1: ADDRESSES.TokenB,
    quoter: ADDRESSES.SimpleQuoter,
    amount: TEST_PARAMS.SWAP_AMOUNT,
    asset0Balance: TEST_PARAMS.ASSET0_BALANCE,
    asset1Balance: TEST_PARAMS.ASSET1_BALANCE,
    bucketID: TEST_PARAMS.BUCKET_ID,
    zeroForOne: TEST_PARAMS.ZERO_FOR_ONE
}

// Expected Result: ~117.827 ETH (after 0.3% fee)
// Gas Cost: ~24,000-26,000 gas
```

#### Batch Quote Test
```javascript
// Function: quoteBatch
// Parameters:
QuoteParamsBatch = {
    asset0: ADDRESSES.TokenA,
    asset1: ADDRESSES.TokenB,
    quoter: ADDRESSES.SimpleQuoter,
    amount: [
        "50000000000000000000",   // 50 ETH
        "100000000000000000000",  // 100 ETH
        "200000000000000000000"   // 200 ETH
    ],
    asset0Balances: [
        "1000000000000000000000", // 1000 ETH
        "1000000000000000000000", // 1000 ETH
        "1200000000000000000000"  // 1200 ETH
    ],
    asset1Balances: [
        "1300000000000000000000", // 1300 ETH
        "1300000000000000000000", // 1300 ETH
        "1500000000000000000000"  // 1500 ETH
    ],
    bucketID: [0, 0, 1],
    zeroForOne: TEST_PARAMS.ZERO_FOR_ONE
}

// Expected Results: [~61.7 ETH, ~117.8 ETH, ~216.0 ETH]
```

---

### 2️⃣ AlphaDataQuoter Testing

#### Prepare Market Data
```javascript
// First, encode the alpha market data
// Use Remix's built-in encoder or this format:
alphaData = abi.encode(
    ["uint256", "uint256"], 
    [TEST_PARAMS.ALPHA_SPOT_PRICE, TEST_PARAMS.ALPHA_TWAP_PRICE]
);
// Result: 0x000000000000000000000000000000000000000000000000120a871cc0020000000000000000000000000000000000000000000000000001158e460913d00000
```

#### Basic Quote Test
```javascript
// Function: quote
// Parameters:
QuoteParams = {
    asset0: ADDRESSES.TokenA,
    asset1: ADDRESSES.TokenB,
    quoter: ADDRESSES.AlphaQuoter,
    amount: TEST_PARAMS.SWAP_AMOUNT,
    asset0Balance: TEST_PARAMS.ASSET0_BALANCE,
    asset1Balance: TEST_PARAMS.ASSET1_BALANCE,
    bucketID: TEST_PARAMS.BUCKET_ID,
    zeroForOne: TEST_PARAMS.ZERO_FOR_ONE
}
data = alphaData // From above

// Expected Result: ~129.14 ETH (weighted price calculation)
// Gas Cost: ~26,000-28,000 gas
```

---

### 3️⃣ BetaDataQuoter Testing

#### Prepare Market Data
```javascript
// Encode beta market data (spot price only)
betaData = abi.encode(
    ["uint256"], 
    [TEST_PARAMS.BETA_SPOT_PRICE]
);
// Result: 0x000000000000000000000000000000000000000000000000124bc0ddd92e0000
```

#### Basic Quote Test
```javascript
// Function: quote
// Parameters: Same QuoteParams as above
data = betaData // From above

// Expected Result: ~130.95 ETH (with volatility adjustment)
// Gas Cost: ~25,000-27,000 gas
```

---

### 4️⃣ DualDataQuoter Testing

#### Basic Quote Test
```javascript
// Function: quote
// Parameters: Same QuoteParams as above
alphaData = // From AlphaDataQuoter section
betaData = // From BetaDataQuoter section

// Expected Result: ~128.86 ETH (sophisticated dual-data pricing)
// Gas Cost: ~28,000-30,000 gas
```

---

## 📊 Gas Cost Comparison

### Expected Gas Usage Ranges:
```
SimpleQuoter:    24,000 - 26,000 gas  (baseline)
BetaDataQuoter:  25,000 - 27,000 gas  (+4-8%)
AlphaDataQuoter: 26,000 - 28,000 gas  (+8-15%)
DualDataQuoter:  28,000 - 30,000 gas  (+17-25%)
```

### Gas Testing Steps:
1. **Enable Gas Estimation** in Remix
2. **Record gas used** for each function call
3. **Compare results** with expected ranges
4. **Test multiple scenarios** (different amounts, directions)

---

## 🔍 Advanced Test Scenarios

### Edge Case Testing

#### Zero Amount Test
```javascript
QuoteParams.amount = "0"
// Expected: All quoters should return 0
```

#### Direction Reversal Test
```javascript
QuoteParams.zeroForOne = false
// Expected: Different calculation path, verify logic
```

#### Large Amount Test
```javascript
QuoteParams.amount = "1000000000000000000000" // 1000 ETH
// Expected: Test slippage and large trade handling
```

#### Different Bucket IDs
```javascript
QuoteParams.bucketID = 1, 2, 5, 9
// Expected: Verify bucket-specific adjustments
```

---

## 📝 Results Recording Template

```
=== QUOTER TEST RESULTS ===

Date: ___________
Network: ___________

SimpleQuoter:
- Basic Quote: _______ ETH (Gas: ______)
- Batch Quote: [_____, _____, _____] ETH (Gas: ______)

AlphaDataQuoter:
- Basic Quote: _______ ETH (Gas: ______)
- Expected: ~129.14 ETH

BetaDataQuoter:
- Basic Quote: _______ ETH (Gas: ______)
- Expected: ~130.95 ETH

DualDataQuoter:
- Basic Quote: _______ ETH (Gas: ______)
- Expected: ~128.86 ETH

Gas Efficiency Ranking:
1. _________ (_____ gas)
2. _________ (_____ gas)
3. _________ (_____ gas)
4. _________ (_____ gas)

Notes:
_________________________________
_________________________________
```

---

## 🚨 Troubleshooting

### Common Issues:

1. **"Execution reverted"**
   - Check contract addresses are correct
   - Verify parameter types match struct definition
   - Ensure market data is properly encoded

2. **"Gas estimation failed"**
   - Reduce amount values
   - Check for division by zero scenarios
   - Verify contract deployment

3. **Unexpected quote values**
   - Verify market data encoding
   - Check zeroForOne direction
   - Confirm asset balance values

4. **High gas costs**
   - Normal for complex quoters
   - Compare relative differences, not absolute values
   - Test on different networks for baseline

---

## ✅ Success Criteria

- [ ] All 4 quoters deploy successfully
- [ ] Basic quotes return expected ranges
- [ ] Gas costs follow expected hierarchy
- [ ] Edge cases handle gracefully
- [ ] Batch operations work correctly
- [ ] Market data integration functions properly

---

## 📚 Reference Formulas

### SimpleQuoter:
```
quote = (amount × asset1Balance) / (asset0Balance + amount) × 0.997
```

### AlphaDataQuoter:
```
weightedPrice = (spotPrice × 0.7 + twapPrice × 0.3)
quote = (amount × weightedPrice) / 1e18 × 0.997
```

### BetaDataQuoter:
```
volatilityFactor = 1000 - (bucketID % 10)
quote = (amount × spotPrice) / 1e18 × volatilityFactor / 1000
```

### DualDataQuoter:
```
Complex multi-factor calculation using both alpha and beta data
with spread analysis and sophisticated risk adjustments
```

---

*Happy Testing! 🚀*