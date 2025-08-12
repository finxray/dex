# Quoter Testing with Hardhat

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Compile contracts:**
```bash
npx hardhat compile
```

3. **Run all tests:**
```bash
npx hardhat test
```

4. **Run only quoter tests:**
```bash
npx hardhat test test/Quoters.test.js
```

## Test Structure

The test suite (`Quoters.test.js`) includes:

### 1. **Deployment Tests**
- Deploys all quoter contracts
- Deploys mock data bridges for testing
- Sets up QuoteRequester with proper market data addresses

### 2. **SimpleQuoter Tests**
- Tests basic constant product formula
- Tests both swap directions (zeroForOne and oneForZero)
- Tests batch quote functionality
- Validates fee application (0.3%)

### 3. **AlphaDataQuoter Tests**
- Tests weighted price calculation (70% spot, 30% TWAP)
- Tests slippage adjustment based on trade size
- Validates market data integration

### 4. **BetaDataQuoter Tests**
- Tests spot price usage
- Tests volatility adjustment based on bucketID
- Validates fee structure

### 5. **DualDataQuoter Tests**
- Tests complex pricing using both alpha and beta data
- Tests spread analysis and penalty calculation
- Validates sophisticated pricing logic

### 6. **QuoteRequester Integration Tests**
- Tests market data address management
- Tests routing logic based on markings
- Tests pointer validation

### 7. **Gas Usage Analysis**
- Measures gas consumption for each quoter type
- Compares efficiency across different implementations

### 8. **Edge Cases and Error Handling**
- Tests zero amounts and balances
- Tests data bridge price updates
- Tests error conditions

## Mock Contracts

The test suite includes mock data bridges:

- **MockAlphaDataBridge**: Provides spot price and TWAP data
- **MockBetaDataBridge**: Provides spot price only

These can be updated during tests to simulate different market conditions.

## Expected Output

When running tests, you'll see:
- Deployment addresses for all contracts
- Quote calculations with expected vs actual values
- Gas usage measurements
- Test results for all scenarios

## Test Data

Default test parameters:
- Asset0 Balance: 1000 tokens
- Asset1 Balance: 1300 tokens (1.3 ratio)
- Swap Amount: 100 tokens
- Alpha Spot Price: 1.3 ETH
- Alpha TWAP Price: 1.28 ETH
- Beta Spot Price: 1.32 ETH

## Debugging

To see detailed logs:
```bash
npx hardhat test --verbose
```

To run specific test suites:
```bash
npx hardhat test --grep "SimpleQuoter"
npx hardhat test --grep "AlphaDataQuoter"
npx hardhat test --grep "BetaDataQuoter"
npx hardhat test --grep "DualDataQuoter"
```