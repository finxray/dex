# Implementation Guide - Applying Architecture Enhancements

## Overview
This guide provides step-by-step instructions for integrating the new architectural components into your existing PoolManager.

---

## Phase 1: Deploy New Components

### Step 1: Deploy Core Components
```javascript
// Deploy in this order (dependencies matter)
const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
const poolRegistry = await PoolRegistry.deploy(poolManager.address);

const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
const circuitBreaker = await CircuitBreaker.deploy(poolManager.address);

const MEVProtection = await ethers.getContractFactory("MEVProtection");
const mevProtection = await MEVProtection.deploy(poolManager.address);

console.log("PoolRegistry:", poolRegistry.address);
console.log("CircuitBreaker:", circuitBreaker.address);
console.log("MEVProtection:", mevProtection.address);
```

### Step 2: Configure Access Control
```javascript
// Set up guardians for emergency response
const guardians = [
  "0x...", // Guardian 1
  "0x...", // Guardian 2
  "0x..."  // Guardian 3
];

for (const guardian of guardians) {
  await circuitBreaker.setGuardian(guardian, true);
}

// Authorize addresses for pool metadata updates
await poolRegistry.setAuthorized(adminAddress, true);
```

---

## Phase 2: Update PoolManager

### Option A: Minimal Integration (Recommended First)

Add these to your existing PoolManager:

```solidity
// Add state variables
PoolRegistry public poolRegistry;
CircuitBreaker public circuitBreaker;
MEVProtection public mevProtection;

// Add to constructor or initialization
function initialize(
    address _poolRegistry,
    address _circuitBreaker,
    address _mevProtection
) external {
    poolRegistry = PoolRegistry(_poolRegistry);
    circuitBreaker = CircuitBreaker(_circuitBreaker);
    mevProtection = MEVProtection(_mevProtection);
}

// Update createPool function
function createPool(
    address asset0,
    address asset1,
    address quoter,
    bytes3 markings
) external nonReentrant returns (uint256 poolID) {
    // Existing pool creation logic
    poolID = PoolManagerLib.createPool(_storage, asset0, asset1, quoter, markings);
    
    // NEW: Register in PoolRegistry
    poolRegistry.registerPool(poolID, asset0, asset1, quoter, markings);
    
    // NEW: Configure MEV if needed (check 4th byte for extended markings)
    if (markings.length >= 3) {
        bytes4 extended = bytes4(uint32(uint24(markings)) << 8);
        if (uint8(extended[3]) > 0) {
            mevProtection.configurePoolProtection(
                poolID,
                uint8(extended[3]),
                1 ether // default threshold
            );
        }
    }
    
    // NEW: Set default circuit breaker limits
    circuitBreaker.setPoolLimits(
        poolID,
        100 ether,     // maxSwapSize
        10000 ether,   // dailyVolumeLimit  
        60,            // cooldownPeriod
        500           // maxPriceImpact
    );
    
    return poolID;
}

// Update swap function
function swap(
    address asset0,
    address asset1,
    address quoter,
    bytes3 markings,
    uint256 amountIn,
    bool zeroForOne,
    uint256 minAmountOut
) external payable nonReentrant returns (uint256 amountOut) {
    uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
    
    // NEW: Check circuit breaker
    (bool allowed, string memory reason) = circuitBreaker.checkOperation(
        poolID,
        amountIn,
        amountIn > 10 ether
    );
    require(allowed, reason);
    
    // Existing swap logic
    amountOut = _performSwap(...);
    
    // NEW: Record statistics
    poolRegistry.recordSwap(poolID, amountIn, amountIn, 30); // 30 = fee in basis points
    circuitBreaker.recordSuccess(poolID, amountIn, amountIn > 10 ether);
    
    return amountOut;
}
```

### Option B: Full Integration

Use the PoolManagerV2.sol.example as a reference for complete integration.

---

## Phase 3: Configure Protection Levels

### Define Pool Types
```javascript
// Configuration for different pool types
const poolConfigs = {
  basicAMM: {
    markings: "0x000000",  // No protection
    description: "Basic AMM with no MEV protection"
  },
  
  protectedAMM: {
    markings: "0x000008",  // Dynamic fees
    description: "AMM with dynamic fee protection"
  },
  
  secureOracle: {
    markings: "0x000109",  // Data sources + high protection
    description: "Oracle pool with commit-reveal"
  },
  
  institutional: {
    markings: "0x000004",  // Private pool
    description: "Whitelist-only institutional pool"
  }
};
```

### Set Custom Parameters
```javascript
// For pools needing custom configuration
await mevProtection.setCustomParameters(
  poolId,
  30,   // baseFee (0.3%)
  100,  // surgeFee (1% during high activity)
  2,    // commitDelay (2 blocks)
  10,   // gradualBlocks (10 blocks for Dutch auction)
  12    // timeLock (12 seconds)
);
```

---

## Phase 4: Set Up Monitoring

### Event Listeners
```javascript
// Pool Registry Events
poolRegistry.on("PoolRegistered", (poolId, asset0, asset1, quoter, markings) => {
  console.log(`New pool created: ${poolId}`);
  // Add to monitoring dashboard
});

// Circuit Breaker Events
circuitBreaker.on("CircuitBreakerTriggered", (poolId, reason, pausedUntil) => {
  console.error(`ALERT: Pool ${poolId} paused - ${reason}`);
  // Send alert to team
});

// MEV Protection Events
mevProtection.on("SandwichAttackDetected", (poolId, attacker, score) => {
  console.warn(`Potential sandwich attack on pool ${poolId}`);
  // Log for analysis
});
```

