# MEV Protection Quoters

## Enhanced Context System
**New Feature**: Quoters can now access trader context when `ENHANCED_CONTEXT_FLAG` (bit 0) is set in markings.

**Available Context**:
- `trader` - The actual trader address
- `txOrigin` - Transaction originator
- `blockNumber` - Current block number  
- `timestamp` - Current block timestamp
- `gasPrice` - Transaction gas price
- `sessionActive` - Whether flash session is active

**Interface**: Quoters implement `IEnhancedQuoter` with `quoteWithContext()` and `quoteBatchWithContext()`

## Quoter-Level MEV Protections
*These can be implemented by returning 0 quote to block swaps*

### 1. Price Band (Oracle Anchor) 🛡️ SANDWICH PROTECTION
**File**: `OracleBandQuoter.sol`
- Fetch external price from configured data bridges
- Return 0 if pool price deviates beyond tolerance (e.g., ±2%)
- Marking bits: oracle selection + tolerance level

### 2. Forward/Reverse Spread Check  
**File**: `SpreadValidationQuoter.sol`
- Quote both A→B and B→A directions
- Return 0 if spread exceeds maximum (e.g., >1%)
- Marking bits: max spread threshold

### 3. Max Slippage Per Trade 🛡️ SANDWICH PROTECTION
**File**: `MaxSlippageQuoter.sol`
- Compute price impact from (amountIn, currentInventory)
- Return 0 if impact exceeds threshold (e.g., >1%)
- Marking bits: max slippage threshold

### 4. Inventory Skew Guard 🛡️ SANDWICH PROTECTION
**File**: `InventorySkewQuoter.sol`
- Check if swap pushes asset0:asset1 ratio beyond limits
- Return 0 if post-swap imbalance exceeds threshold
- Marking bits: max imbalance ratio

### 7. Deadline Enforcement (Tight)
**File**: `DeadlineQuoter.sol`  
- Decode expiry timestamp from markings
- Return 0 if block.timestamp > expiry
- Marking bits: expiry timestamp (32-bit)

### 10. Oracle Consensus Gating
**File**: `ConsensusQuoter.sol`
- Fetch from multiple data bridges
- Return 0 unless sources agree within tolerance
- Marking bits: bridge selection + consensus threshold

### 11. TWAP Deviation Check 🛡️ SANDWICH PROTECTION
**File**: `TWAPDeviationQuoter.sol`
- Compare spot vs TWAP from data bridges
- Return 0 if deviation exceeds threshold
- Marking bits: TWAP window + deviation threshold

### 14. Gas Price Ceiling Gating
**File**: `GasPriceCeilingQuoter.sol`
- Check tx.gasprice against threshold
- Return 0 if gas price too high (MEV condition)
- Marking bits: gas price ceiling

### 15. No-Arbitrage Bands with Auto-Pause 🛡️ LP PROTECTION
**File**: `NoArbBandQuoter.sol` (implements `IEnhancedQuoter`)
- Monitor pool value deviation from baseline using trader context
- Return 0 if price moves beyond acceptable bounds (1%, 2%, 5%)
- Auto-pause trading for configured duration after trigger
- **Requires**: Enhanced context for block tracking and state management
- **Marking bits**: Band threshold + pause duration

### 16. Backrun Detection & MEV Capture 🛡️ LP PROTECTION  
**File**: `BackrunCaptureQuoter.sol` (implements `IEnhancedQuoter`)
- Detect same-block trades that could be backruns using trader context
- Calculate and capture MEV value from backrunning
- Redirect captured value to LP treasury or pool
- **Requires**: Enhanced context for block.number and trade tracking
- **Marking bits**: Capture mode + treasury configuration

### 17. Emergency Pause Controls 🛡️ LP PROTECTION
**File**: `EmergencyPauseQuoter.sol`
- Admin-controlled emergency pause mechanism
- Return 0 during emergency pause periods
- Can be triggered by governance or automated conditions
- **Marking bits**: Emergency mode configuration

## TRADER-CONTROLLED PROTECTIONS
*These can now be implemented at quoter level using enhanced context system*

### 5. Per-Block Volume Throttle → **ENHANCED QUOTER** 
**File**: `VolumeControlQuoter.sol` (implements `IEnhancedQuoter`)
**Implementation**: Quoter tracks volume and returns 0 if exceeded
- **Uses**: Enhanced context for `trader` address and `blockNumber`
- **Storage**: Per-pool volume tracking in quoter contract
- **Benefit**: Failed quotes cheaper than failed transactions

### 6. Cooldown Between Trades → **ENHANCED QUOTER**
**File**: Same as #5 - `VolumeControlQuoter.sol`
- Pool-level and address-level cooldown tracking using `trader` and `timestamp`
- Returns 0 if cooldown not elapsed

### 13. Per-Address Rate Limiting → **ENHANCED QUOTER**
**File**: Same as #5 - `VolumeControlQuoter.sol`
- Address-specific trade frequency limits using `trader` context
- Shared storage with volume and cooldown tracking

## Primary Sandwich Defense
**Recommended quoter combo**: #1 + #3 + #11
- Price band (±2% oracle), Max slippage (≤1%), TWAP deviation (±5%)
- Stops most sandwich attacks before any state changes

## Enhanced Context Implementation Guide

### **Standard Quoter (IQuoter)**
```solidity
contract BasicQuoter is IQuoter {
    function quote(QuoteParams memory params, bytes memory data) 
        external returns (uint256) {
        // Standard implementation - no trader context
        return calculateQuote(params.amount, params.asset0Balance, params.asset1Balance);
    }
}
```

### **Enhanced Quoter (IEnhancedQuoter)**  
```solidity
contract ProtectedQuoter is IEnhancedQuoter {
    function quoteWithContext(QuoteParamsWithContext memory params, bytes memory data)
        external returns (uint256) {
        // Access trader context for LP protections
        if (isVolumeExceeded(params.context.trader, params.amount)) return 0;
        if (isCooldownActive(params.context.trader, params.context.timestamp)) return 0;
        if (isPriceDeviationTooHigh(params.context.blockNumber)) return 0;
        
        return calculateQuote(params.amount, params.asset0Balance, params.asset1Balance);
    }
}
```

### **Marking Configuration**
```solidity
// LP creates pool with enhanced context enabled
bytes3 markings = 0x000001; // Bit 0 = ENHANCED_CONTEXT_FLAG
poolManager.createPool(asset0, asset1, protectedQuoter, markings);

// Result: All trades in this pool will use enhanced context
// Gas cost: Higher for this pool, but LPs chose this protection level
```

## Implementation Notes
- **Standard quoters**: Inherit from `IQuoter` (existing, cheaper)
- **Protected quoters**: Inherit from `IEnhancedQuoter` (new, with trader context)
- **Automatic routing**: QuoteRouter detects marking flags and routes appropriately
- **Gas optimization**: Only pools with enhanced context flag pay the overhead
- **Backward compatibility**: All existing quoters continue to work unchanged
- Use markings to encode thresholds/config per pool
- Return 0 to trigger PoolManager__InvalidQuote() revert
- Can be combined with existing AMM logic or standalone
- Zero storage overhead when not used
