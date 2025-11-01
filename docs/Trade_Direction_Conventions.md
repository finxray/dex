# Trade Direction and Skew Calculation Conventions

## Overview
This document defines the conventions used throughout the application for trade direction, amount units, skew calculations, and their relationship to the Avellaneda-Stoikov (A-S) pricing model.

---

## 1. Core Trade Direction Convention

### `zeroForOne` Parameter

The `zeroForOne` boolean flag follows **Uniswap V3 convention** and is defined from the **TRADER's perspective**:

| zeroForOne | Trader Action | Trader Gives | Trader Receives | Pool Receives | Pool Gives |
|------------|---------------|--------------|-----------------|---------------|------------|
| **TRUE**   | Sell asset0   | asset0       | asset1          | asset0        | asset1     |
| **FALSE**  | Sell asset1   | asset1       | asset0          | asset1        | asset0     |

**Key Points:**
- Convention matches Uniswap V3 for compatibility
- `zeroForOne=true` means "zero (asset0) FOR one (asset1)" from trader's view
- Pool's inventory changes are the **inverse** of trader's changes

---

## 2. Amount Units Convention

### Amount Parameter Units Based on Direction

The `amount` parameter represents the **INPUT amount** from the trader's perspective:

| zeroForOne | Amount Units | Description |
|------------|--------------|-------------|
| **TRUE**   | **asset0**   | Trader gives this many units of asset0 |
| **FALSE**  | **asset1**   | Trader gives this many units of asset1 |

**Example:**
- `zeroForOne=true, amount=20` → Trader gives 20 **asset0**
- `zeroForOne=false, amount=20` → Trader gives 20 **asset1**

**Reference:** See `PoolManager.sol` lines 324-326:
```solidity
address inAsset = zeroForOne ? asset0 : asset1;
address outAsset = zeroForOne ? asset1 : asset0;
FlashAccounting.addDelta(beneficiary, inAsset, -int256(amountIn));
```

---

## 3. Pool Inventory Simulation

### How Trades Affect Pool Inventory

Given `midPrice` (asset1 per asset0), the pool inventory changes as:

#### **zeroForOne = TRUE** (amount in asset0 units)
```
Pool receives: amount (in asset0)
Pool gives: amount × midPrice (in asset1)

asset0_after = asset0_before + amount
asset1_after = asset1_before - (amount × midPrice)
```

#### **zeroForOne = FALSE** (amount in asset1 units)
```
Pool receives: amount (in asset1)
Pool gives: amount / midPrice (in asset0)

asset0_after = asset0_before - (amount / midPrice)
asset1_after = asset1_before + amount
```

**Safety:** Pool inventory is clamped to 0 if insufficient (prevents negative inventory without reverting).

---

## 4. Skew Calculation

### Purpose
Skew represents the **change in pool's inventory risk** due to a trade, used in the A-S reservation price formula.

### Formula by Mode

**RISKY Modes (RISKY0, RISKY1):**
```
skew = skew_after - skew_before

Where:
  RISKY0: skew_state = value0 / (value0 + value1)
  RISKY1: skew_state = value1 / (value0 + value1)
```

**NEUTRAL Mode:**
```
skew = |skew_after| - |skew_before|

Where:
  skew_state = (value0 / ideal) - 1
  ideal = (value0 + value1) / 2
```

### Value Conversion
All values must be in **asset0 terms** for consistent calculation:
```
value0 = inventory0
value1 = inventory1 / midPrice
```

### Sign Convention

| Skew Sign | Trade Type | Impact on Pool | Reservation Price Effect |
|-----------|------------|----------------|--------------------------|
| **NEGATIVE** | Beneficial | Reduces risky exposure or improves balance | `r` increases → encourages trade |
| **POSITIVE** | Detrimental | Increases risky exposure or worsens balance | `r` decreases → discourages trade |

---

## 5. Risky Asset Modes

### Mode Definitions