### Monitoring Dashboard
```javascript
// Regular health checks
async function monitorPoolHealth(poolId) {
  // Check if pool is paused
  const isPaused = await circuitBreaker.isPoolPaused(poolId);
  
  // Get pool statistics
  const stats = await poolRegistry.poolStatistics(poolId);
  
  // Check MEV protection status
  const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
  
  return {
    poolId,
    isPaused,
    swapCount: stats.swapCount,
    totalVolume: stats.totalVolume,
    mevProtection: mevConfig.description,
    lastActivity: stats.lastActivityTimestamp
  };
}
```

---

## Phase 5: Testing Integration

### Test Pool Creation with Protection
```javascript
describe("Pool Creation with Protection", () => {
  it("Should create pool with MEV protection", async () => {
    const markings = "0x000009"; // High protection
    
    const tx = await poolManager.createPool(
      WETH,
      USDC,
      quoter,
      markings
    );
    
    const receipt = await tx.wait();
    const poolId = receipt.events[0].args.poolId;
    
    // Verify protection configured
    const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
    expect(mevConfig.protectionLevel).to.equal(0x09);
  });
});
```

### Test Emergency Response
```javascript
describe("Emergency Response", () => {
  it("Should pause pool on suspicious activity", async () => {
    // Simulate suspicious activity
    await circuitBreaker.reportSuspiciousActivity(
      poolId,
      "Unusual trading pattern",
      10 // severity
    );
    
    // Check if paused
    const isPaused = await circuitBreaker.isPoolPaused(poolId);
    expect(isPaused).to.be.true;
  });
});
```

---

## Phase 6: Production Deployment

### Deployment Checklist
- [ ] All contracts compiled without warnings
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Gas costs measured and acceptable
- [ ] Access control configured
- [ ] Guardian addresses set
- [ ] Default limits configured
- [ ] Event monitoring active
- [ ] Emergency procedures documented

### Deployment Script
```javascript
async function deployProduction() {
  console.log("Starting production deployment...");
  
  // 1. Deploy components
  const components = await deployComponents();
  
  // 2. Configure access control
  await configureAccessControl(components);
  
  // 3. Set default parameters
  await setDefaultParameters(components);
  
  // 4. Verify deployment
  await verifyDeployment(components);
  
  console.log("Deployment complete!");
  return components;
}
```

---

## Migration for Existing Pools

### Register Existing Pools
```javascript
async function migrateExistingPools(poolIds) {
  for (const poolId of poolIds) {
    // Get pool info from PoolManager
    const info = await poolManager.getPoolInfo(poolId);
    
    // Register with PoolRegistry
    await poolRegistry.registerPool(
      poolId,
      info.asset0,
      info.asset1,
      info.quoter,
      info.markings
    );
    
    // Set conservative circuit breaker limits
    await circuitBreaker.setPoolLimits(
      poolId,
      ethers.parseEther("1000"),  // generous limits
      ethers.parseEther("100000"),
      300,  // 5 minute cooldown
      1000  // 10% price impact
    );
    
    console.log(`Migrated pool ${poolId}`);
  }
}
```

---

## Rollback Plan

If issues arise, components can be disabled without affecting core functionality:

```javascript
// Emergency disable (in PoolManager)
function disableEnhancements() external onlyOwner {
    useCircuitBreaker = false;
    useMEVProtection = false;
    usePoolRegistry = false;
}
```

---

## Support & Troubleshooting

### Common Issues

1. **Pool Creation Fails**
   - Check markings format (3 bytes for basic, 4 for extended)
   - Verify component addresses are set
   - Ensure sufficient gas

2. **Circuit Breaker Too Restrictive**
   - Adjust limits using `setPoolLimits()`
   - Temporarily pause circuit breaker if needed

3. **MEV Protection Not Working**
   - Verify protection level in markings
   - Check if threshold is set appropriately
   - Ensure MEVProtection contract is authorized

### Debug Functions
```javascript
// Check pool configuration
async function debugPool(poolId) {
  console.log("Pool Debug Info:");
  console.log("- Registry:", await poolRegistry.poolMetadata(poolId));
  console.log("- Circuit Breaker:", await circuitBreaker.poolLimits(poolId));
  console.log("- MEV Config:", await mevProtection.poolConfigs(poolId));
}
```

---

## Conclusion

Follow this guide to safely integrate the new architectural components. Start with minimal integration, test thoroughly, then gradually enable more features based on your needs.

Remember: All protection features are optional and can be configured per pool, maintaining your DEX's flexible, non-opinionated philosophy.

---

*For technical questions, refer to:*
- `ARCHITECTURE_ENHANCEMENTS.md` - Technical details
- `TEST_REPORT.md` - Test results and validation
- `ENHANCEMENT_SUMMARY.md` - Quick reference

*Implementation Support Files:*
- `contracts/Core/PoolManagerV2.sol.example` - Full integration example
- `test/NewFeaturesSimplified.test.js` - Test examples
