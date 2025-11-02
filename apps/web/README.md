## Stoix Web App

This package contains the public Stoix marketing site and a lightweight swap prototype for testing the core contracts on testnets.

### Prerequisites

- Node 18+
- pnpm (recommended)
- Metamask or any EVM wallet with access to Sepolia (or another configured testnet)

### Install & Run

```bash
pnpm install
pnpm dev --filter web
```

The site is served on [http://localhost:3000](http://localhost:3000).

### Environment Variables

Create a `.env.local` inside `apps/web/` and configure:

```
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/<key>
NEXT_PUBLIC_POOL_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_QUOTER_ADDRESS=0x...
NEXT_PUBLIC_POOL_MARKINGS=0x000000
NEXT_PUBLIC_ASSET0_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_ASSET0_SYMBOL=ETH
NEXT_PUBLIC_ASSET0_DECIMALS=18
NEXT_PUBLIC_ASSET1_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_ASSET1_SYMBOL=USDC
NEXT_PUBLIC_ASSET1_DECIMALS=6
NEXT_PUBLIC_EXPLORER_URL=https://sepolia.etherscan.io
```

The swap modal reads these values at runtime. By default the modal assumes an ETH→USDC pool. Adjust addresses/decimals to match your deployment.

### Swap Prototype

- `Launch App` opens a modal with a single-pool swap form.
- Wallet connectivity uses the injected Metamask connector via wagmi.
- Quotes call the configured quoter contract (`quote(QuoteParams)`)
- Swaps call `PoolManager.swap` with the supplied pool markings.

### Deploying Test Contracts

Use Hardhat to compile and deploy Stoix contracts to Sepolia (or fork):

```bash
pnpm compile
pnpm hardhat run scripts/deployStoixTestPool.ts --network sepolia
```

Record the deployed addresses and pool markings, then update `.env.local` accordingly.

### Notes

- The quoter ABI expects full `QuoteParams` including bucket IDs and bridge flags. The dummy quoter can be used for initial wiring.
- Production deployments should replace the dummy quoter/data bridge with the real Stoix modules.
- Error surfaces within the modal when configuration is incomplete to prevent accidental transactions.
