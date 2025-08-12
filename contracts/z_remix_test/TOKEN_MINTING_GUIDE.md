# 🪙 Token Minting Guide - Copy & Paste Values

## 📋 Overview
Complete guide with exact values to copy-paste for minting test tokens in Remix IDE for PoolManager swap testing.

---

## 🚀 Step-by-Step Minting Instructions

### Step 1: Deploy Test Tokens
Deploy these contracts in Remix:
1. `TestTokenA.sol`
2. `TestTokenB.sol`

### Step 2: Mint Tokens for Testing

#### 🅰️ **Token A Minting**
In Remix, go to your deployed `TestTokenA` contract and call:

**Function:** `mint`
**Parameters:**
```
to: 0xYourTestAddress
amount: 10000000000000000000000
```

**Copy-Paste Value for Amount:**
```
10000000000000000000000
```
*(This equals 10,000 Token A)*

---

#### 🅱️ **Token B Minting**
In Remix, go to your deployed `TestTokenB` contract and call:

**Function:** `mint`
**Parameters:**
```
to: 0xYourTestAddress  
amount: 10000000000000000000000
```

**Copy-Paste Value for Amount:**
```
10000000000000000000000
```
*(This equals 10,000 Token B)*

---

## 💰 Token Approval Values

After minting, approve tokens for PoolManager:

### 🅰️ **Token A Approval**
**Function:** `approve`
**Parameters:**
```
spender: 0xPoolManagerAddress
amount: 5000000000000000000000
```

**Copy-Paste Value for Amount:**
```
5000000000000000000000
```
*(This equals 5,000 Token A approval)*

---

### 🅱️ **Token B Approval**
**Function:** `approve`  
**Parameters:**
```
spender: 0xPoolManagerAddress
amount: 5000000000000000000000
```

**Copy-Paste Value for Amount:**
```
5000000000000000000000
```
*(This equals 5,000 Token B approval)*

---

## 📊 Usage Breakdown

### **What You're Minting:**
- **Token A**: 10,000 tokens
- **Token B**: 10,000 tokens
- **Total**: 20,000 tokens

### **How They'll Be Used:**
```
Initial Liquidity:
- Token A: 1,000 tokens
- Token B: 1,300 tokens

Swap Testing:
- Small swaps: 1-10 tokens each
- Large swaps: up to 100 tokens each
- Multiple test rounds: ~500 tokens total

Safety Buffer: 8,000+ tokens remaining
```

---

## 🔧 Alternative: Unlimited Approval

For easier testing, you can approve unlimited tokens:

### **Unlimited Approval Amount:**
```
115792089237316195423570985008687907853269984665640564039457584007913129639935
```

**Use this for both Token A and Token B approvals if you want to avoid re-approving during testing.**

---

## ⚡ Quick Setup Sequence

### **Copy-Paste Checklist:**

1. **Deploy TestTokenA** ✅
2. **Deploy TestTokenB** ✅
3. **Mint Token A:**
   ```
   mint(0xYourAddress, 10000000000000000000000)
   ```
4. **Mint Token B:**
   ```
   mint(0xYourAddress, 10000000000000000000000)
   ```
5. **Approve Token A:**
   ```
   approve(0xPoolManagerAddress, 5000000000000000000000)
   ```
6. **Approve Token B:**
   ```
   approve(0xPoolManagerAddress, 5000000000000000000000)
   ```

---

## 🔍 Verification

### **Check Your Balances:**
Call `balanceOf(0xYourAddress)` on both tokens.

**Expected Results:**
- Token A balance: `10000000000000000000000` (10,000 tokens)
- Token B balance: `10000000000000000000000` (10,000 tokens)

### **Check Your Allowances:**
Call `allowance(0xYourAddress, 0xPoolManagerAddress)` on both tokens.

**Expected Results:**
- Token A allowance: `5000000000000000000000` (5,000 tokens)
- Token B allowance: `5000000000000000000000` (5,000 tokens)

---

## 🎯 Ready for Testing!

Once you've completed these steps, you're ready to:

1. **Deploy PoolManagerSwapTester**
2. **Update contract addresses** in the tester
3. **Call setupTest()** (this will also configure the non-default beta bridge)
4. **Call addInitialLiquidity()** 
5. **Run swap tests**

---

## 💡 Pro Tips

### **Gas Optimization:**
- Mint tokens in a single transaction when possible
- Use unlimited approval to avoid re-approving
- Keep some ETH for gas fees (0.1 ETH should be plenty)

### **Testing Strategy:**
- Start with small amounts to verify everything works
- Scale up to larger amounts once confirmed
- Monitor your token balances throughout testing

### **Troubleshooting:**
- If minting fails, check if the token contract has a mint function
- If approval fails, make sure PoolManager address is correct
- If you run out of tokens, just mint more with the same values

---

**You're all set for comprehensive swap testing! 🚀**