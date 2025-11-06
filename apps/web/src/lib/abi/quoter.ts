export const quoterAbi = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "asset0", type: "address" },
          { internalType: "address", name: "asset1", type: "address" },
          { internalType: "address", name: "quoter", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint128", name: "asset0Balance", type: "uint128" },
          { internalType: "uint128", name: "asset1Balance", type: "uint128" },
          { internalType: "uint16", name: "bucketID", type: "uint16" },
          { internalType: "bool", name: "zeroForOne", type: "bool" },
          { internalType: "uint8", name: "functionFlags", type: "uint8" },
        ],
        internalType: "struct QuoteParams",
        name: "params",
        type: "tuple",
      },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "quote",
    outputs: [{ internalType: "uint256", name: "quote", type: "uint256" }],
    stateMutability: "pure", // Changed from "nonpayable" to match MinimalDummyQuoter
    type: "function",
  },
];