| Mode | Code | Target | Skew Interpretation |
|------|------|--------|---------------------|
| **NEUTRAL** | 0 | Equal value in both assets | Deviation from 50/50 balance |
| **RISKY0** | 1 | Minimize asset0 holdings | Proportion of value in asset0 |
| **RISKY1** | 2 | Minimize asset1 holdings | Proportion of value in asset1 |

### Trade Classification Examples

**RISKY0 (asset0 is risky):**
- Pool reduces asset0 → **BENEFICIAL** → negative skew
- Pool increases asset0 → **DETRIMENTAL** → positive skew

**RISKY1 (asset1 is risky):**
- Pool reduces asset1 → **BENEFICIAL** → negative skew
- Pool increases asset1 → **DETRIMENTAL** → positive skew

**NEUTRAL (50/50 target):**
- Imbalance decreases → **BENEFICIAL** → negative skew
- Imbalance increases → **DETRIMENTAL** → positive skew

---

## 6. Avellaneda-Stoikov Model Integration

### Reservation Price Formula
```
r = mid - q·γ·σ²·τ
```

Where:
- `r` = reservation price
- `mid` = market mid-price
- `q` = **skew** (inventory position, from `calculateSkew`)
- `γ` = risk aversion parameter
- `σ²` = variance (volatility squared)
- `τ` = time to horizon

### Quote Prices
```
bid = r - δ*
ask = r + δ*
```

Where `δ*` is the optimal half-spread.

### Economic Interpretation

**Negative skew** (beneficial trade):
- `r = mid - (negative) = mid + positive`
- Reservation price **increases**
- Makes pool more willing to accept the trade
- Results in better quotes for trader

**Positive skew** (detrimental trade):
- `r = mid - (positive) = mid - positive`
- Reservation price **decreases**
- Makes pool less willing to accept the trade
- Results in worse quotes for trader

---

## 7. Complete Example Walkthrough

### Example 1: RISKY0 Beneficial Trade

**Setup:**
- Initial: asset0=100, asset1=80
- midPrice=0.5 (1 asset0 = 0.5 asset1)
- Risky mode: RISKY0 (want to minimize asset0)
- Trade: zeroForOne=FALSE, amount=20 (asset1)

**Calculation:**
```
1. Convert to asset0 terms:
   value0_before = 100
   value1_before = 80 / 0.5 = 160
   Total = 260

2. Simulate trade:
   Pool receives 20 asset1
   Pool gives 20/0.5 = 40 asset0
   value0_after = 60
   value1_after = 100/0.5 = 200
   Total = 260

3. Calculate skew:
   skew_before = 100/260 = 0.3846
   skew_after = 60/260 = 0.2308
   skew = 0.2308 - 0.3846 = -0.1538

4. Result:
   ✓ Negative skew (-0.154)
   ✓ Pool reduced risky asset0 (100→60)
   ✓ Beneficial trade
   ✓ Reservation price increases
   ✓ Better quotes offered to encourage this trade
```

### Example 2: RISKY0 Detrimental Trade

**Setup:**
- Same initial state
- Trade: zeroForOne=TRUE, amount=20 (asset0)

**Calculation:**
```
1. Values before (same as above):
   value0_before = 100, value1_before = 160
   Total = 260

2. Simulate trade:
   Pool receives 20 asset0
   Pool gives 20×0.5 = 10 asset1
   value0_after = 120
   value1_after = 70/0.5 = 140
   Total = 260

3. Calculate skew:
   skew_before = 100/260 = 0.3846
   skew_after = 120/260 = 0.4615
   skew = 0.4615 - 0.3846 = +0.0769

4. Result:
   ✓ Positive skew (+0.077)
   ✓ Pool increased risky asset0 (100→120)
   ✓ Detrimental trade
   ✓ Reservation price decreases
   ✓ Worse quotes offered to discourage this trade
```

---

## 8. Edge Cases and Safety

### Insufficient Inventory
When pool doesn't have enough of the output asset:

