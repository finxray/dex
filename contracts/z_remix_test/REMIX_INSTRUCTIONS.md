# 🎮 Step-by-Step Remix Testing Instructions

## 📋 **Pre-Setup Checklist**
- [ ] Have Remix IDE open
- [ ] Connect to a test network (Sepolia/Goerli) or use Remix VM
- [ ] Have test ETH in your wallet
- [ ] Copy all contract files to Remix

---

## 🚀 **PHASE 1: Deploy Test Contracts**

### **Step 1.1: Deploy TestTokenA**
1. **File**: `z_remix_test/TestTokenA.sol`
2. **Constructor**: *No parameters needed*
3. **Action**: Click Deploy
4. **Note**: Copy the deployed address → Replace `TOKEN_A_ADDRESS_HERE` in parameters

### **Step 1.2: Deploy TestTokenB**
1. **File**: `z_remix_test/TestTokenB.sol`
2. **Constructor**: *No parameters needed*
3. **Action**: Click Deploy
4. **Note**: Copy the deployed address → Replace `TOKEN_B_ADDRESS_HERE` in parameters

### **Step 1.3: Deploy PoolManager**
1. **File**: `contracts/PoolManager.sol`
2. **Constructor Parameters**:
```
_defaultAlpha: 0x1111111111111111111111111111111111111111
_defaultBeta: 0x2222222222222222222222222222222222222222
```
3. **Action**: Click Deploy
4. **Note**: Copy the deployed address for approvals

---

## 🏦 **PHASE 2: Setup Token Balances & Approvals**

### **Step 2.1: Mint Test Tokens**
**On TestTokenA Contract:**
```
Function: mint
to: YOUR_WALLET_ADDRESS
amount: 10000000000000000000000
```

**On TestTokenB Contract:**
```
Function: mint  
to: YOUR_WALLET_ADDRESS
amount: 10000000000000000000000
```

### **Step 2.2: Approve PoolManager**
**On TestTokenA Contract:**
```
Function: approve
spender: POOLMANAGER_CONTRACT_ADDRESS
amount: 115792089237316195423570985008687907853269984665640564039457584007913129639935
```

**On TestTokenB Contract:**
```
Function: approve
spender: POOLMANAGER_CONTRACT_ADDRESS  
amount: 115792089237316195423570985008687907853269984665640564039457584007913129639935
```

---

## 🏊 **PHASE 3: Pool Creation & Testing**

### **Step 3.1: Test assemblePoolID Function**
**Call assemblePoolID with ETH/TokenA parameters:**
```
Function: assemblePoolID (from PoolIDAssembly library)
asset0: 0x0000000000000000000000000000000000000000
asset1: YOUR_TOKENA_ADDRESS
quoter: 0x1111111111111111111111111111111111111111
markings: 0x123456
```
**Note**: Copy the returned poolID for next steps

### **Step 3.2: Create ETH/TokenA Pool**
```
Function: createPool
asset0: 0x0000000000000000000000000000000000000000
asset1: YOUR_TOKENA_ADDRESS
quoter: 0x1111111111111111111111111111111111111111
markings: 0x123456
```

### **Step 3.3: Create TokenA/TokenB Pool**
**First determine address ordering:**
- If TokenA address < TokenB address: asset0=TokenA, asset1=TokenB
- If TokenB address < TokenA address: asset0=TokenB, asset1=TokenA

```
Function: createPool
asset0: LOWER_ADDRESS_TOKEN
asset1: HIGHER_ADDRESS_TOKEN
quoter: 0x1111111111111111111111111111111111111111
markings: 0xabcdef
```

---

## 💧 **PHASE 4: Liquidity Operations**

### **Step 4.1: Add Liquidity to ETH/TokenA Pool**
```
Function: addLiquidity
ETH Value: 1000000000000000000 (1 ETH)
poolID: ETH_TOKENA_POOL_ID_FROM_STEP_3.1
asset0: 0x0000000000000000000000000000000000000000
asset1: YOUR_TOKENA_ADDRESS
amount0: 1000000000000000000
amount1: 1000000000000000000000
```

