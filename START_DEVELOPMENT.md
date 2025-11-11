# 🚀 Starting Development

## Quick Start (Two Terminals)

### Terminal 1: Deploy Contracts & Start Hardhat Node
```bash
cd /Users/alexey/dex
npm run deploy:local
```

This will:
- ✅ Check if Hardhat node is running
- ✅ Restart node if gas prices are too high
- ✅ Deploy all contracts automatically
- ✅ Keep Hardhat node running

**Keep this terminal open** - the Hardhat node needs to stay running.

---

### Terminal 2: Start Web App
```bash
cd /Users/alexey/dex/apps/web
npm run dev
```

Or from the root:
```bash
cd /Users/alexey/dex
pnpm dev --filter web
```

This starts the Next.js dev server at `http://localhost:3000`

---

## Complete Workflow

1. **Terminal 1**: Run `npm run deploy:local`
   - Wait for "✅ Deployment completed successfully!"
   - Node will keep running

2. **Terminal 2**: Run `npm run dev` (in apps/web)
   - Web app starts at http://localhost:3000

3. **Open browser**: Go to http://localhost:3000
   - Click "Launch App" to test swaps

---

## When You Make Changes

### If you change Solidity contracts:
1. Stop Terminal 1 (Ctrl+C)
2. Run `npm run deploy:local` again
3. Web app will automatically reload (Terminal 2)

### If you change UI code:
- Just refresh browser - hot reload handles it!

---

## Stopping Everything

- **Terminal 1**: Ctrl+C (stops Hardhat node)
- **Terminal 2**: Ctrl+C (stops web app)

Or use: `npm run node:stop` to stop Hardhat node
