# Quoter Testing Instructions

## Overview
This guide provides comprehensive instructions for testing all quoter types in the DEX system using Remix IDE. The system supports four types of quoters:

1. **SimpleQuoter** (IQuoterNoData) - Uses only on-chain data
2. **AlphaDataQuoter** (IQuoterSingleData) - Uses alpha market data (spot + TWAP)
3. **BetaDataQuoter** (IQuoterSingleData) - Uses beta market data (spot only)
4. **DualDataQuoter** (IQuoterDualData) - Uses both alpha and beta market data

## Prerequisites
- Deploy TestTokenA and TestTokenB contracts
- Have market data provider addresses ready (you'll need to provide real addresses)
- Understanding of marking system for routing quoters

## 1. Contract Deployment Order

### Step 1.1: Deploy Test Tokens
```solidity
// Deploy TestTokenA.sol
// Deploy TestTokenB.sol
// Note down their addresses as TOKEN_A and TOKEN_B
```

### Step 1.2: Deploy Market Data Providers
```solidity
// You need to deploy or have addresses for:
// - ALPHA_MARKET_DATA_ADDRESS (provides spot price + TWAP)
// - BETA_MARKET_DATA_ADDRESS (provides spot price only)
// These will be provided by you as they have specific implementations
```

### Step 1.3: Deploy Quoters
```solidity
// Deploy in this order:
1. SimpleQuoter.sol -> SIMPLE_QUOTER_ADDRESS
2. AlphaDataQuoter.sol -> ALPHA_QUOTER_ADDRESS  
3. BetaDataQuoter.sol -> BETA_QUOTER_ADDRESS
4. DualDataQuoter.sol -> DUAL_QUOTER_ADDRESS
```

### Step 1.4: Deploy QuoteRequester
```solidity
// Constructor parameters:
QuoteRequester(
    ALPHA_MARKET_DATA_ADDRESS,  // defaultAlpha
    BETA_MARKET_DATA_ADDRESS    // defaultBeta
)
// Note down as QUOTE_REQUESTER_ADDRESS
```

## 2. Market Data Setup

### Step 2.1: Add Alternative Market Data Addresses (Optional)
```solidity
// If you have alternative market data providers:
quoteRequester.addAlphaMarketAddress(1, ALTERNATIVE_ALPHA_ADDRESS);
quoteRequester.addBetaMarketAddress(1, ALTERNATIVE_BETA_ADDRESS);
```

## 3. Understanding Markings

Markings are 3-byte values that encode routing information:

### Marking Structure (24 bits total):
- **Bit 0**: `isAlpha` - Whether alpha data is required
- **Bit 1**: `isBeta` - Whether beta data is required  
- **Bit 2**: `isAlphaDefault` - Use default alpha address (true) or storage pointer (false)
- **Bit 3**: `isBetaDefault` - Use default beta address (true) or storage pointer (false)
- **Bits 4-7**: `alphaAddressPointer` - Storage index (0-15) for alpha address
- **Bits 8-11**: `betaAddressPointer` - Storage index (0-15) for beta address
- **Bits 12-23**: `bucketID` - Bucket identifier (0-4095)

### Pre-calculated Marking Examples:

#### For SimpleQuoter (No Data Required):
```solidity
bytes3 SIMPLE_MARKING = 0x000000;  // No alpha, no beta, bucketID = 0
bytes3 SIMPLE_MARKING_BUCKET_100 = 0x064000;  // No alpha, no beta, bucketID = 100
```

#### For AlphaDataQuoter (Alpha Data Only):
```solidity
bytes3 ALPHA_DEFAULT_MARKING = 0x000005;  // Alpha=true, default=true, bucketID = 0
bytes3 ALPHA_CUSTOM_MARKING = 0x001001;   // Alpha=true, default=false, pointer=1, bucketID = 0
bytes3 ALPHA_BUCKET_50_MARKING = 0x032005; // Alpha=true, default=true, bucketID = 50
```

#### For BetaDataQuoter (Beta Data Only):
```solidity
bytes3 BETA_DEFAULT_MARKING = 0x00000A;   // Beta=true, default=true, bucketID = 0
bytes3 BETA_CUSTOM_MARKING = 0x001102;    // Beta=true, default=false, pointer=1, bucketID = 0
bytes3 BETA_BUCKET_75_MARKING = 0x04B00A; // Beta=true, default=true, bucketID = 75
```

#### For DualDataQuoter (Both Alpha and Beta):
```solidity
bytes3 DUAL_DEFAULT_MARKING = 0x00000F;   // Both=true, both default=true, bucketID = 0
bytes3 DUAL_CUSTOM_MARKING = 0x001103;    // Both=true, both default=false, pointers=1, bucketID = 0
bytes3 DUAL_BUCKET_200_MARKING = 0x0C800F; // Both=true, both default=true, bucketID = 200
```

## 4. Testing Scenarios

### Test Setup Parameters:
```solidity
address TOKEN_A = YOUR_TOKEN_A_ADDRESS;
address TOKEN_B = YOUR_TOKEN_B_ADDRESS;
uint128 ASSET0_BALANCE = 1000000000000000000000; // 1000 tokens
uint128 ASSET1_BALANCE = 1300000000000000000000; // 1300 tokens (1.3 ratio)
uint256 SWAP_AMOUNT = 100000000000000000000;     // 100 tokens
```

### Scenario 1: Test SimpleQuoter (No External Data)

#### Single Quote Test:
```solidity
// Create SwapParams for SimpleQuoter
SwapParams memory params = SwapParams({
    asset0: TOKEN_A,
    asset1: TOKEN_B,
    quoter: SIMPLE_QUOTER_ADDRESS,
    amount: [SWAP_AMOUNT],
    zeroForOne: true,  // Swapping TOKEN_A for TOKEN_B
    marking: [SIMPLE_MARKING]
});

// Call getQuote through QuoteRequester
(uint256 quote, uint256 poolID) = quoteRequester.getQuote(
    params,
    ASSET0_BALANCE,
    ASSET1_BALANCE
);

// Expected: quote ≈ 99.7 tokens (with 0.3% fee)
```

#### Batch Quote Test:
```solidity
uint256[] memory amounts = [
    50000000000000000000,   // 50 tokens
    100000000000000000000,  // 100 tokens
    200000000000000000000   // 200 tokens
];

SwapParams memory batchParams = SwapParams({
    asset0: TOKEN_A,
    asset1: TOKEN_B,
    quoter: SIMPLE_QUOTER_ADDRESS,
    amount: amounts,
    zeroForOne: true,
    marking: [SIMPLE_MARKING, SIMPLE_MARKING, SIMPLE_MARKING]
});

uint128[] memory asset0Balances = [ASSET0_BALANCE, ASSET0_BALANCE, ASSET0_BALANCE];
uint128[] memory asset1Balances = [ASSET1_BALANCE, ASSET1_BALANCE, ASSET1_BALANCE];

(uint256[] memory quotes, uint256[] memory poolIDs) = quoteRequester.getQuoteBatch(
    batchParams,
    asset0Balances,
    asset1Balances
);
```

### Scenario 2: Test AlphaDataQuoter (Single Data - Alpha)

#### Prerequisites:
```solidity
// Your alpha market data provider should return encoded data:
// abi.encode(spotPrice, twapPrice)
// Example: abi.encode(1300000000000000000, 1280000000000000000) 
// Spot = 1.3 ETH, TWAP = 1.28 ETH
```

#### Single Quote Test:
```solidity
SwapParams memory params = SwapParams({
    asset0: TOKEN_A,
    asset1: TOKEN_B,
    quoter: ALPHA_QUOTER_ADDRESS,
    amount: [SWAP_AMOUNT],
    zeroForOne: true,
    marking: [ALPHA_DEFAULT_MARKING]
});

(uint256 quote, uint256 poolID) = quoteRequester.getQuote(
    params,
    ASSET0_BALANCE,
    ASSET1_BALANCE
);

// Expected: Uses weighted price (70% spot, 30% TWAP) with slippage adjustment
```

### Scenario 3: Test BetaDataQuoter (Single Data - Beta)

#### Prerequisites:
```solidity
// Your beta market data provider should return encoded data:
// abi.encode(spotPrice)
// Example: abi.encode(1320000000000000000) // 1.32 ETH
```

#### Single Quote Test:
```solidity
SwapParams memory params = SwapParams({
    asset0: TOKEN_A,
    asset1: TOKEN_B,
    quoter: BETA_QUOTER_ADDRESS,
    amount: [SWAP_AMOUNT],
    zeroForOne: true,
    marking: [BETA_DEFAULT_MARKING]
});

(uint256 quote, uint256 poolID) = quoteRequester.getQuote(
    params,
    ASSET0_BALANCE,
    ASSET1_BALANCE
);

// Expected: Uses spot price with volatility adjustment based on bucketID
```

### Scenario 4: Test DualDataQuoter (Both Alpha and Beta)

#### Prerequisites:
```solidity
// Alpha data: abi.encode(spotPrice, twapPrice)
// Beta data: abi.encode(spotPrice)
// Both providers must be deployed and return proper data
```

#### Single Quote Test:
```solidity
SwapParams memory params = SwapParams({
    asset0: TOKEN_A,
    asset1: TOKEN_B,
    quoter: DUAL_QUOTER_ADDRESS,
    amount: [SWAP_AMOUNT],
    zeroForOne: true,
    marking: [DUAL_DEFAULT_MARKING]
});

(uint256 quote, uint256 poolID) = quoteRequester.getQuote(
    params,
    ASSET0_BALANCE,
    ASSET1_BALANCE
);

// Expected: Sophisticated pricing using both data sources with spread analysis
```

## 5. Advanced Testing Scenarios

### Test Different Bucket IDs:
```solidity
// Test how different bucketIDs affect pricing
bytes3[] memory markingsWithBuckets = [
    0x000000,  // bucketID = 0
    0x001000,  // bucketID = 1  
    0x00A000,  // bucketID = 10
    0x064000   // bucketID = 100
];
```

### Test Alternative Market Data Addresses:
```solidity
// First add alternative addresses
quoteRequester.addAlphaMarketAddress(2, ALTERNATIVE_ALPHA);
quoteRequester.addBetaMarketAddress(3, ALTERNATIVE_BETA);

// Then use markings that reference them
bytes3 CUSTOM_ALPHA_MARKING = 0x000021;  // Alpha, pointer=2, bucketID=0
bytes3 CUSTOM_BETA_MARKING = 0x00030A;   // Beta, pointer=3, bucketID=0
```

### Test Direction (zeroForOne vs oneForZero):
```solidity
// Test both swap directions
SwapParams memory paramsZeroForOne = SwapParams({
    // ... other params
    zeroForOne: true   // TOKEN_A -> TOKEN_B
});

SwapParams memory paramsOneForZero = SwapParams({
    // ... other params  
    zeroForOne: false  // TOKEN_B -> TOKEN_A
});
```

## 6. Expected Results and Validation

### SimpleQuoter Expected Behavior:
- Uses constant product formula: `quote = (amount * otherBalance) / (thisBalance + amount)`
- Applies 0.3% fee: `quote = quote * 997 / 1000`

### AlphaDataQuoter Expected Behavior:
- Uses weighted price: `price = (spot * 70 + twap * 30) / 100`
- Applies slippage based on amount size
- Large trades (>1000 tokens) get higher slippage

### BetaDataQuoter Expected Behavior:
- Uses spot price directly
- Applies volatility adjustment based on bucketID
- Applies 0.3% base fee

### DualDataQuoter Expected Behavior:
- Combines alpha and beta data with sophisticated logic
- Calculates spread between data sources
- Applies spread penalty for uncertainty
- Uses weighted average: `(alphaTwap * 40 + alphaSpot * 35 + betaSpot * 25) / 100`
- Applies 0.5% premium fee

## 7. Troubleshooting

### Common Issues:
1. **Market data provider not returning data**: Ensure your data providers implement IDataBridge interface
2. **Invalid marking**: Double-check marking calculation and bit positions
3. **Revert on quote**: Check that market data addresses are properly set
4. **Unexpected quote values**: Verify token decimals and price scaling (1e18)

### Debug Steps:
1. Test market data providers independently
2. Verify quoter contracts work with mock data
3. Check QuoteRequester market data address storage
4. Validate marking decoding with MarkingHelper

## 8. Gas Optimization Notes

- Batch operations are more gas-efficient for multiple quotes
- Transient storage caches market data within transactions
- Default market data addresses save gas vs. custom pointers

## 9. Integration with Pool Creation

When creating pools, use the same parameters:
- Same asset0/asset1 addresses
- Same quoter address  
- Same marking (first element for pool ID generation)
- This ensures quotes match the actual pool configuration

---

**Note**: Replace placeholder addresses with actual deployed contract addresses. Market data provider addresses must be provided by you as they require specific oracle implementations.