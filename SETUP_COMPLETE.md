# 🎉 Stoix Protocol - Setup Complete!

## ✅ What's Running

### 1. **Hardhat Local Network** (Port 8545)
- Network running with 20 test accounts (10,000 ETH each)
- Chain ID: `31337`
- RPC: `http://127.0.0.1:8545`

### 2. **Deployed Contracts**

```
sWETH (Test Token):        0x5FbDB2315678afecb367f032d93F642f64180aa3
sUSDC (Test Token):        0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Mock Data Bridge:          0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Dummy Quoter:              0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
PoolManager:               0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
LiquidityManager:          0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
Pool ID:                   64183145747052801899089615775139693548969025191935745718732033419386028827530
```

**Initial Liquidity:** 100 sWETH + 300,000 sUSDC

### 3. **Web App** (Port 3000)
- Running at: `http://localhost:3000`
- Swap interface accessible via "Launch App" button

---

## 🦊 MetaMask Setup

### Add Hardhat Network to MetaMask

1. Open MetaMask → Click network dropdown → "Add network" → "Add network manually"
2. Enter:
   - **Network name:** `Hardhat Local`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency symbol:** `ETH`
3. Click "Save"

### Import Test Account

Import this private key to get test ETH and tokens:

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Account address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
**Balance:** 10,000 ETH + 1,000 sWETH + 3,000,000 sUSDC

---

## 🧪 Testing the Swap

1. **Open the app:** `http://localhost:3000`
2. **Click "Launch App"** button
3. **Connect wallet:** Click "Connect Wallet" and select MetaMask
4. **Enter amount:** Type amount of sWETH to swap (e.g., `1`)
5. **Approve token:** Click "Approve sWETH" button and confirm in MetaMask
6. **Execute swap:** Click "Swap sWETH for sUSDC" and confirm in MetaMask
7. **Check result:** Transaction hash will appear with link to view

### Switch Direction

Click "Switch Direction" to swap sUSDC → sWETH instead.

---

## 📁 Important Files

### Configuration
- **Contract addresses:** `/Users/alexey/dex/apps/web/.env.local`
- **Hardhat config:** `/Users/alexey/dex/hardhat.config.js`

### Deployment Script
- **Location:** `/Users/alexey/dex/scripts/deployStoixTestPool.js`
- **Usage:** `npx hardhat run scripts/deployStoixTestPool.js --network localhost`

### Web App
- **Main page:** `/Users/alexey/dex/apps/web/src/app/page.tsx`
- **Swap modal:** `/Users/alexey/dex/apps/web/src/app/components/Swap/SwapModal.tsx`
- **Header:** `/Users/alexey/dex/apps/web/src/app/components/Header/Header.tsx`

---

## 🔄 Restarting Services

### If you close everything and want to restart:

```bash
# Terminal 1: Start Hardhat node
cd /Users/alexey/dex
MAINNET_RPC="" npx hardhat node

# Terminal 2: Deploy contracts
cd /Users/alexey/dex
MAINNET_RPC="" npx hardhat run scripts/deployStoixTestPool.js --network localhost

# Terminal 3: Start web app
cd /Users/alexey/dex/apps/web
npm run dev
```

### Quick restart (contracts already deployed):

```bash
# Terminal 1: Hardhat node
cd /Users/alexey/dex && MAINNET_RPC="" npx hardhat node

# Terminal 2: Web app
cd /Users/alexey/dex/apps/web && npm run dev
```

**Note:** If you restart the Hardhat node, you'll need to redeploy contracts and update `.env.local` with new addresses.

---

## 🚀 Next Steps

### For Production/Testnet Deployment:

1. **Get testnet ETH:** Visit a Sepolia faucet
2. **Update hardhat.config.js:** Add your RPC URL and private key
3. **Deploy to Sepolia:**
   ```bash
   npx hardhat run scripts/deployStoixTestPool.js --network sepolia
   ```
4. **Update `.env.local`** with deployed addresses
5. **Change RPC URL** in `.env.local` to Sepolia RPC

### Customize the Pool:

Edit `scripts/deployStoixTestPool.js` to:
- Change initial token supplies
- Adjust initial liquidity amounts
- Use different token names/symbols
- Deploy multiple pools

---

## 🐛 Troubleshooting

### Port already in use:
```bash
lsof -i :8545  # Find process
kill -9 <PID>  # Kill it
```

### Nonce issues in MetaMask:
Settings → Advanced → Clear activity tab data

### Contract addresses changed:
After redeploying, copy new addresses from terminal output to `/Users/alexey/dex/apps/web/.env.local`

---

## 📝 Notes

- The dummy quoter returns a fixed 1:1000 ratio (not realistic pricing)
- For production, replace with real Stoicov quoter and data bridge
- All test accounts and private keys are publicly known - never use on mainnet!
- Pool markings `0x000000` = no special features enabled

**Happy swapping! 🎊**

