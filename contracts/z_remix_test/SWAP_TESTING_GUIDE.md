# 🔄 PoolManager Swap Testing Guide - Dual Data

## 📋 Overview
Complete guide for testing the `swap` function in PoolManager using dual data quoters in Remix IDE, with detailed gas cost analysis.

## 🎯 Test Objective
- Test swap functionality with dual data (Alpha + Beta market data)
- Measure gas costs for different swap sizes
- Verify pricing accuracy and slippage handling
- Validate pool inventory management

---

## 🚀 Quick Start Setup

### Step 1: Deploy Required Contracts (in order)

```solidity
// 1. Test Tokens
TestTokenA.sol
TestTokenB.sol

// 2. Mock Data Bridges  
MockAlphaDataBridge.sol
MockBetaDataBridge.sol

// 3. Dual Data Quoter
DualDataQuoter.sol

// 4. Pool Manager
PoolManager.sol (constructor: alphaDataBridge, betaDataBridge)

// 5. Test Runner
PoolManagerSwapTester.sol
```

### Step 2: Update Contract Addresses

In `PoolManagerSwapTester.sol`, update these constants:
```solidity
address constant TOKEN_A = 0x...;           // TestTokenA address
address constant TOKEN_B = 0x...;           // TestTokenB address  
address constant POOL_MANAGER = 0x...;      // PoolManager address
address constant DUAL_QUOTER = 0x...;       // DualDataQuoter address
address constant MOCK_ALPHA_BRIDGE = 0x...; // MockAlphaDataBridge address
address constant MOCK_BETA_BRIDGE = 0x...;  // MockBetaDataBridge address
```

---

## 📊 Expected Gas Costs

### Historical Benchmarks (from PoolManager comments):
- **Execution cost**: 67,670 gas
- **Transaction cost**: 77,821 gas

### Expected Dual Data Swap Costs:
```
Small swap (1 ETH):   75,000 - 85,000 gas
Normal swap (10 ETH): 77,000 - 90,000 gas  
Large swap (100 ETH): 80,000 - 95,000 gas
```

### Gas Cost Breakdown:
1. **Base swap logic**: ~45,000 gas
2. **Dual data fetching**: ~15,000 gas  
3. **Pool inventory updates**: ~8,000 gas
4. **Token transfers**: ~10,000 gas
5. **Quoter calculations**: ~12,000 gas

---

## 🧪 Testing Procedure

### Phase 1: Initial Setup
```javascript
1. Deploy all contracts in correct order
2. Mint tokens to test address (1M+ each)
3. Update addresses in PoolManagerSwapTester
4. Deploy PoolManagerSwapTester
5. Call setupTest() to approve tokens
```

### Phase 2: Pool Initialization
```javascript
6. Call addInitialLiquidity()
   - Adds 1000 Token A + 1300 Token B
   - Expected gas: ~170,000 gas
   - Creates pool with dual data marking
```

### Phase 3: Swap Testing
```javascript
7. Call testSwapZeroForOne() 
   - Swaps 10 Token A -> Token B
   - Expected output: ~12.8 Token B
   - Expected gas: 77,000-90,000

8. Call testSwapOneForZero()
   - Swaps 10 Token B -> Token A  
   - Expected output: ~7.7 Token A
   - Expected gas: 77,000-90,000

9. Call testLargeSwap()
   - Swaps 100 Token A -> Token B
   - Tests gas scaling with size
   - Expected gas: 80,000-95,000

10. Call testSmallSwap()
    - Swaps 1 Token A -> Token B
    - Tests minimal gas usage
    - Expected gas: 75,000-85,000
```

### Phase 4: Comprehensive Testing
```javascript
11. Call runFullSwapTest()
    - Executes all swap tests in sequence
    - Returns array of all results
    - Total gas: ~320,000-360,000
```

---

## 🔍 Dual Data Features

### What Makes It "Dual Data"?
1. **Alpha Data**: Spot price + TWAP from alpha bridge
2. **Beta Data**: Spot price from beta bridge  
3. **Sophisticated Pricing**: Combines both sources with spread analysis
4. **Risk Adjustments**: Uses correlation between data sources
5. **Caching**: Transient storage for efficiency within transaction

