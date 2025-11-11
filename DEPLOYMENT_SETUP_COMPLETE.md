✅ **Setup Complete!**

## What I've Done:

1. **Created automatic restart script** (`scripts/restartAndDeploy.js`):
   - Checks if Hardhat node is running
   - Checks if gas prices are too high (>5 gwei)
   - Automatically restarts node if needed
   - Deploys contracts automatically

2. **Updated deployment script** (`scripts/deployStoixTestPool.js`):
   - Checks gas prices before deploying
   - Warns if gas is too high
   - Checks for existing contracts at expected addresses

3. **Added npm scripts**:
   - `npm run deploy:local` - Auto-restart and deploy
   - `npm run node:start` - Start node manually
   - `npm run node:stop` - Stop node
   - `npm run node:restart` - Restart node

4. **Deployed contracts** with standard Hardhat addresses:
   - sWETH: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
   - sUSDC: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
   - Updated `.env.local` with these addresses

## Going Forward:

**For every test/deployment, just run:**
```bash
npm run deploy:local
```

This will:
- ✅ Check if node needs restart (gas too high)
- ✅ Restart node automatically if needed
- ✅ Deploy contracts
- ✅ Use consistent addresses every time

**The gas price issue will NOT appear again** because:
- Script automatically detects high gas prices
- Automatically restarts node when needed
- Fresh node = low gas prices = successful deployments

## Note About Token Addresses:

The addresses `0xB7f8BC63...` and `0xA51c1fc2...` you had before were from a different deployment setup. The current addresses (`0x5FbDB...` and `0xe7f17...`) are the standard Hardhat addresses that will be consistent every time you restart the node and deploy.

You'll need to re-import these tokens in MetaMask, but they'll stay consistent going forward!

