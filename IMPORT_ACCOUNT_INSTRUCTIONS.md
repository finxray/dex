# 📥 How to Import Account with sWETH and sUSDC Tokens

This guide will help you import a test account into MetaMask that has sWETH and sUSDC tokens for testing on your local Hardhat network.

## Prerequisites

1. **Hardhat node must be running** on `http://127.0.0.1:8545`
2. **Contracts must be deployed** (tokens minted to deployer account)

---

## Step 1: Start Hardhat Node (if not running)

```bash
cd /Users/alexey/dex
MAINNET_RPC="" npx hardhat node
```

This starts a local Hardhat node with:
- Chain ID: `31337`
- 20 test accounts with 10,000 ETH each
- RPC URL: `http://127.0.0.1:8545`

**Keep this terminal running!**

---

## Step 2: Deploy Contracts (if not already deployed)

In a **new terminal**:

```bash
cd /Users/alexey/dex
MAINNET_RPC="" npx hardhat run scripts/deployStoixTestPool.js --network localhost
```

This will:
- Deploy sWETH token (5,000 tokens minted to deployer)
- Deploy sUSDC token (15,000,000 tokens minted to deployer)
- Deploy PoolManager and other contracts
- Create initial liquidity pool

**Note:** The deployer account (first Hardhat account) will receive all the tokens.

---

## Step 3: Add Hardhat Network to MetaMask

1. **Open MetaMask** extension
2. Click the **network dropdown** (top of MetaMask, usually shows "Ethereum Mainnet")
3. Click **"Add network"** → **"Add network manually"**
4. Enter the following details:
   - **Network name:** `Hardhat Local`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency symbol:** `ETH`
   - **Block explorer URL:** (leave empty)
5. Click **"Save"**

---

## Step 4: Import the Account with Tokens

The **first Hardhat account** (deployer) receives all tokens when contracts are deployed.

### Option A: Import Using Private Key (Recommended)

1. In MetaMask, click the **account icon** (top right)
2. Click **"Import account"**
3. Select **"Private key"** tab
4. Paste this private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
5. Click **"Import"**

**Account Details:**
- **Address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Balance:** 10,000 ETH (test ETH)
- **sWETH:** 5,000 tokens (after deployment)
- **sUSDC:** 15,000,000 tokens (after deployment)

### Option B: Import Using Seed Phrase

If you prefer using a seed phrase, you can generate one from the private key using a tool, but **private key import is simpler for testing**.

---

## Step 5: Add Token Contracts to MetaMask

After importing the account, you need to add the token contracts so MetaMask displays your balances.

### Add sWETH Token:

1. In MetaMask, make sure you're on **"Hardhat Local"** network
2. Scroll down and click **"Import tokens"**
3. Click **"Custom Token"** tab
4. Enter:
   - **Token Contract Address:** `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`
   - **Token Symbol:** `sWETH`
   - **Decimals:** `18`
5. Click **"Add Custom Token"** → **"Import Tokens"**

### Add sUSDC Token:

1. Click **"Import tokens"** again
2. Click **"Custom Token"** tab
3. Enter:
   - **Token Contract Address:** `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`
   - **Token Symbol:** `sUSDC`
   - **Decimals:** `6`
4. Click **"Add Custom Token"** → **"Import Tokens"**

**Note:** Token addresses may vary if you deployed with different nonces. Check your deployment script output for the actual addresses.

---

## Step 6: Verify Your Balances

1. In MetaMask, switch to the imported account
2. Make sure you're on **"Hardhat Local"** network
3. You should see:
   - **ETH:** 10,000 ETH
   - **sWETH:** 5,000 sWETH (or amount minted during deployment)
   - **sUSDC:** 15,000,000 sUSDC (or amount minted during deployment)

---

## Troubleshooting

### Tokens Not Showing?

1. **Check network:** Make sure you're on "Hardhat Local" network (Chain ID 31337)
2. **Check token addresses:** Verify the token addresses match what was deployed
3. **Check deployment:** Make sure contracts were deployed successfully
4. **Refresh:** Try refreshing MetaMask or re-importing tokens

### Wrong Token Addresses?

If your token addresses are different (e.g., `0x5FbDB...` instead of `0xB7f8BC...`):
- This happens if contracts were deployed with different nonces
- Check the deployment script output for actual addresses
- Use those addresses when importing tokens in MetaMask

### Account Has No Tokens?

1. **Verify deployment:** Check that `deployStoixTestPool.js` ran successfully
2. **Check deployer:** Tokens are minted to the deployer account (first Hardhat account)
3. **Redeploy:** If needed, restart Hardhat node and redeploy contracts

### Can't Connect to Hardhat Node?

1. **Check if node is running:** Look for `Started HTTP and WebSocket JSON-RPC server` in terminal
2. **Check RPC URL:** Make sure it's `http://127.0.0.1:8545` (not `localhost`)
3. **Check firewall:** Make sure port 8545 is not blocked
4. **Restart node:** Stop and restart the Hardhat node

---

## Alternative: Transfer Tokens to Another Account

If you want to use a different account:

1. **Import the deployer account** (has all tokens)
2. **Create a new account** in MetaMask
3. **Transfer tokens** from deployer to new account:
   - In MetaMask, click on sWETH token
   - Click "Send"
   - Enter new account address
   - Enter amount
   - Confirm transaction

---

## Quick Reference

### Default Hardhat Account (Deployer)
- **Private Key:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **ETH Balance:** 10,000 ETH

### Token Addresses (Standard Deployment)
- **sWETH:** `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`
- **sUSDC:** `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`

### Network Settings
- **Network Name:** Hardhat Local
- **RPC URL:** `http://127.0.0.1:8545`
- **Chain ID:** `31337`
- **Currency:** ETH

---

## Security Warning ⚠️

**NEVER share your private keys or use these accounts on mainnet!**

These are test accounts for local development only. The private key above is publicly known and should **ONLY** be used for local testing.

