# 📱 Import Account to MetaMask Mobile App

This guide will help you import the test account with sWETH and sUSDC tokens into the MetaMask mobile app, connecting to your local Hardhat network via LAN.

## Prerequisites

1. **Hardhat node must be running** and accessible from your LAN
2. **Your computer and mobile device** must be on the same Wi-Fi network
3. **Hardhat node IP address** - You need to find your computer's LAN IP address

---

## Step 1: Find Your Computer's LAN IP Address

### On macOS/Linux:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Or:
```bash
ipconfig getifaddr en0
```

Look for an IP address like `192.168.1.XXX` or `192.168.0.XXX`

### On Windows:
```bash
ipconfig
```

Look for "IPv4 Address" under your active network adapter (usually `192.168.1.XXX` or `192.168.0.XXX`)

**Example:** If your computer's IP is `192.168.1.100`, your Hardhat RPC URL will be:
```
http://192.168.1.100:8545
```

---

## Step 2: Verify Hardhat Node is Accessible

Make sure Hardhat node is running with `--hostname 0.0.0.0`:

```bash
cd /Users/alexey/dex
MAINNET_RPC="" npx hardhat node --hostname 0.0.0.0
```

Or use the restart script:
```bash
npm run deploy:local
```

The node should show:
```
Started HTTP and WebSocket JSON-RPC server at http://0.0.0.0:8545/
```

**Important:** The node must be running with `--hostname 0.0.0.0` to accept connections from other devices on your network.

---

## Step 3: Add Hardhat Network to MetaMask Mobile

1. **Open MetaMask mobile app** on your phone
2. Tap the **menu icon** (☰) in the top left
3. Tap **"Settings"**
4. Tap **"Networks"**
5. Tap **"Add Network"** → **"Add a network manually"**
6. Enter the following details:
   - **Network Name:** `Hardhat Local`
   - **RPC URL:** `http://192.168.1.XXX:8545` (replace XXX with your computer's IP)
     - Example: `http://192.168.1.100:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** `ETH`
   - **Block Explorer URL:** (leave empty)
7. Tap **"Save"**

**⚠️ Important:** Use your computer's actual LAN IP address, not `localhost` or `127.0.0.1`

---

## Step 4: Import the Account

1. In MetaMask mobile app, tap the **account icon** (top right, shows your current account)
2. Tap **"Import account"** or **"Add account"** → **"Import account"**
3. Select **"Private key"**
4. Paste this private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
5. Tap **"Import"**

**Account Details:**
- **Address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Balance:** 10,000 ETH (test ETH)
- **sWETH:** 5,000 tokens (after deployment)
- **sUSDC:** 15,000,000 tokens (after deployment)

---

## Step 5: Switch to Hardhat Network

1. In MetaMask mobile app, tap the **network name** at the top (usually shows "Ethereum Mainnet")
2. Select **"Hardhat Local"** from the list
3. Make sure you see the account you just imported

---

## Step 6: Add Token Contracts

After switching to Hardhat network, you need to add the token contracts to see your balances.

### Add sWETH Token:

1. In MetaMask mobile app, scroll down on the main screen
2. Tap **"Import tokens"**
3. Tap **"Custom Token"**
4. Enter:
   - **Token Contract Address:** `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`
   - **Token Symbol:** `sWETH`
   - **Token Decimals:** `18`
5. Tap **"Import"**

### Add sUSDC Token:

1. Tap **"Import tokens"** again
2. Tap **"Custom Token"**
3. Enter:
   - **Token Contract Address:** `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`
   - **Token Symbol:** `sUSDC`
   - **Token Decimals:** `6`
4. Tap **"Import"`

**Note:** Token addresses may vary if you deployed with different nonces. Check your deployment script output for the actual addresses.

---

## Step 7: Verify Your Balances

1. Make sure you're on **"Hardhat Local"** network
2. Make sure you're viewing the imported account
3. You should see:
   - **ETH:** 10,000 ETH
   - **sWETH:** 5,000 sWETH (or amount minted during deployment)
   - **sUSDC:** 15,000,000 sUSDC (or amount minted during deployment)

---

## Troubleshooting

### Can't Connect to Hardhat Node?

1. **Check IP address:** Make sure you're using your computer's LAN IP (not `localhost` or `127.0.0.1`)
2. **Check network:** Make sure your phone and computer are on the same Wi-Fi network
3. **Check firewall:** Make sure your computer's firewall allows connections on port 8545
4. **Check Hardhat node:** Make sure it's running with `--hostname 0.0.0.0`
5. **Test connection:** Try opening `http://192.168.1.XXX:8545` in your phone's browser - you should see a JSON response

### Firewall Settings (macOS)

If you can't connect, you may need to allow incoming connections:

1. **System Settings** → **Network** → **Firewall**
2. Click **"Firewall Options"**
3. Make sure **"Block all incoming connections"** is **OFF**
4. Or add an exception for Node.js/Hardhat

### Firewall Settings (Windows)

1. **Windows Defender Firewall** → **Advanced Settings**
2. **Inbound Rules** → **New Rule**
3. Select **Port** → **TCP** → **Specific local ports:** `8545`
4. Allow the connection

### Tokens Not Showing?

1. **Check network:** Make sure you're on "Hardhat Local" network
2. **Check token addresses:** Verify addresses match deployment output
3. **Check deployment:** Make sure contracts were deployed successfully
4. **Refresh:** Pull down to refresh in MetaMask app

### Wrong Token Addresses?

If your token addresses are different:
- Check the deployment script output for actual addresses
- Use those addresses when importing tokens

### Account Has No Tokens?

1. **Verify deployment:** Make sure `deployStoixTestPool.js` ran successfully
2. **Check deployer:** Tokens are minted to the deployer account (first Hardhat account)
3. **Redeploy:** If needed, restart Hardhat node and redeploy contracts

---

## Quick Reference

### Default Hardhat Account
- **Private Key:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

### Token Addresses (Standard Deployment)
- **sWETH:** `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e` (18 decimals)
- **sUSDC:** `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0` (6 decimals)

### Network Settings for Mobile
- **Network Name:** Hardhat Local
- **RPC URL:** `http://192.168.1.XXX:8545` (use your computer's LAN IP)
- **Chain ID:** `31337`
- **Currency:** ETH

---

## Security Warning ⚠️

**NEVER share your private keys or use these accounts on mainnet!**

These are test accounts for local development only. The private key above is publicly known and should **ONLY** be used for local testing.

---

## Alternative: Using Your Computer's Hostname

If your computer has a hostname (like `alexey-mac.local`), you can also use that instead of the IP:

```
http://alexey-mac.local:8545
```

However, IP addresses are more reliable for mobile connections.

