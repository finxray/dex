# Inventory Skew Function Design

## Overview

The inventory skew function implements the inventory-adjustment component of the Avellaneda-Stoikov market making model, producing a normalized value in the range [-1, +1] that represents the LP's inventory deviation from their target position.

## Mathematical Foundation

### From Avellaneda-Stoikov Model

In the A-S model, the reservation price (the LP's internal "fair value") is adjusted based on inventory:

```
r = Ŝ - q × γ × σ² × τ
```

Where:
- `Ŝ` = mid price
- `q` = signed inventory (positive = long risky asset, negative = short)
- `γ` = risk aversion parameter
- `σ²τ` = variance over time horizon

### Normalization Strategy

We define a reference inventory level `q_max` as the inventory at which the reservation price shift would equal the base spread:

```
q_max = (1/k) / (γ × σ² × τ)
```

Then normalize the actual inventory:

```
skew = q / q_max
```

Clamped to [-1, +1] to prevent extreme quotes.

## Function Signature

```solidity
function calculateSkew(
    address asset0,
    address asset1,
    uint256 inventory0Raw,
    uint256 inventory1Raw,
    uint128 midPriceQ64,
    RiskyAssetMode riskyMode,
    uint32 kPpb,
    uint32 gammaPpb,
    uint32 sigma2TauPpb
) internal view returns (int256 skew)
```

### Parameters

- **asset0, asset1**: Token addresses for decimal lookup
- **inventory0Raw, inventory1Raw**: Raw balances in token units
- **midPriceQ64**: Mid price in Q64.64 fixed-point format
- **riskyMode**: Determines inventory calculation mode
- **kPpb, gammaPpb, sigma2TauPpb**: Model parameters in parts-per-billion

### Return Value

- **skew**: Normalized inventory in range [-1e9, +1e9] PPB, representing [-1.0, +1.0]

## Risky Asset Modes

### 1. NEUTRAL (Value-Neutral)
```
q = inventory0 - inventory1_in_asset0
```

LP targets equal value in both assets. Used for symmetric pools (e.g., stablecoin pairs).

**Example**: For ETH/USDC at 2000 price:
- Inventory: 10 ETH, 15k USDC
- q = 10 - (15000/2000) = 10 - 7.5 = +2.5 ETH
- Interpretation: LP is 2.5 ETH "too long"

### 2. RISKY0 (Asset0 = Risky)
```
q = inventory0
```

LP wants to minimize asset0 holdings. Used when asset0 is more volatile.

**Example**: ETH is risky
- Inventory: 5 ETH, any USDC
- q = 5 ETH
- Interpretation: LP has 5 ETH of unwanted exposure

### 3. RISKY1 (Asset1 = Risky)
```
q = inventory1_in_asset0
```

LP wants to minimize asset1 holdings (converted to asset0 units).

## Skew Interpretation

| Skew Value | Meaning | Spread Effect |
|------------|---------|---------------|
| +1.0 | Maximum undesired long position | Widen ask significantly, narrow bid |
| +0.5 | Moderate long position | Moderately widen ask |
| 0.0 | At target inventory | Symmetric spread |
| -0.5 | Moderate short position | Moderately widen bid |
| -1.0 | Maximum undesired short position | Widen bid significantly, narrow ask |

## Usage in Spread Calculation

The final half-spread formula incorporating inventory skew:

```
Half_Spread = 1/k - gam/(2*k²) + (gam*stD²)/2 + q*gam*stD²

where q = skew (normalized inventory in range [-1, +1])
```

### Important: Spread Non-Negativity Constraint

Since `q` can be negative (beneficial trades), the last term `q*gam*stD²` can be negative and large enough to make the total spread negative. **We must enforce Half_Spread >= 0**.

Example where spread could go negative:
- 1/k = 0.5 bps
- gam/(2*k²) = 0.25 bps
- (gam*stD²)/2 = 1.0 bps
- q = +0.8 (very beneficial trade)
- q*gam*stD² = 0.8 * 2.0 = 1.6 bps
- Raw spread = 0.5 - 0.25 + 1.0 + 1.6 = 2.85 bps ✓ (positive, OK)

But if q = -0.9 (very detrimental):
- q*gam*stD² = -0.9 * 2.0 = -1.8 bps  
- Raw spread = 0.5 - 0.25 + 1.0 - 1.8 = -0.55 bps ❌ (negative, invalid!)
- Must clamp to: max(0, raw_spread) = 0 bps ✓

## Safety Features

1. **Skew clamping**: Skew is clamped to [-1, +1] to prevent extreme quotes
2. **Zero gamma check**: Returns 0 when γ = 0 (inventory indifferent)
3. **Non-negative spread enforcement**: Final half-spread must be clamped to >= 0
4. **Zero inventory handling**: Returns 0 skew when inventory is 0

## Example Calculation

**Given:**
- 50 bps level: k = 0.02, gamma = 0.02 (scale = 1.0)
- σ²τ = 0.1 (10% volatility)
- Inventory: 20 ETH, 10k USDC @ 2000 USDC/ETH (NEUTRAL mode)

**Calculate:**
1. q = 20 - (10000/2000) = 20 - 5 = +15 ETH (excess)
2. q_max = (1/0.02) / (0.02 × 0.1) = 50 / 0.002 = 25000 ETH
3. skew = 15 / 25000 = 0.0006 ≈ 0.06% (mild long bias)

**Result**: Small positive skew → slightly wider ask, slightly narrower bid

