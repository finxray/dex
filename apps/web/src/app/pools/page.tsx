"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatUnits, parseUnits, encodeFunctionData, decodeFunctionResult } from "viem";
import { Header } from "../components/Header/Header";
import { TokenSelector, type Token } from "../components";
import { poolManagerAbi } from "../../lib/abi/poolManager";
import { erc20Abi } from "../../lib/abi/erc20";

const env = {
  poolManagerAddress: process.env.NEXT_PUBLIC_POOL_MANAGER_ADDRESS as `0x${string}` | undefined,
  liquidityManagerAddress: process.env.NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS as `0x${string}` | undefined,
  dummyQuoterAddress: process.env.NEXT_PUBLIC_DUMMY_QUOTER_ADDRESS as `0x${string}` | undefined,
  stoicovQuoterAddress: process.env.NEXT_PUBLIC_STOICOV_QUOTER_ADDRESS as `0x${string}` | undefined,
};

type PoolInfo = {
  poolID: bigint;
  asset0: `0x${string}`;
  asset1: `0x${string}`;
  quoter: `0x${string}`;
  markings: string;
  totalLiquidity: bigint;
  inventory0: bigint;
  inventory1: bigint;
  asset0Symbol?: string;
  asset1Symbol?: string;
  quoterName?: string;
};

type QuoterInfo = {
  address: `0x${string}`;
  name: string;
  description: string;
  features: string[];
};

const QUOTERS: QuoterInfo[] = [
  {
    address: env.dummyQuoterAddress || "0x0000000000000000000000000000000000000000" as `0x${string}`,
    name: "Dummy Quoter",
    description: "A simple fixed-rate quoter for testing and development. Uses a constant exchange rate (e.g., 1 sWETH = 3,000 sUSDC). Perfect for testing pool mechanics without complex pricing logic.",
    features: [
      "Fixed exchange rate",
      "Simple and predictable",
      "Low gas costs",
      "Ideal for testing",
    ],
  },
  {
    address: env.stoicovQuoterAddress || "0x0000000000000000000000000000000000000000" as `0x${string}`,
    name: "Stoicov Quoter",
    description: "Advanced Avellaneda-Stoikov market making model that dynamically adjusts prices based on inventory skew, volatility, and market conditions. Uses optimal bid-ask spreads and reservation pricing for efficient market making.",
    features: [
      "Dynamic pricing based on inventory",
      "Volatility-adjusted spreads",
      "Optimal bid-ask pricing",
      "Risk-adjusted reservation prices",
      "Production-ready market making",
    ],
  },
];

