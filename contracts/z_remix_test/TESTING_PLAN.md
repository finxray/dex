# PoolManager Testing Plan for Remix

## 📋 **Overview**
This document provides a comprehensive testing plan for the PoolManager contract and related functionality in Remix IDE.

## 🎯 **Test Objectives**
1. **Pool Creation** - Test `createPool()` and `assemblePoolID()`
2. **Liquidity Management** - Test `addLiquidity()` and `removeLiquidity()`
3. **Swapping** - Test `swap()` functionality
4. **Asset Handling** - Test both ETH and ERC20 interactions
5. **Inventory Tracking** - Verify pool balance tracking

## 🏗️ **Test Scenarios**

### **Scenario 1: ETH + ERC20 Pool**
- **asset0**: `0x0000000000000000000000000000000000000000` (ETH)
- **asset1**: TestTokenA contract address
- **Test Flow**: Create → Add Liquidity → Swap → Remove Liquidity

### **Scenario 2: ERC20 + ERC20 Pool**  
- **asset0**: TestTokenA contract address (if < TestTokenB address)
- **asset1**: TestTokenB contract address
- **Test Flow**: Create → Add Liquidity → Swap → Remove Liquidity

## 📝 **Testing Steps**

### **Phase 1: Setup**
1. Deploy `TestTokenA` contract
2. Deploy `TestTokenB` contract  
3. Deploy `PoolManager` contract
4. Mint test tokens to your address
5. Approve PoolManager to spend your tokens

### **Phase 2: Pool Creation**
1. Test `assemblePoolID()` function with various inputs
2. Create ETH/TokenA pool
3. Create TokenA/TokenB pool
4. Verify pool creation events

### **Phase 3: Liquidity Operations**
1. Add liquidity to ETH/TokenA pool (send ETH + approve tokens)
2. Add liquidity to TokenA/TokenB pool (approve both tokens)
3. Check pool inventories
4. Remove partial liquidity
5. Check final balances

### **Phase 4: Swap Operations**
1. Swap ETH for TokenA
2. Swap TokenA for ETH
3. Swap TokenA for TokenB
4. Swap TokenB for TokenA
5. Verify inventory updates

### **Phase 5: Edge Cases**
1. Test with zero amounts
2. Test slippage protection
3. Test insufficient balance scenarios
4. Test duplicate pool creation

## ⚠️ **Important Notes**
- Always use the **lowest address first** for asset0/asset1 ordering
- ETH address is `0x0000000000000000000000000000000000000000`
- Remember to send ETH value when adding liquidity to ETH pools
- Always approve tokens before operations
- Pool IDs are deterministic based on assets, quoter, and markings

## 🎮 **Ready to Test!**
All test parameters and inputs are provided in `test_parameters.json`