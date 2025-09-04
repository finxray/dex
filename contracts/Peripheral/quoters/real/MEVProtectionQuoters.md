# MEV Protection Quoters

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

## TRADER-CONTROLLED PROTECTIONS
*These should be implemented at PoolManager level with traderProtection flags*

### 5. Per-Block Volume Throttle → **CORE-LEVEL** 
**Implementation**: PoolManager checks before calling quoter
- Trader sets volume limit flag in SwapParams.traderProtection
- PoolManager validates against per-address volume tracking
- **Why core**: Needs msg.sender context and persistent storage

### 6. Cooldown Between Trades → **CORE-LEVEL**
**Implementation**: PoolManager checks before calling quoter  
- Trader sets cooldown flag in SwapParams.traderProtection
- PoolManager validates against per-address timestamp tracking
- **Why core**: Needs msg.sender context and persistent storage

### 13. Per-Address Rate Limiting → **CORE-LEVEL**
**Implementation**: PoolManager checks before calling quoter
- Trader sets rate limit flag in SwapParams.traderProtection  
- PoolManager validates against per-address frequency tracking
- **Why core**: Needs msg.sender context and persistent storage

## Primary Sandwich Defense
**Recommended quoter combo**: #1 + #3 + #11
- Price band (±2% oracle), Max slippage (≤1%), TWAP deviation (±5%)
- Stops most sandwich attacks before any state changes

## Implementation Notes
- All quoters inherit from base quoter interfaces
- Use markings to encode thresholds/config per pool
- Return 0 to trigger PoolManager__InvalidQuote() revert
- Can be combined with existing AMM logic or standalone
- Zero storage overhead when not used