export default function PoolsPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [activeTab, setActiveTab] = useState<"browse" | "create" | "my-pools">("browse");
  const [searchTerm, setSearchTerm] = useState("");
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  
  // Create pool state
  const [createTokenA, setCreateTokenA] = useState<Token | null>(null);
  const [createTokenB, setCreateTokenB] = useState<Token | null>(null);
  const [selectedQuoter, setSelectedQuoter] = useState<QuoterInfo | null>(null);
  const [markings, setMarkings] = useState("0x000000");
  const [isCreatingPool, setIsCreatingPool] = useState(false);
  
  // Add liquidity state
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);
  const [liquidityAmount0, setLiquidityAmount0] = useState("");
  const [liquidityAmount1, setLiquidityAmount1] = useState("");
  const [isAddingLiquidity, setIsAddingLiquidity] = useState(false);
  
  // Remove liquidity state
  const [removeLiquidityAmount, setRemoveLiquidityAmount] = useState("");
  const [isRemovingLiquidity, setIsRemovingLiquidity] = useState(false);
  
  // Available tokens (you can expand this list)
  const availableTokens: Token[] = useMemo(() => [
    {
      symbol: "ETH",
      name: "Ethereum",
      address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      decimals: 18,
    },
    {
      symbol: "WETH",
      name: "Wrapped Ethereum",
      address: process.env.NEXT_PUBLIC_WETH_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000" as `0x${string}`,
      decimals: 18,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      address: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000" as `0x${string}`,
      decimals: 6,
    },
    {
      symbol: "USDT",
      name: "Tether",
      address: process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000" as `0x${string}`,
      decimals: 6,
    },
  ], []);

  // Fetch pools
  const fetchPools = async () => {
    if (!publicClient || !env.poolManagerAddress) return;
    
    setIsLoadingPools(true);
    try {
      // Note: In a real implementation, you'd need to track pool IDs from events
      // For now, this is a placeholder - you'd need to implement pool discovery
      // via events or a registry
      console.log("Fetching pools...");
      // TODO: Implement pool discovery from events
      setPools([]);
    } catch (error) {
      console.error("Error fetching pools:", error);
    } finally {
      setIsLoadingPools(false);
    }
  };

  useEffect(() => {
    if (isConnected && publicClient) {
      fetchPools();
    }
  }, [isConnected, publicClient]);

  // Create pool
  const handleCreatePool = async () => {
    if (!walletClient || !address || !createTokenA || !createTokenB || !selectedQuoter || !env.poolManagerAddress) {
      return;
    }

    setIsCreatingPool(true);
    try {
      const hash = await walletClient.writeContract({
        account: address,
        address: env.poolManagerAddress,
        abi: poolManagerAbi,
        functionName: "createPool",
        args: [
          createTokenA.address,
          createTokenB.address,
          selectedQuoter.address,
          markings as `0x${string}`,
        ],
      });

      await publicClient?.waitForTransactionReceipt({ hash });
      console.log("Pool created:", hash);
      
      // Reset form
      setCreateTokenA(null);
      setCreateTokenB(null);
      setSelectedQuoter(null);
      setMarkings("0x000000");
      
      // Refresh pools
      await fetchPools();
    } catch (error) {
      console.error("Error creating pool:", error);
    } finally {
      setIsCreatingPool(false);
    }
  };

  // Add liquidity
  const handleAddLiquidity = async () => {
    if (!walletClient || !address || !selectedPool || !env.liquidityManagerAddress) {
      return;
    }

    if (!liquidityAmount0 || !liquidityAmount1) {
      return;
    }

    setIsAddingLiquidity(true);
    try {
      const token0Decimals = selectedPool.asset0Symbol === "USDC" || selectedPool.asset0Symbol === "USDT" ? 6 : 18;
      const token1Decimals = selectedPool.asset1Symbol === "USDC" || selectedPool.asset1Symbol === "USDT" ? 6 : 18;
      
      const amount0 = parseUnits(liquidityAmount0, token0Decimals);
      const amount1 = parseUnits(liquidityAmount1, token1Decimals);

      // Approve tokens if needed
      // TODO: Add approval logic

      const hash = await walletClient.writeContract({
        account: address,
        address: env.liquidityManagerAddress,
        abi: [
          {
            name: "addLiquidity",
            type: "function",
            stateMutability: "payable",
            inputs: [
              { name: "asset0", type: "address" },
              { name: "asset1", type: "address" },
              { name: "quoter", type: "address" },
              { name: "markings", type: "bytes3" },
              { name: "amount0", type: "uint256" },
              { name: "amount1", type: "uint256" },
            ],
            outputs: [{ name: "liquidity", type: "uint256" }],
          },
        ],
        functionName: "addLiquidity",
        args: [
          selectedPool.asset0,
          selectedPool.asset1,
          selectedPool.quoter,
          selectedPool.markings as `0x${string}`,
          amount0,
          amount1,
        ],
        value: selectedPool.asset0 === "0x0000000000000000000000000000000000000000" ? amount0 : 0n,
      });

      await publicClient?.waitForTransactionReceipt({ hash });
      console.log("Liquidity added:", hash);
      
      setLiquidityAmount0("");
      setLiquidityAmount1("");
      await fetchPools();
    } catch (error) {
      console.error("Error adding liquidity:", error);
    } finally {
      setIsAddingLiquidity(false);
    }
  };

  // Remove liquidity
  const handleRemoveLiquidity = async () => {
    if (!walletClient || !address || !selectedPool || !env.liquidityManagerAddress) {
      return;
    }

    if (!removeLiquidityAmount) {
      return;
    }

    setIsRemovingLiquidity(true);
    try {
      const liquidity = parseUnits(removeLiquidityAmount, 18);

      const hash = await walletClient.writeContract({
        account: address,
        address: env.liquidityManagerAddress,
        abi: [
          {
            name: "removeLiquidity",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [
              { name: "asset0", type: "address" },
              { name: "asset1", type: "address" },
              { name: "quoter", type: "address" },
              { name: "markings", type: "bytes3" },
              { name: "liquidity", type: "uint256" },
            ],
            outputs: [
              { name: "amount0", type: "uint256" },
              { name: "amount1", type: "uint256" },
            ],
          },
        ],
        functionName: "removeLiquidity",
        args: [
          selectedPool.asset0,
          selectedPool.asset1,
          selectedPool.quoter,
          selectedPool.markings as `0x${string}`,
          liquidity,
        ],
      });

      await publicClient?.waitForTransactionReceipt({ hash });
      console.log("Liquidity removed:", hash);
      
      setRemoveLiquidityAmount("");
      await fetchPools();
    } catch (error) {
      console.error("Error removing liquidity:", error);
    } finally {
      setIsRemovingLiquidity(false);
    }
  };

  const filteredPools = useMemo(() => {
    if (!searchTerm) return pools;
    const term = searchTerm.toLowerCase();
    return pools.filter(
      (pool) =>
        pool.asset0Symbol?.toLowerCase().includes(term) ||
        pool.asset1Symbol?.toLowerCase().includes(term) ||
        pool.quoterName?.toLowerCase().includes(term)
    );
  }, [pools, searchTerm]);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-black text-white pt-24 pb-12">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              Pools
            </h1>
            <p className="text-white/60">Create pools, add liquidity, and manage your positions</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-white/10">
            <button
              onClick={() => setActiveTab("browse")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "browse"
                  ? "text-white border-b-2 border-purple-400"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              Browse Pools
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "create"
                  ? "text-white border-b-2 border-purple-400"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              Create Pool
            </button>
            <button
              onClick={() => setActiveTab("my-pools")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "my-pools"
                  ? "text-white border-b-2 border-purple-400"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              My Pools
            </button>
          </div>

          {/* Browse Pools Tab */}
          {activeTab === "browse" && (
            <div className="space-y-6">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search pools by token pair or quoter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-full border border-white/15 bg-white/5 px-6 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                />
                <svg
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Pools List */}
              {isLoadingPools ? (
                <div className="text-center py-12 text-white/60">Loading pools...</div>
              ) : filteredPools.length === 0 ? (
                <div className="text-center py-12 text-white/60">
                  {searchTerm ? "No pools found matching your search." : "No pools found. Create your first pool!"}
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredPools.map((pool) => (
                    <div
                      key={pool.poolID.toString()}
                      className="rounded-xl border border-white/15 bg-white/5 p-6 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => setSelectedPool(pool)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl font-semibold">
                              {pool.asset0Symbol} / {pool.asset1Symbol}
                            </span>
                            <span className="text-sm text-white/60">({pool.quoterName})</span>
                          </div>
                          <div className="text-sm text-white/60">
                            Liquidity: {formatUnits(pool.totalLiquidity, 18)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPool(pool);
                            setActiveTab("my-pools");
                          }}
                          className="px-4 py-2 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create Pool Tab */}
          {activeTab === "create" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/15 bg-white/5 p-6">
                <h2 className="text-2xl font-semibold mb-6">Create New Pool</h2>
                
                {/* Token Selection */}
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Token A</label>
                    <TokenSelector
                      selected={createTokenA || availableTokens[0]}
                      tokens={availableTokens}
                      onSelect={setCreateTokenA}
                      showButton={true}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Token B</label>
                    <TokenSelector
                      selected={createTokenB || availableTokens[1]}
                      tokens={availableTokens}
                      onSelect={setCreateTokenB}
                      showButton={true}
                    />
                  </div>
                </div>

                {/* Quoter Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-4">Select Quoter</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    {QUOTERS.map((quoter) => (
                      <div
                        key={quoter.name}
                        onClick={() => setSelectedQuoter(quoter)}
                        className={`rounded-xl border p-4 cursor-pointer transition-all ${
                          selectedQuoter?.name === quoter.name
                            ? "border-purple-400 bg-purple-400/10"
                            : "border-white/15 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-lg">{quoter.name}</h3>
                          <input
                            type="radio"
                            checked={selectedQuoter?.name === quoter.name}
                            onChange={() => setSelectedQuoter(quoter)}
                            className="mt-1"
                          />
                        </div>
                        <p className="text-sm text-white/70 mb-3">{quoter.description}</p>
                        <div className="space-y-1">
                          {quoter.features.map((feature, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-white/60">
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {feature}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Markings */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Pool Markings (hex)</label>
                  <input
                    type="text"
                    value={markings}
                    onChange={(e) => setMarkings(e.target.value)}
                    placeholder="0x000000"
                    className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                  />
                  <p className="text-xs text-white/60 mt-1">
                    Markings configure pool behavior (enhanced context, access control, etc.)
                  </p>
                </div>

                {/* Create Button */}
                <button
                  onClick={handleCreatePool}
                  disabled={!createTokenA || !createTokenB || !selectedQuoter || isCreatingPool || !isConnected}
                  className="w-full rounded-full border border-white/20 bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-medium text-white transition-all hover:from-purple-600 hover:to-pink-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCreatingPool ? "Creating Pool..." : "Create Pool"}
                </button>
              </div>
            </div>
          )}

          {/* My Pools / Manage Pool Tab */}
          {activeTab === "my-pools" && (
            <div className="space-y-6">
              {selectedPool ? (
                <>
                  {/* Pool Info */}
                  <div className="rounded-xl border border-white/15 bg-white/5 p-6">
                    <h2 className="text-2xl font-semibold mb-4">
                      {selectedPool.asset0Symbol} / {selectedPool.asset1Symbol}
                    </h2>
                    <div className="grid md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <div className="text-sm text-white/60 mb-1">Total Liquidity</div>
                        <div className="text-lg font-semibold">{formatUnits(selectedPool.totalLiquidity, 18)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-white/60 mb-1">Asset 0 Balance</div>
                        <div className="text-lg font-semibold">{formatUnits(selectedPool.inventory0, 18)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-white/60 mb-1">Asset 1 Balance</div>
                        <div className="text-lg font-semibold">{formatUnits(selectedPool.inventory1, 18)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Add Liquidity */}
                  <div className="rounded-xl border border-white/15 bg-white/5 p-6">
                    <h3 className="text-xl font-semibold mb-4">Add Liquidity</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">{selectedPool.asset0Symbol} Amount</label>
                        <input
                          type="text"
                          value={liquidityAmount0}
                          onChange={(e) => setLiquidityAmount0(e.target.value)}
                          placeholder="0.0"
                          className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">{selectedPool.asset1Symbol} Amount</label>
                        <input
                          type="text"
                          value={liquidityAmount1}
                          onChange={(e) => setLiquidityAmount1(e.target.value)}
                          placeholder="0.0"
                          className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={handleAddLiquidity}
                        disabled={!liquidityAmount0 || !liquidityAmount1 || isAddingLiquidity || !isConnected}
                        className="w-full rounded-full border border-white/20 bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-medium text-white transition-all hover:from-purple-600 hover:to-pink-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isAddingLiquidity ? "Adding Liquidity..." : "Add Liquidity"}
                      </button>
                    </div>
                  </div>

                  {/* Remove Liquidity */}
                  <div className="rounded-xl border border-white/15 bg-white/5 p-6">
                    <h3 className="text-xl font-semibold mb-4">Remove Liquidity</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Liquidity Amount</label>
                        <input
                          type="text"
                          value={removeLiquidityAmount}
                          onChange={(e) => setRemoveLiquidityAmount(e.target.value)}
                          placeholder="0.0"
                          className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={handleRemoveLiquidity}
                        disabled={!removeLiquidityAmount || isRemovingLiquidity || !isConnected}
                        className="w-full rounded-full border border-red-500/50 bg-red-500/10 px-6 py-3 font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isRemovingLiquidity ? "Removing Liquidity..." : "Remove Liquidity"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-white/60">
                  Select a pool to manage liquidity
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