**Example:** asset0=0, amount=20, zeroForOne=FALSE
- Pool needs to give 20/midPrice asset0
- Pool has 0 asset0
- **Clamping:** value0_after = 0 (not negative)
- **Result:** skew ≈ 0, indicating trade cannot be fulfilled
- **Benefit:** Quoter can return 0 without reverting

### Zero Inventory
When pool starts with zero inventory:
- Skew calculation handles division by zero safely
- Returns meaningful skew based on where trade would move inventory
- No reverts, graceful degradation

---

## 9. Implementation Reference

### Key Files
- **`InventorySkew.sol`**: Skew calculation library
- **`StoicovQuoter.sol`**: Uses skew in A-S pricing model
- **`PoolManager.sol`**: Core swap execution (lines 324-326)
- **`PoolManagerLib.sol`**: Inventory validation (lines 384-398)

### Function Signature
```solidity
function calculateSkew(
    uint256 inventory0Raw,
    uint256 inventory1Raw,
    uint256 amount,              // In INPUT asset units (asset0 if zeroForOne=true, asset1 if false)
    bool zeroForOne,             // Trade direction (true = trader gives asset0, false = trader gives asset1)
    RiskyAssetMode riskyMode,    // 0=NEUTRAL, 1=RISKY0, 2=RISKY1
    uint256 midPricePpb          // Asset1 per asset0, in PPB (parts per billion)
) internal pure returns (int256 skew);
```

---

## 10. Quick Reference Table

### Trade Direction Matrix

| zeroForOne | Amount Units | Trader Gives | Trader Gets | Pool Gets | Pool Loses | Pool asset0 | Pool asset1 |
|------------|--------------|--------------|-------------|-----------|------------|-------------|-------------|
| TRUE       | asset0       | asset0       | asset1      | asset0    | asset1     | ↑ increases | ↓ decreases |
| FALSE      | asset1       | asset1       | asset0      | asset1    | asset0     | ↓ decreases | ↑ increases |

### Skew Sign Reference

| Risky Mode | Pool Action | Skew Sign | Reservation Price | Quote Quality |
|------------|-------------|-----------|-------------------|---------------|
| RISKY0 | Reduces asset0 | Negative | Increases | Better (encourage) |
| RISKY0 | Increases asset0 | Positive | Decreases | Worse (discourage) |
| RISKY1 | Reduces asset1 | Negative | Increases | Better (encourage) |
| RISKY1 | Increases asset1 | Positive | Decreases | Worse (discourage) |
| NEUTRAL | Improves balance | Negative | Increases | Better (encourage) |
| NEUTRAL | Worsens balance | Positive | Decreases | Worse (discourage) |

---

## 11. Testing and Validation

All test files verify these conventions:
- `test/models/Stoicov.inventory_skew.test.js`
- `test/models/Stoicov.skew_midprice.test.js`
- `test/models/Stoicov.skew_verification.test.js`
- `test/peripheral/DummyBridges/StoicovQuoter.e2e.dummy.test.js`

**Validation Command:**
```bash
npx hardhat test test/peripheral/DummyBridges/StoicovQuoter.e2e.dummy.test.js
```

Should show: ✓ All tests passing with correct skew signs and economic behavior

---

## 12. Common Pitfalls to Avoid

❌ **Don't:** Assume amount is always in asset0 units
✅ **Do:** Check zeroForOne to determine amount units

❌ **Don't:** Interpret skew sign as "good=positive, bad=negative"  
✅ **Do:** Remember: beneficial=negative (for the A-S formula `r = mid - q·γ·σ²`)

❌ **Don't:** Calculate skew from trader's perspective
✅ **Do:** Calculate from pool's (market maker's) perspective

❌ **Don't:** Forget to convert to common value terms (asset0)
✅ **Do:** Always use `value1 = inventory1 / midPrice` for calculations

---

**Last Updated:** 2025-10-25  
**Implementation:** contracts/Peripheral/libraries/InventorySkew.sol  
**Model Reference:** Avellaneda & Stoikov (2008) - High-frequency trading in a limit order book

