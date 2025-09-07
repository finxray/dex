### Stoix Model (On-chain Adaptation)

This document specifies an on-chain–practical adaptation of the Stoikov & Avellaneda market maker model with an added price-uncertainty term tailored for DEX/on-chain data constraints.

## Goals
- Per-asset parameters stored at the quoter (not per-pool)
- Two volatilities per asset: short (fast) and long (slow)
- Liquidity/frequency parameter k per asset
- Gamma (risk aversion) per-trade via bucketID
- Value-based inventory skew per quote
- Price-uncertainty add-on that reacts to spot/TWAP/Chainlink divergence
- Minimal gas overhead: O(assets) storage updates; O(1) per-quote math

## Data Sources
- Volatility (short/long): Uniswap V3 oracle (tick cumulative/TWAP) on deepest USD(stable) pools only
- Spot/TWAP: Uniswap V3
- Sanity anchor: Chainlink spot (filter/divergence only, not for vol)
- Composition if no USD pool: asset/WETH × WETH/USD via Uniswap V3

## Per-Asset Packed Storage (1 slot)
Stored at the quoter level: `mapping(address asset => uint256 slot)`

- [0..7]   vShortLevel8 (8 bits, 0–255)
- [8..15]  vLongLevel8  (8 bits, 0–255)
- [16..23] kLevel8      (8 bits, 0–255)
- [24..45] tsShortMin22 (22 bits, minutes since epoch)
- [46..67] tsLongMin22  (22 bits, minutes since epoch)
- [68..75] classId8     (8 bits, optional sector/correlation class)
- [76..255] reserved    (future use)

Notes
- Timestamps in minutes reduce width while providing ~8 years of range (2^22 minutes)
- Levels are 8-bit to allow smooth tuning without large LUTs or many storage writes

## Pair Combination (computed at quote time)
Given `asset0`, `asset1` slots:
- vShortPair8 = max(vShort0, vShort1)
- vLongPair8  = max(vLong0, vLong1)
- kPair8      = min(k0, k1) (conservative)

Optional future: apply an attenuation factor from a tiny class-correlation matrix using classId0/classId1.

## Per-Trade Inputs
- `spot` and `twap`: Uniswap V3 (USDC/asset0, 1e18 scale)
- `chainlink`: Chainlink spot (USDC/asset0, 1e18), sanity only
- `Gamma`: risk aversion from `bucketID` (e.g., 0..15 → bps scaler via LUT)
- Inventories from `QuoteParams`: `asset0Balance`, `asset1Balance`
- `amount` (input size) and direction `zeroForOne`

## Inventory Skew and Size Normalization
- Value-based inventories (asset1 terms):
  - value0 = inventory0 × twap
  - value1 = inventory1
  - TVL = value0 + value1 + 1
  - skew = (value1 − value0) / TVL, clamped to ±S (e.g., S≈0.25)
- Trade size (value fraction):
  - tradeValue = (input amount) × (spot or twap) valued in asset1 terms
  - size = tradeValue / TVL, clamped to [0, 1]
  - Map `size` to a small tier 0..7 and add a bps curve via LUT `C[sizeTier]`

## Price Uncertainty (on-chain freshness/manipulation)
- Divergences:
  - dst = |spot − twap| / twap
  - dcl = |chainlink − twap| / twap
  - u = min(umax, max(dst, dcl) / (cu × ΣL))  // unitless
- Uncertainty add-on (bps):
  - Ubps = λu × u × 1e4

Where ΣS and ΣL are the pair short/long volatility levels (8-bit) mapped to bps multipliers via LUTs.

## Quote Formula (USDC/asset0, 1e18)
- Base mid: m = twap  (manipulation-resistant baseline)
- Mid shift (signed, bps):
  - midAdjBps = clamp(sign(skew) × Γ × fS(ΣS) / fK(k) × |skew|, ±Bmax)
- Spread (bps):
  - spreadBps = Γ × fL(ΣL) / fK(k) + C(sizeTier) + Ubps
- Execution price:
  - zeroForOne (sell asset0 for asset1): pexec = m × (1 + (midAdjBps + spreadBps)/1e4)
  - oneForZero (sell asset1 for asset0): pexec = m × (1 − (midAdjBps + spreadBps)/1e4)

Finally, convert amounts using token decimals (decimal-safe conversion).

## Parameter Mappings (LUTs)
Keep simple immutable mappings; examples:
- Γ (bucketID → bps scaler), 16 entries
- fS(ΣS), fL(ΣL): 256-entry LUTs or piecewise-linear maps from [0..255] → bps multipliers
- fK(k): 256-entry LUT (acts as divider; higher k lowers adjustments)
- C(sizeTier): 8-entry bps add-on for size impact
- Constants: S (max |skew|), Bmax (midAdj cap), λu, cu, umax

## Updates & Staleness
- Keeper/governance updates per-asset slot with:
  - vShortLevel8 and tsShortMin22 frequently (5–15 min cadence)
  - vLongLevel8 and tsLongMin22 infrequently (hourly/daily)
  - kLevel8 daily or threshold-based
- At quote time, if `nowMin − tsXMin22` exceeds thresholds, attenuate its effect (e.g., right-shift) without additional storage writes.

## Gas & Safety
- Per quote: 2 SLOAD (assets), bit decode, O(1) arithmetic + LUTs, no loops → ~20–50k gas overhead vs average-only path
- Fallbacks:
  - Missing assets → conservative defaults
  - Excessive divergence → cap Ubps and clamp midAdjBps
  - Clamp final price within [m × (1 − Pmax), m × (1 + Pmax)]

## Summary
This model uses Uniswap V3 exclusively for volatility (short/long), Chainlink strictly as a sanity anchor to build a price-uncertainty term, and combines per-asset parameters at quote time to produce robust, gas-efficient Stoikov-style quotes. Gamma is routed via bucketID, skew and size are computed per trade, and all per-asset parameters are compacted into a single storage slot with minute-granularity timestamps.


