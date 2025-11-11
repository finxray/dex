# Hardhat Node Management & Deployment Guide

## Quick Commands

```bash
# Automatically restart node (if needed) and deploy contracts
npm run deploy:local

# Start Hardhat node manually
npm run node:start

# Stop Hardhat node
npm run node:stop

# Restart Hardhat node
npm run node:restart
```

## How It Works

1. **Automatic Gas Price Check**: The deployment script checks if gas prices are too high (>5 gwei)
2. **Auto Restart**: If gas is too high or node isn't running, it automatically restarts the node
3. **Consistent Addresses**: Hardhat addresses are deterministic based on:
   - Deployer account (always the first account)
   - Nonce (starts at 0 when node restarts)
   - Deployment order (must be the same)

## Important Notes

- **Always restart Hardhat node before deploying** to ensure consistent addresses
- The script `restartAndDeploy.js` does this automatically
- Standard Hardhat addresses (with nonce 0) are:
  - First contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
  - Second contract: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`

## If You Need Different Addresses

If you need specific addresses (like `0xB7f8BC63...`), you need to:
1. Deploy contracts in the exact same order as before
2. Use the exact same contract bytecode
3. Use the exact same constructor arguments

The addresses `0xB7f8BC63...` and `0xA51c1fc2...` suggest they were deployed with nonce 1 and 2 (after deploying something else first).

## Current Setup

- ✅ Automatic gas price checking
- ✅ Automatic node restart when needed
- ✅ Consistent deployment addresses
- ✅ `.env.local` is updated automatically with deployed addresses

