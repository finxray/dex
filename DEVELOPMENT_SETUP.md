# 🚀 Best Development Setup for Simultaneous Solidity + UI Development

## Recommended Approach: **Hardhat Localhost**

For developing both Solidity contracts and UI simultaneously with real MetaMask, **Hardhat Localhost** is the best choice:

### ✅ Advantages:
- ⚡ **Fast**: Instant transactions (no network latency)
- 💰 **Free**: No gas costs, unlimited test ETH
- 🔄 **Resettable**: Can restart node to reset state
- 📍 **Deterministic**: Same addresses every time (don't need to update .env.local)
- 🦊 **MetaMask Compatible**: Works with real MetaMask wallet
- 🧪 **Perfect for Development**: Fast iteration cycle

### ❌ Disadvantages:
- Not testing on real network conditions
- Need to import Hardhat account to MetaMask

---

## 🛠️ Setup Instructions

### Step 1: Start Hardhat Node

```bash
cd /Users/alexey/dex
# Don't set MAINNET_RPC to avoid forking
MAINNET_RPC="" npx hardhat node
```

This starts a local Hardhat node on `http://127.0.0.1:8545` with:
- Chain ID: `31337`
- 20 test accounts with 10,000 ETH each
- Deterministic addresses

### Step 2: Deploy Contracts

In a **new terminal**:

```bash
cd /Users/alexey/dex
MAINNET_RPC="" npx hardhat run scripts/deployStoixTestPool.js --network localhost
```

This will output the deployed addresses. They should match what's in `.env.local` (deterministic).

### Step 3: Configure MetaMask

1. **Add Hardhat Network to MetaMask:**
   - Open MetaMask → Network dropdown → "Add network" → "Add network manually"
   - **Network name:** `Hardhat Local`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency symbol:** `ETH`
   - Click "Save"

2. **Import Hardhat Account to MetaMask:**
   - MetaMask → Account menu → "Import account"
   - Enter private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This account has: **10,000 ETH + 1,000 sWETH + 3,000,000 sUSDC**

### Step 4: Start Web App

In a **new terminal**:

```bash
cd /Users/alexey/dex/apps/web
npm run dev
# or
pnpm dev --filter web
```

### Step 5: Test!

1. Open `http://localhost:3000`
2. Connect MetaMask (select "Hardhat Local" network)
3. Use the imported account (has tokens pre-loaded)
4. Test your swaps!

---

## 🔄 Development Workflow

### When You Change Solidity Code:

1. **Recompile:**
   ```bash
   cd /Users/alexey/dex
   npx hardhat compile
   ```

2. **Restart Hardhat Node** (Ctrl+C, then restart)
   ```bash
   MAINNET_RPC="" npx hardhat node
   ```

3. **Redeploy Contracts:**
   ```bash
   MAINNET_RPC="" npx hardhat run scripts/deployStoixTestPool.js --network localhost
   ```

4. **Refresh Web App** (addresses stay the same, so no .env.local update needed!)

### When You Change UI Code:

- Just refresh the browser - hot reload handles it!

---

## 🌐 Alternative: Sepolia Testnet (For Final Testing)

Once your contracts are stable, test on **Sepolia Testnet** for real network conditions:

### Setup Sepolia:

1. **Get Sepolia ETH:**
   - Visit: https://sepoliafaucet.com/ or https://faucet.quicknode.com/ethereum/sepolia
   - Request testnet ETH to your MetaMask address

2. **Add Sepolia Network to Hardhat Config:**
   ```javascript
   // In hardhat.config.js
   networks: {
     sepolia: {
       url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY",
       accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
     },
   }
   ```

3. **Deploy to Sepolia:**
   ```bash
   npx hardhat run scripts/deployStoixTestPool.js --network sepolia
   ```

4. **Update .env.local:**
   ```bash
   NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
   # ... update with new Sepolia addresses
   ```

---

## 📊 Comparison Table

| Feature | Hardhat Localhost | Sepolia Testnet |
|---------|------------------|-----------------|
| Speed | ⚡ Instant | 🐌 Network latency |
| Cost | 💰 Free | 💰 Free (but limited) |
| Reset State | ✅ Easy | ❌ No |
| Deterministic | ✅ Yes | ❌ No |
| Real Network | ❌ No | ✅ Yes |
| MetaMask | ✅ Works | ✅ Works |
| Best For | 🎯 Development | 🎯 Final Testing |

---

## 💡 Recommendation

**Use Hardhat Localhost for 90% of your development**, then test on Sepolia before production.

This gives you:
- Fast iteration cycles
- No faucet delays
- Easy state resets
- Real MetaMask testing
- Deterministic addresses (no constant .env updates)

