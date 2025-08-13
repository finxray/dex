## PoolManager DualDataQuoter swap – Remix quick guide

This guide shows how to test `createPool`, `addLiquidity`, and `swap` in `PoolManager` using the DualDataQuoter and alpha/beta market data. Replace placeholder addresses with your deployed contracts.

### 0) Contracts to deploy first
- Test/ERC20 tokens (or your own tokens):
  - `TokenA`: `0xTOKEN_A_ADDRESS`
  - `TokenB`: `0xTOKEN_B_ADDRESS`
- Market data bridges:
  - `MockAlphaDataBridge` (spot, twap): `0xALPHA_DATA_ADDRESS`
    - Constructor inputs (suggested test values):
      - `spot = 1300000000000000000`  (1.3e18)
      - `twap = 1280000000000000000`  (1.28e18)
  - `MockBetaDataBridge` (spot only): `0xBETA_DATA_ADDRESS`
    - Constructor input (suggested test value):
      - `spot = 1320000000000000000`  (1.32e18)
- Quoter:
  - `DualDataQuoter`: `0xDUAL_QUOTER_ADDRESS`
- PoolManager (constructor):
  - `defaultAlpha = 0xALPHA_DATA_ADDRESS`
  - `defaultBeta  = 0xBETA_DATA_ADDRESS`
  - Deployed as: `0xPOOL_MANAGER_ADDRESS`

Notes:
- Use the same token order consistently across all calls. Asset order matters and is not auto-sorted.
- For testing, you can deploy simple mintable ERC20s and mint to your EOA.

### 1) Approvals (ERC20)
In Remix, with TokenA and TokenB selected:
- Call `approve(spender, amount)` for each token:
  - `spender = 0xPOOL_MANAGER_ADDRESS`
  - `amount  = 115792089237316195423570985008687907853269984665640564039457584007913129639935` (MaxUint256) or a large amount

### 2) Create pool (PoolManager.createPool)
Select `PoolManager` at `0xPOOL_MANAGER_ADDRESS` and call:

Inputs:
- `asset0`: `0xTOKEN_A_ADDRESS`
- `asset1`: `0xTOKEN_B_ADDRESS`
- `quoter`: `0xDUAL_QUOTER_ADDRESS`
- `markings`: `0x00000F` (bytes3)  // dual data, defaults for alpha/beta

Return:
- `poolID` (uint256)

### 3) Add liquidity (PoolManager.addLiquidity)
Still on `PoolManager`:

Inputs:
- `asset0`: `0xTOKEN_A_ADDRESS`
- `asset1`: `0xTOKEN_B_ADDRESS`
- `quoter`: `0xDUAL_QUOTER_ADDRESS`
- `markings`: `0x00000F`
- `amount0`: `1000000000000000000000`   // 1000e18 (TokenA)
- `amount1`: `1300000000000000000000`  // 1300e18 (TokenB)
- `msg.value`: `0`

Expected:
- Liquidity minted to your address
- Inventory updated (you can verify with `getInventory(poolID)`)

Optional verification:
- Call `getInventory(poolID)` → expect:
  - `asset0 ≈ 1000e18`
  - `asset1 ≈ 1300e18`
- Call `balanceOf(yourAddress, poolID)` > 0

### 4) Swap A → B (PoolManager.swap)
Inputs:
- `asset0`: `0xTOKEN_A_ADDRESS`
- `asset1`: `0xTOKEN_B_ADDRESS`
- `quoter`: `0xDUAL_QUOTER_ADDRESS`
- `markings`: `0x00000F`
- `amountIn`: `10000000000000000000`     // 10e18
- `zeroForOne`: `true`                    // A → B
- `minAmountOut`: `12000000000000000000` // 12e18 (example; adjust per liquidity)
- `msg.value`: `0`

Expected:
- Function returns `amountOut` (uint256) > `minAmountOut`
- Your TokenB balance increases

### 5) Swap B → A (optional)
Inputs:
- `asset0`: `0xTOKEN_A_ADDRESS`
- `asset1`: `0xTOKEN_B_ADDRESS`
- `quoter`: `0xDUAL_QUOTER_ADDRESS`
- `markings`: `0x00000F`
- `amountIn`: `10000000000000000000`     // 10e18
- `zeroForOne`: `false`                   // B → A
- `minAmountOut`: `7000000000000000000`  // 7e18 (example; adjust per liquidity)
- `msg.value`: `0`

### 6) Multi-hop (optional, single-transaction caching)
Use `batchSwap` to chain hops in one tx. Build an array of `Hop` structs in Remix (ABI-encoded) as follows:

Example hops (Simple → Alpha → Dual) with same token pair:
```
[
  {
    "asset0": "0xTOKEN_A_ADDRESS",
    "asset1": "0xTOKEN_B_ADDRESS",
    "quoter": "0xSIMPLE_QUOTER_ADDRESS",
    "marking": "0x00000C",
    "zeroForOne": true
  },
  {
    "asset0": "0xTOKEN_A_ADDRESS",
    "asset1": "0xTOKEN_B_ADDRESS",
    "quoter": "0xALPHA_QUOTER_ADDRESS",
    "marking": "0x00000E",
    "zeroForOne": true
  },
  {
    "asset0": "0xTOKEN_A_ADDRESS",
    "asset1": "0xTOKEN_B_ADDRESS",
    "quoter": "0xDUAL_QUOTER_ADDRESS",
    "marking": "0x00000F",
    "zeroForOne": true
  }
]
```

Call `batchSwap(hops, amountIn, minAmountOut)`:
- `amountIn`: `5000000000000000000`   // 5e18
- `minAmountOut`: `3000000000000000000` // 3e18 (example; adjust per path)

### Quick reference values
- bytes3 markings:
  - Simple: `0x00000C`
  - Alpha:  `0x00000E`
  - Beta:   `0x00000D`
  - Dual:   `0x00000F`

- Suggested market data (if using mocks):
  - Alpha spot: `1300000000000000000` (1.3e18)
  - Alpha TWAP: `1280000000000000000` (1.28e18)
  - Beta spot:  `1320000000000000000` (1.32e18)

### Troubleshooting
- Revert `Alpha/Beta address is zero`:
  - Ensure `PoolManager` was deployed with `defaultAlpha = 0xALPHA_DATA_ADDRESS` and `defaultBeta = 0xBETA_DATA_ADDRESS`.
  - Ensure markings set both default flags (use `0x00000F` for dual).
- No output / low output:
  - Provide sufficient liquidity and check token approvals.
  - Keep asset order consistent across `createPool`, `addLiquidity`, and `swap`.