### **Step 4.2: Check Pool Inventory**
```
Function: inventory
poolID: ETH_TOKENA_POOL_ID_FROM_STEP_3.1
```
**Expected**: Should show ~1 ETH and ~1000 TokenA

### **Step 4.3: Add Liquidity to TokenA/TokenB Pool**
```
Function: addLiquidity
ETH Value: 0
poolID: TOKENA_TOKENB_POOL_ID
asset0: LOWER_ADDRESS_TOKEN
asset1: HIGHER_ADDRESS_TOKEN  
amount0: 1000000000000000000000
amount1: 500000000000000000000
```

---

## 🔄 **PHASE 5: Swap Operations**

### **Step 5.1: Swap ETH for TokenA**
```
Function: swap
ETH Value: 100000000000000000 (0.1 ETH)
poolID: ETH_TOKENA_POOL_ID
asset0: 0x0000000000000000000000000000000000000000
asset1: YOUR_TOKENA_ADDRESS
amountIn: 100000000000000000
zeroForOne: true
minAmountOut: 100000000000000000000
```

### **Step 5.2: Swap TokenA for ETH** 
```
Function: swap
ETH Value: 0
poolID: ETH_TOKENA_POOL_ID
asset0: 0x0000000000000000000000000000000000000000
asset1: YOUR_TOKENA_ADDRESS
amountIn: 130000000000000000000
zeroForOne: false
minAmountOut: 50000000000000000
```

### **Step 5.3: Swap TokenA for TokenB**
```
Function: swap
ETH Value: 0
poolID: TOKENA_TOKENB_POOL_ID
asset0: LOWER_ADDRESS_TOKEN
asset1: HIGHER_ADDRESS_TOKEN
amountIn: 100000000000000000000
zeroForOne: (true if TokenA is asset0, false if TokenA is asset1)
minAmountOut: 100000000000000000000
```

---

## 🏃 **PHASE 6: Remove Liquidity**

### **Step 6.1: Check LP Balance**
```
Function: balanceOf
owner: YOUR_WALLET_ADDRESS
id: POOL_ID
```

### **Step 6.2: Remove Partial Liquidity**
```
Function: removeLiquidity
poolID: POOL_ID_TO_REMOVE_FROM
asset0: SAME_AS_ADDLIQUIDITY
asset1: SAME_AS_ADDLIQUIDITY  
liquidity: HALF_OF_YOUR_LP_BALANCE
```

---

## ✅ **Verification Steps**

### **After Each Operation, Check:**
1. **Pool Inventory**: `inventory(poolID)`
2. **LP Balance**: `balanceOf(yourAddress, poolID)`
3. **Token Balances**: Check your wallet token balances
4. **ETH Balance**: Check your ETH balance
5. **Events**: Check transaction logs for events

---

## 🐛 **Common Issues & Solutions**

| **Issue** | **Solution** |
|-----------|-------------|
| "Insufficient ETH" | Send ETH value when calling ETH-related functions |
| "Transfer failed" | Make sure tokens are approved for PoolManager |
| "Address sorting" | Always use lower address as asset0 |
| "Pool not found" | Use correct poolID from assemblePoolID |
| "Slippage exceeded" | Lower minAmountOut parameter |
| "Insufficient balance" | Check you have enough tokens/ETH |

---

## 🎯 **Expected Results**

### **Successful Test Should Show:**
- ✅ Pools created with correct IDs
- ✅ Liquidity added and LP tokens minted
- ✅ Swaps executed with correct outputs
- ✅ Inventory updates after each operation
- ✅ Liquidity removed and assets returned
- ✅ All balances updated correctly

**🎉 If all tests pass, your PoolManager is working correctly!**