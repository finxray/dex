export const poolManagerAbi = [
  {
    inputs: [
      { internalType: "address", name: "asset0", type: "address" },
      { internalType: "address", name: "asset1", type: "address" },
      { internalType: "address", name: "quoter", type: "address" },
      { internalType: "bytes3", name: "markings", type: "bytes3" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "bool", name: "zeroForOne", type: "bool" },
      { internalType: "uint256", name: "minAmountOut", type: "uint256" },
    ],
    name: "swap",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "poolID", type: "uint256" }],
    name: "getPoolInfo",
    outputs: [
      { internalType: "address", name: "asset0", type: "address" },
      { internalType: "address", name: "asset1", type: "address" },
      { internalType: "address", name: "quoter", type: "address" },
      { internalType: "bytes3", name: "markings", type: "bytes3" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "poolId", type: "uint256" }],
    name: "getInventory",
    outputs: [
      { internalType: "uint128", name: "asset0", type: "uint128" },
      { internalType: "uint128", name: "asset1", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Custom errors
  {
    inputs: [
      { internalType: "uint256", name: "required", type: "uint256" },
      { internalType: "uint256", name: "available", type: "uint256" },
    ],
    name: "PoolManager__InsufficientAsset0",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "required", type: "uint256" },
      { internalType: "uint256", name: "available", type: "uint256" },
    ],
    name: "PoolManager__InsufficientAsset1",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "minOut", type: "uint256" },
      { internalType: "uint256", name: "actual", type: "uint256" },
    ],
    name: "PoolManager__InsufficientOutput",
    type: "error",
  },
  {
    name: "PoolManager__InvalidQuote",
    type: "error",
  },
] as const;