### Marking Structure (0x00000F):
```
Binary: 000000000000 0000 0000 1 1 1 1
        bucketID    β-ptr α-ptr β α β α
                                def def
Decoded:
- isAlpha: 1 (uses alpha data)
- isBeta: 1 (uses beta data)
- isAlphaDefault: 1 (uses default alpha bridge)
- isBetaDefault: 1 (uses default beta bridge)  
- alphaAddressPointer: 0 (unused when default)
- betaAddressPointer: 0 (unused when default)
- bucketID: 0 (default risk bucket)
```

---

## 📈 Results Analysis

### Gas Efficiency Metrics:
```
Gas per dollar swapped (10 ETH @ $2000):
- Dual data swap: ~4.0 gas per $1
- Simple quoter: ~2.8 gas per $1
- Premium for dual data: ~43% more gas
```

### Price Accuracy:
- **Simple quoter**: Basic constant product formula
- **Dual data**: Sophisticated multi-source pricing
- **Expected premium**: 5-15% better price discovery

### Monitoring Points:
1. **Gas scaling**: Should be roughly linear with amount
2. **Price impact**: Larger swaps should show more slippage  
3. **Inventory changes**: Pool balances should update correctly
4. **Event logs**: All swaps should emit SwapResult events

---

## 🛠 Debugging & Troubleshooting

### Common Issues:

#### 1. "Insufficient balance" errors
```solidity
Solution: Call getUserBalances() to check token balances
Fix: Mint more tokens to test address
```

#### 2. "Insufficient output" errors  
```solidity
Solution: Lower minAmountOut parameter
Check: Pool has enough liquidity for swap size
```

#### 3. High gas costs (>100k)
```solidity
Check: Are you including transaction cost vs execution cost?
Note: First swap after deployment costs more (cold storage)
```

#### 4. Quoter failures
```solidity
Solution: Verify mock bridges are deployed and have data
Check: DualDataQuoter address is correct
```

### Verification Functions:
```javascript
getPoolInventory() - Check pool balances
getUserBalances() - Check user token balances  
calculatePoolID() - Verify pool identification
getConfig() - Confirm all addresses are correct
```

---

## 📋 Test Results Template

```
=== POOLMANAGER SWAP TEST RESULTS ===

Date: ___________
Network: ___________
Block Gas Limit: ___________

SETUP COSTS:
- Deploy contracts: ______ gas total
- Add liquidity: ______ gas
- Setup & approvals: ______ gas

SWAP TEST RESULTS:
Test Name         | Amount In | Amount Out | Gas Used | Gas/ETH
------------------|-----------|------------|----------|--------
ZeroForOne        |    10 ETH |   ____ ETH |   ______ | ______
OneForZero        |    10 ETH |   ____ ETH |   ______ | ______  
Large Swap        |   100 ETH |   ____ ETH |   ______ | ______
Small Swap        |     1 ETH |   ____ ETH |   ______ | ______

EFFICIENCY ANALYSIS:
- Average gas per swap: ______ gas
- Gas scaling factor: ______ (large/small ratio)
- Price impact range: ______ % to ______ %

DUAL DATA PREMIUM:
- Extra gas vs simple: ______ gas (+___%)
- Price improvement: ______ % better discovery
- Worth the premium? _____ (Y/N)

POOL STATE CHANGES:
Initial: Token A: ______ ETH, Token B: ______ ETH  
Final:   Token A: ______ ETH, Token B: ______ ETH
Net change: ±______ ETH, ±______ ETH

NOTES:
_________________________________
_________________________________
_________________________________
```

---

## 🎯 Success Criteria

- [ ] All swaps execute without revert
- [ ] Gas costs within expected ranges (75k-95k)
- [ ] Output amounts meet minimum requirements  
- [ ] Pool inventory updates correctly
- [ ] Dual data pricing shows sophistication
- [ ] Event logs capture all swap details
- [ ] No unexpected gas spikes or failures

---

## 🔬 Advanced Testing

### Custom Scenarios:
1. **Extreme amounts**: Test with 0.001 ETH and 1000 ETH
2. **Market volatility**: Update mock bridge prices mid-test
3. **Multiple swaps**: Execute 10 consecutive swaps
4. **Direction mixing**: Alternate zeroForOne/oneForZero
5. **Bucket testing**: Use different bucketID values (1-9)

### Performance Comparison:
Test the same swaps with:
- SimpleQuoter (no data)
- AlphaDataQuoter (single data)  
- DualDataQuoter (dual data)

Compare gas costs and output amounts to quantify the dual data premium.

---

*Happy Swapping! 🚀*