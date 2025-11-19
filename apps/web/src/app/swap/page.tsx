"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient, useConnectors, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { defineChain } from "viem";

// Define Hardhat chain with chain ID 31337
const hardhat = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
});
import { formatUnits, parseUnits, maxUint256, encodeFunctionData, decodeFunctionResult, createWalletClient, custom, decodeErrorResult } from "viem";
import type { WalletClient } from "viem";
import type { UTCTimestamp } from "lightweight-charts";

import { poolManagerAbi } from "../../lib/abi/poolManager";
import { quoterAbi } from "../../lib/abi/quoter";
import { erc20Abi } from "../../lib/abi/erc20";
import LightweightChart from "./components/LightweightChart";
import { Header } from "../components/Header/Header";


type Token = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  icon?: string; // URL or public path
};

type SwapDirection = "a-to-b" | "b-to-a";

type AreaData = {
  time: UTCTimestamp;
  value: number;
};

const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

// Bucket data into 5-minute bars for 1D charts
function bucketDataInto5MinBars(data: AreaData[]): AreaData[] {
  if (data.length === 0) return [];
  
  const BUCKET_SIZE_SECONDS = 300; // 5 minutes
  const bucketed: AreaData[] = [];
  const buckets = new Map<number, AreaData[]>();
  
  // Group data points into 5-minute buckets
  for (const point of data) {
    // Round down to the nearest 5-minute bucket
    const bucketTime = Math.floor(point.time / BUCKET_SIZE_SECONDS) * BUCKET_SIZE_SECONDS;
    
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, []);
    }
    buckets.get(bucketTime)!.push(point);
  }
  
  // For each bucket, use the last value (closing price for that 5-minute period)
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  
  for (const [bucketTime, points] of sortedBuckets) {
    // Use the last point in the bucket as the representative value
    // This gives us the "close" price for that 5-minute bar
    const lastPoint = points[points.length - 1];
    bucketed.push({
      time: bucketTime as UTCTimestamp,
      value: lastPoint.value,
    });
  }
  
  return bucketed;
}

const sanitizeNumeric = (value: string): string | null => {
  if (value === undefined || value === null) return null;
  const stripped = value.replace(/,/g, "");
  if (stripped === "") return "";
  if (stripped === ".") return "0.";
  if (!/^\d*\.?\d*$/.test(stripped)) {
    return null;
  }
  return stripped;
};

const formatWithCommas = (value: string): string => {
  if (!value) return "";
  const hasDecimal = value.includes(".");
  const [integerPartRaw, decimalPart] = value.split(".");
  const integerPartFormatted = (integerPartRaw || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (hasDecimal) {
    return `${integerPartFormatted}.${decimalPart ?? ""}`;
  }
  return integerPartFormatted;
};

// Format number with responsive sizing - returns formatted string and suggested font size class
const formatNumberResponsive = (value: string): { formatted: string; fontSize: string } => {
  if (!value) return { formatted: "", fontSize: "text-3xl" };
  
  // Validate the value is a reasonable number string
  const cleaned = value.replace(/,/g, "");
  const num = Number(cleaned);
  
  // Check if number is invalid or suspiciously large (likely a formatting error)
  if (!Number.isFinite(num) || num < 0) {
    return { formatted: value, fontSize: "text-3xl" };
  }
  
  // If number seems unreasonably large (likely a bug), return original
  if (num > 1e15) {
    console.warn("Suspiciously large number detected:", value, "->", num);
    return { formatted: value, fontSize: "text-xl" };
  }
  
  // For very large numbers, use scientific notation or abbreviated format
  if (Math.abs(num) >= 1e12) {
    return { formatted: num.toExponential(2), fontSize: "text-xl" };
  }
  if (Math.abs(num) >= 1e9) {
    return { formatted: `${(num / 1e9).toFixed(2)}B`, fontSize: "text-2xl" };
  }
  if (Math.abs(num) >= 1e6) {
    return { formatted: `${(num / 1e6).toFixed(2)}M`, fontSize: "text-2xl" };
  }
  if (Math.abs(num) >= 1e3) {
    return { formatted: formatWithCommas(num.toFixed(2)), fontSize: "text-2xl" };
  }
  
  // For normal numbers, format with commas
  const formatted = formatWithCommas(value);
  const length = formatted.replace(/,/g, "").length;
  
  // Adjust font size based on length
  if (length > 15) return { formatted, fontSize: "text-xl" };
  if (length > 12) return { formatted, fontSize: "text-2xl" };
  return { formatted, fontSize: "text-3xl" };
};

const trimTrailingZeros = (value: string): string => {
  if (!value) return "";
  if (value.includes(".")) {
    value = value.replace(/(\.\d*?[1-9])0+$/, "$1");
    value = value.replace(/\.0+$/, "");
  }
  return value === "" ? "0" : value;
};

const env = {
  poolManagerAddress: process.env.NEXT_PUBLIC_POOL_MANAGER_ADDRESS as `0x${string}` | undefined,
  quoterAddress: process.env.NEXT_PUBLIC_QUOTER_ADDRESS as `0x${string}` | undefined,
  poolMarkings: process.env.NEXT_PUBLIC_POOL_MARKINGS,
  asset0: (process.env.NEXT_PUBLIC_ASSET0_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  asset1: (process.env.NEXT_PUBLIC_ASSET1_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  asset0Symbol: process.env.NEXT_PUBLIC_ASSET0_SYMBOL || "ETH",
  asset1Symbol: process.env.NEXT_PUBLIC_ASSET1_SYMBOL || "USDC",
  asset0Decimals: Number(process.env.NEXT_PUBLIC_ASSET0_DECIMALS ?? 18),
  asset1Decimals: Number(process.env.NEXT_PUBLIC_ASSET1_DECIMALS ?? 6),
};

type QuoteState = {
  amountOut: string;
  rawAmountOut: bigint;
};

export default function SwapPage() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("🚀 SWAP PAGE LOADED");
  console.log("═══════════════════════════════════════════════════════");
  
  console.log("\n📋 Environment Variables:");
  console.log("  POOL_MANAGER_ADDRESS:", env.poolManagerAddress || "❌ NOT SET");
  console.log("  QUOTER_ADDRESS:", env.quoterAddress || "❌ NOT SET");
  console.log("  POOL_MARKINGS:", env.poolMarkings || "❌ NOT SET");
  console.log("  ASSET0:", env.asset0Symbol, `(${env.asset0})`);
  console.log("  ASSET1:", env.asset1Symbol, `(${env.asset1})`);
  console.log("  ASSET0_DECIMALS:", env.asset0Decimals);
  console.log("  ASSET1_DECIMALS:", env.asset1Decimals);
  
  // Warn if quoter address is missing
  if (!env.quoterAddress) {
    console.error("⚠️  WARNING: QUOTER_ADDRESS is not set in environment variables!");
    console.error("   Set NEXT_PUBLIC_QUOTER_ADDRESS in .env.local");
  }
  
  // Update document title when on swap page
  useEffect(() => {
    document.title = "Stoix App - Stoix";
    return () => {
      // Reset to default when leaving the page
      document.title = "Stoix App - Stoix";
    };
  }, []);
  
  const { address, isConnecting, isConnected, connector } = useAccount();
  const connectors = useConnectors();
  const { connect, error: connectError, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const [fallbackWalletClient, setFallbackWalletClient] = useState<WalletClient | undefined>(undefined);
  const [isRetryingWalletClient, setIsRetryingWalletClient] = useState(false);

  // Determine target chain based on RPC URL
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";
  const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1") || rpcUrl === "";
  const targetChain = isLocalhost ? hardhat : sepolia;

  // Check if connected to the correct chain
  const isCorrectChain = chainId === targetChain.id;

  // Function to manually retry getting wallet client
  const retryGetWalletClient = useCallback(async () => {
    if (!isConnected) {
      console.log("❌ Cannot retry: Wallet not connected");
      return;
    }

    setIsRetryingWalletClient(true);
    try {
      // Try method 1: Get from connector
      if (connector) {
        console.log("🔄 Method 1: Trying to get wallet client from connector...");
        try {
          const client = await (connector as any).getWalletClient?.();
          if (client) {
            console.log("✅ Successfully retrieved wallet client from connector");
            setFallbackWalletClient(client);
            return;
          }
        } catch (error) {
          console.log("⚠️ Connector method failed:", error);
        }
      }

      // Try method 2: Create directly from window.ethereum
      if (typeof window !== "undefined" && (window as any).ethereum && address) {
        console.log("🔄 Method 2: Creating wallet client directly from window.ethereum...");
        try {
          const provider = (window as any).ethereum;
          const chain = publicClient?.chain;
          
          if (chain) {
            const client = createWalletClient({
              account: address as `0x${string}`,
              chain: chain,
              transport: custom(provider),
            });
            console.log("✅ Successfully created wallet client from window.ethereum");
            setFallbackWalletClient(client);
            return;
          } else {
            console.log("⚠️ Public client chain not available");
          }
        } catch (error) {
          console.log("⚠️ Direct creation method failed:", error);
        }
      }

      console.log("❌ All methods failed to get wallet client");
      setFallbackWalletClient(undefined);
    } catch (error) {
      console.log("❌ Failed to get wallet client:", error);
      setFallbackWalletClient(undefined);
    } finally {
      setIsRetryingWalletClient(false);
    }
  }, [isConnected, connector, address, publicClient]);

  // Fallback: Try to get wallet client from connector if useWalletClient returns null
  useEffect(() => {
    const getWalletClientFromConnector = async () => {
      if (isConnected && !walletClient && address) {
        // Try method 1: Get from connector
        if (connector) {
          try {
            console.log("🔄 Attempting to get wallet client from connector...");
            const client = await (connector as any).getWalletClient?.();
            if (client) {
              console.log("✅ Successfully retrieved wallet client from connector");
              setFallbackWalletClient(client);
              return;
            }
          } catch (error) {
            console.log("⚠️ Connector method failed:", error);
          }
        }

        // Try method 2: Create directly from window.ethereum
        if (typeof window !== "undefined" && (window as any).ethereum && publicClient?.chain) {
          try {
            console.log("🔄 Attempting to create wallet client from window.ethereum...");
            const provider = (window as any).ethereum;
            const client = createWalletClient({
              account: address as `0x${string}`,
              chain: publicClient.chain,
              transport: custom(provider),
            });
            console.log("✅ Successfully created wallet client from window.ethereum");
            setFallbackWalletClient(client);
            return;
          } catch (error) {
            console.log("⚠️ Direct creation method failed:", error);
          }
        }

        console.log("❌ All methods failed to get wallet client");
        setFallbackWalletClient(undefined);
      } else if (!isConnected) {
        setFallbackWalletClient(undefined);
      }
    };

    getWalletClientFromConnector();
  }, [isConnected, walletClient, connector, address, publicClient]);

  // Use walletClient if available, otherwise use fallback
  const effectiveWalletClient = walletClient || fallbackWalletClient;

  // Debug: Monitor connection state
  useEffect(() => {
    console.log("\n🔌 Connection State Changed:");
    console.log("  Address:", address || "❌ Not connected");
    console.log("  Is Connected:", isConnected ? "✅" : "❌");
    console.log("  Is Connecting:", isConnecting ? "⏳" : "✅");
    console.log("  Public Client:", publicClient ? "✅" : "❌");
    console.log("  Wallet Client (hook):", walletClient ? "✅" : "❌");
    console.log("  Wallet Client (fallback):", fallbackWalletClient ? "✅" : "❌");
    console.log("  Effective Wallet Client:", effectiveWalletClient ? "✅" : "❌");
  }, [address, isConnected, isConnecting, publicClient, walletClient, fallbackWalletClient, effectiveWalletClient]);

  const [amountIn, setAmountIn] = useState<string>("");
  const [amountOutValue, setAmountOutValue] = useState<string>("");
  const [activeField, setActiveField] = useState<"in" | "out">("in");
  const [showDetails, setShowDetails] = useState(false);
  const [slippageBps, setSlippageBps] = useState(50); // 0.5% default
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [chartPhase, setChartPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
  const [isChartMaximized, setIsChartMaximized] = useState(false);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [overlayOffset, setOverlayOffset] = useState({ x: 0, y: 0 });
  const overlayOffsetRef = useRef({ x: 0, y: 0 });
  const overlayPointerIdRef = useRef<number | null>(null);
  const overlayDragLastRef = useRef<{ x: number; y: number } | null>(null);
  const [isDraggingChart, setIsDraggingChart] = useState(false);
  const [isSwapDetailsOpen, setIsSwapDetailsOpen] = useState(false);
  const [swapDetailsPhase, setSwapDetailsPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
  const [copiedHash, setCopiedHash] = useState(false);
  const [swapDetailsOffset, setSwapDetailsOffset] = useState({ x: 0, y: 0 });
  const [isDraggingSwapDetails, setIsDraggingSwapDetails] = useState(false);
  const swapDetailsDragLastRef = useRef<{ x: number; y: number } | null>(null);
  // Token list - 20 most popular tokens (sWETH and sUSDC are the only ones available for swaps on localhost)
  const tokens: Token[] = [
    {
      symbol: env.asset0Symbol,
      name: "Wrapped Ether",
      address: env.asset0,
      decimals: env.asset0Decimals,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
    },
    {
      symbol: env.asset1Symbol,
      name: "USD Coin",
      address: env.asset1,
      decimals: env.asset1Decimals,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
    },
    // Popular tokens for chart viewing (swaps only work with sWETH/sUSDC)
    {
      symbol: "USDT",
      name: "Tether USD",
      address: "0x0000000000000000000000000000000000000001",
      decimals: 6,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      address: "0x0000000000000000000000000000000000000002",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
    },
    {
      symbol: "WBTC",
      name: "Wrapped Bitcoin",
      address: "0x0000000000000000000000000000000000000003",
      decimals: 8,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
    },
    {
      symbol: "LINK",
      name: "Chainlink",
      address: "0x0000000000000000000000000000000000000004",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
    },
    {
      symbol: "UNI",
      name: "Uniswap",
      address: "0x0000000000000000000000000000000000000005",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
    },
    {
      symbol: "AAVE",
      name: "Aave",
      address: "0x0000000000000000000000000000000000000006",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7E9c93437bFc5Ac33E2DDaE9/logo.png",
    },
    {
      symbol: "MKR",
      name: "Maker",
      address: "0x0000000000000000000000000000000000000007",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png",
    },
    {
      symbol: "CRV",
      name: "Curve DAO Token",
      address: "0x0000000000000000000000000000000000000008",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png",
    },
    {
      symbol: "SNX",
      name: "Synthetix Network",
      address: "0x0000000000000000000000000000000000000009",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F/logo.png",
    },
    {
      symbol: "COMP",
      name: "Compound",
      address: "0x000000000000000000000000000000000000000a",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xc00e94Cb662C3520282E6f5717214004A7f26888/logo.png",
    },
    {
      symbol: "MATIC",
      name: "Polygon",
      address: "0x000000000000000000000000000000000000000b",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0/logo.png",
    },
    {
      symbol: "ARB",
      name: "Arbitrum",
      address: "0x000000000000000000000000000000000000000c",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png",
    },
    {
      symbol: "OP",
      name: "Optimism",
      address: "0x000000000000000000000000000000000000000d",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
    },
    {
      symbol: "PEPE",
      name: "Pepe",
      address: "0x000000000000000000000000000000000000000e",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png",
    },
    {
      symbol: "SHIB",
      name: "Shiba Inu",
      address: "0x000000000000000000000000000000000000000f",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png",
    },
    {
      symbol: "FLOKI",
      name: "FLOKI",
      address: "0x0000000000000000000000000000000000000010",
      decimals: 9,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E/logo.png",
    },
    {
      symbol: "LDO",
      name: "Lido DAO",
      address: "0x0000000000000000000000000000000000000011",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x5A98FcBEA516068068C8D0CbF90A7C2C3c8A8B59/logo.png",
    },
    {
      symbol: "STETH",
      name: "Lido Staked Ether",
      address: "0x0000000000000000000000000000000000000012",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84/logo.png",
    },
    {
      symbol: "ENS",
      name: "Ethereum Name Service",
      address: "0x0000000000000000000000000000000000000013",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72/logo.png",
    },
    {
      symbol: "GMX",
      name: "GMX",
      address: "0x0000000000000000000000000000000000000014",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a/logo.png",
    },
  ];

  const defaultA = tokens[0];
  const defaultB = tokens[1];

  console.log("\n🎲 Initial Token State:");
  console.log("  Default Token A:", defaultA.symbol, defaultA.address);
  console.log("  Default Token B:", defaultB.symbol, defaultB.address);
  console.log("  Env Asset0:", env.asset0Symbol, env.asset0);
  console.log("  Env Asset1:", env.asset1Symbol, env.asset1);
  console.log("  Pool Manager:", env.poolManagerAddress);
  console.log("  Quoter:", env.quoterAddress);

  const [tokenA, setTokenA] = useState<Token>(defaultA);
  const [tokenB, setTokenB] = useState<Token>(defaultB);
  const [direction, setDirection] = useState<SwapDirection>("a-to-b");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const swapTitleRef = useRef<HTMLDivElement | null>(null);
  const swapCardRef = useRef<HTMLDivElement | null>(null); // Full swap card reference
  const fixedSectionRef = useRef<HTMLDivElement | null>(null); // Fixed section wrapper reference
  const dynamicSectionRef = useRef<HTMLDivElement | null>(null); // Dynamic section reference
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [swapTitleRect, setSwapTitleRect] = useState<DOMRect | null>(null);
  const [swapCardRect, setSwapCardRect] = useState<DOMRect | null>(null);
  const [chartData, setChartData] = useState<AreaData[]>([]);
  const chartDataRef = useRef<AreaData[]>([]);
  const hasInitialChartData = chartData.length > 0;
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [swapDetails, setSwapDetails] = useState<{ amountIn: string; amountOut: string; tokenIn: string; tokenOut: string } | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);
  const [isFetchingAllowance, setIsFetchingAllowance] = useState(false);
  const [fiatCurrency, setFiatCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const [orderType, setOrderType] = useState<"Swap" | "Limit" | "Buy" | "Sell">("Swap");
  const swapButtonRef = useRef<HTMLButtonElement | null>(null);
  const [orderButtonWidth, setOrderButtonWidth] = useState<number | null>(null);
  
  // Measure Swap button width and apply to other order type buttons
  useEffect(() => {
    if (swapButtonRef.current) {
      const width = swapButtonRef.current.offsetWidth;
      setOrderButtonWidth(width);
    }
  }, [orderType]);
  
  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  const [isLoadingChartData, setIsLoadingChartData] = useState(false);
  const [chartTimeRange, setChartTimeRange] = useState<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y" | "10Y" | "ALL">("1D");
  const [latestPriceChange, setLatestPriceChange] = useState<"up" | "down" | "same" | null>(null);
  const [showPulse, setShowPulse] = useState(false);
  const [isCrosshairActive, setIsCrosshairActive] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>("");
  const [updateCount, setUpdateCount] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [permanentDotColor, setPermanentDotColor] = useState<string | null>(null);
  const chartSeriesRef = useRef<any>(null);
  const [isDraggingSwapCard, setIsDraggingSwapCard] = useState(false);
  const [swapCardOffset, setSwapCardOffset] = useState({ x: 0, y: 0 });
  const swapCardDragLastRef = useRef<{ x: number; y: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<string | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number; offsetX: number; offsetY: number } | null>(null);
  const fiatRates = {
    USD: 1,
    EUR: 0.9,
    GBP: 0.78,
  };

  const handleAmountInChange = (raw: string) => {
    const sanitized = sanitizeNumeric(raw);
    if (sanitized === null) return;
    setActiveField("in");
    setAmountIn(sanitized);
    if (sanitized === "") {
      setAmountOutValue("");
      setQuote(null);
    }
  };

  const handleAmountOutChange = (raw: string) => {
    const sanitized = sanitizeNumeric(raw);
    if (sanitized === null) return;
    setActiveField("out");
    setAmountOutValue(sanitized);
    if (sanitized === "") {
      setAmountIn("");
      setQuote(null);
    }
  };

  const amountOutSymbol = direction === "a-to-b" ? tokenB.symbol : tokenA.symbol;
  const amountInSymbol = direction === "a-to-b" ? tokenA.symbol : tokenB.symbol;
  
  // Determine which token is being paid (input token)
  const inputToken = direction === "a-to-b" ? tokenA.address : tokenB.address;
  
  // zeroForOne flag: true if paying asset0 (swap asset0 -> asset1), false if paying asset1 (swap asset1 -> asset0)
  // Pools are direction-agnostic - the flag determines swap direction
  const zeroForOne = inputToken.toLowerCase() === env.asset0.toLowerCase();
  
  const inputDecimals = direction === "a-to-b" ? tokenA.decimals : tokenB.decimals;
  const outputDecimals = direction === "a-to-b" ? tokenB.decimals : tokenA.decimals;
  const isNativeInput = inputToken === "0x0000000000000000000000000000000000000000";
  const configReady = Boolean(env.poolManagerAddress && env.quoterAddress && env.poolMarkings);
  const requiresApproval = !isNativeInput && Boolean(env.poolManagerAddress);

  const parsedAmountIn = useMemo(() => {
    if (!amountIn) return null;
    try {
      return parseUnits(amountIn, inputDecimals);
    } catch {
      return null;
    }
  }, [amountIn, inputDecimals]);

  const spotRateDisplay = useMemo(() => {
    const normalizedIn = amountIn.endsWith(".") ? amountIn.slice(0, -1) : amountIn;
    const normalizedOut = amountOutValue.endsWith(".") ? amountOutValue.slice(0, -1) : amountOutValue;

    const inNumber = Number(normalizedIn || "0");
    const outNumber = Number(normalizedOut || "0");

    if (!Number.isFinite(inNumber) || inNumber <= 0 || !Number.isFinite(outNumber) || outNumber <= 0) {
      return `1 ${amountInSymbol} = — ${amountOutSymbol}`;
    }

    const rate = outNumber / inNumber;
    if (!Number.isFinite(rate) || rate <= 0) {
      return `1 ${amountInSymbol} = — ${amountOutSymbol}`;
    }

    const formatted = trimTrailingZeros(rate.toFixed(6));
    return `1 ${amountInSymbol} = ${formatted} ${amountOutSymbol}`;
  }, [amountIn, amountOutValue, amountInSymbol, amountOutSymbol]);

  const recomputeDefaultChartPosition = useCallback(() => {
    // layout is derived from viewport and swapTitleRect; nothing extra to compute
  }, []);

  useEffect(() => {
    if (isChartOpen) {
      recomputeDefaultChartPosition();
    }
  }, [isChartOpen, recomputeDefaultChartPosition]);

  const handleOpenChart = () => {
    console.log("\n🔓 Opening Chart:");
    console.log("  Chart data available:", chartData.length, "points");
    console.log("  Current pair:", tokenA.symbol, "/", tokenB.symbol);
    if (chartData.length > 0) {
      console.log("  First point:", chartData[0]);
      console.log("  Last point:", chartData[chartData.length - 1]);
    } else {
      console.log("  ⚠️ WARNING: No chart data available when opening chart!");
    }
    setChartPhase("closed");
    setIsChartOpen(true);
    requestAnimationFrame(() => {
      setChartPhase("opening");
      // After card opening animation completes (0.52s), set phase to "open" to show glow
      setTimeout(() => {
        setChartPhase("open");
      }, 520);
    });
  };

  const handleCloseChart = () => {
    setChartPhase("closing");
    setTimeout(() => {
      setIsChartOpen(false);
      setChartPhase("closed");
    }, 600); // 400ms * 1.5 = 600ms
  };

  const handleOpenSwapDetails = () => {
    setSwapDetailsPhase("closed");
    setIsSwapDetailsOpen(true);
    requestAnimationFrame(() => {
      setSwapDetailsPhase("opening");
      setTimeout(() => {
        setSwapDetailsPhase("open");
      }, 520);
    });
  };

  const handleCloseSwapDetails = () => {
    setSwapDetailsPhase("closing");
    setTimeout(() => {
      setIsSwapDetailsOpen(false);
      setSwapDetailsPhase("closed");
      setSwapDetailsOffset({ x: 0, y: 0 });
    }, 600);
  };

  const handleSwapDetailsPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    swapDetailsDragLastRef.current = { x: event.clientX, y: event.clientY };
    setIsDraggingSwapDetails(true);
  }, []);

  useEffect(() => {
    if (!isDraggingSwapDetails) return;

    const handleMove = (event: PointerEvent) => {
      if (swapDetailsDragLastRef.current) {
        const deltaX = event.clientX - swapDetailsDragLastRef.current.x;
        const deltaY = event.clientY - swapDetailsDragLastRef.current.y;
        swapDetailsDragLastRef.current = { x: event.clientX, y: event.clientY };
        setSwapDetailsOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
      }
    };

    const handleUp = () => {
      swapDetailsDragLastRef.current = null;
      setIsDraggingSwapDetails(false);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDraggingSwapDetails]);

  useEffect(() => {
    // When direction changes, swap the amounts instead of clearing them
    if (amountIn && amountOutValue) {
      const tempIn = amountIn;
      const tempOut = amountOutValue;
      // Swap amounts synchronously to prevent layout shifts
      setAmountIn(tempOut);
      setAmountOutValue(tempIn);
      setActiveField("in");
      // Clear quote to force recalculation with new direction
      setQuote(null);
      setQuoteError(null);
      setTxStatus("idle");
      setTxHash(null);
      setAllowance(null);
      setAllowanceError(null);
      setIsApproving(false);
      setIsFetchingAllowance(false);
    } else {
      // Only clear if there are no amounts
      setAmountIn("");
      setAmountOutValue("");
      setActiveField("in");
      setQuote(null);
      setQuoteError(null);
      setTxStatus("idle");
      setTxHash(null);
      setAllowance(null);
      setAllowanceError(null);
      setIsApproving(false);
      setIsFetchingAllowance(false);
    }
  }, [direction]);
  
  // Separate effect for token changes (without swapping amounts)
  useEffect(() => {
    if (tokenA || tokenB) {
      // Only clear quote, don't clear amounts when tokens change
      setQuote(null);
      setQuoteError(null);
    }
  }, [tokenA, tokenB]);

  useEffect(() => {
    const updateRect = () => {
      if (cardRef.current) {
        setCardRect(cardRef.current.getBoundingClientRect());
      }
      if (swapCardRef.current) {
        setSwapCardRect(swapCardRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!isChartOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    // Remove any TradingView script that might be lingering
    const tvScript = document.getElementById("tradingview-widget-script");
    if (tvScript) {
      tvScript.remove();
      console.log("Removed TradingView script");
    }
    
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isChartOpen]);

  // Prevent body scroll when swap details popup is open
  useEffect(() => {
    if (!isSwapDetailsOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isSwapDetailsOpen]);

  // Forward quote: amountIn -> amountOut
  useEffect(() => {
    if (activeField !== "in") {
      return;
    }

    const supportsPair =
      (tokenA.address === env.asset0 && tokenB.address === env.asset1) ||
      (tokenA.address === env.asset1 && tokenB.address === env.asset0);
    if (!supportsPair) {
      console.log("⚠️  Quote skipped: Pair not supported");
      return;
    }

    let cancelled = false;

    const computeAmountOut = async () => {
      if (!amountIn) {
        setAmountOutValue("");
        setQuote(null);
        setIsQuoting(false);
        return;
      }

      if (!publicClient || !env.quoterAddress) {
        console.log("⚠️  Quote skipped: No publicClient or quoterAddress");
        return;
      }

      const quoterAddress = env.quoterAddress as `0x${string}`;
      
      // Verify quoter contract exists before calling
      try {
        const code = await publicClient.getBytecode({ address: quoterAddress });
        if (!code || code === "0x") {
          console.error("❌ Quoter contract does not exist at address:", quoterAddress);
          setQuoteError(`Quoter contract not found at ${quoterAddress.substring(0, 10)}.... Ensure contracts are deployed.`);
          setIsQuoting(false);
          return;
        }
        console.log("✅ Quoter contract verified at:", quoterAddress);
      } catch (checkError) {
        console.error("❌ Failed to verify quoter contract:", checkError);
        setQuoteError("Failed to verify quoter contract. Check network connection.");
        setIsQuoting(false);
        return;
      }

      const normalizedIn = amountIn.endsWith(".")
        ? amountIn.slice(0, -1)
        : amountIn;
      if (normalizedIn === "" || normalizedIn === ".") {
        return;
      }

      let amountInBigInt: bigint;
      try {
        amountInBigInt = parseUnits(normalizedIn, inputDecimals);
      } catch {
        console.log("⚠️  Failed to parse amount:", normalizedIn);
        return;
      }

      if (amountInBigInt === 0n) {
        setAmountOutValue("");
        setQuote(null);
        setIsQuoting(false);
        return;
      }

      console.log("\n╔═══════════════════════════════════════════════════════╗");
      console.log("║           📈 FETCHING FORWARD QUOTE                  ║");
      console.log("╚═══════════════════════════════════════════════════════╝");
      console.log("Direction:", direction === "a-to-b" ? `${tokenA.symbol} → ${tokenB.symbol}` : `${tokenB.symbol} → ${tokenA.symbol}`);
      console.log("Amount In:", normalizedIn, amountInSymbol);
      console.log("Amount In (BigInt):", amountInBigInt.toString());
      console.log("Input Token Address:", inputToken);
      console.log("Pool Asset0:", env.asset0Symbol, `(${env.asset0})`);
      console.log("Pool Asset1:", env.asset1Symbol, `(${env.asset1})`);
      console.log("Zero for One:", zeroForOne, `(${zeroForOne ? "asset0->asset1" : "asset1->asset0"})`);
      console.log("Quoter Address:", quoterAddress);
      console.log("📌 IMPORTANT: Using pool's fixed assets (asset0, asset1) with zeroForOne flag to determine direction");

      setIsQuoting(true);
      setQuoteError(null);

      console.log("🔵 Starting quote attempt...");
      console.log("  publicClient:", publicClient ? "✅" : "❌");
      console.log("  quoterAddress:", quoterAddress);
      console.log("  tokenA:", tokenA.address, tokenA.symbol);
      console.log("  tokenB:", tokenB.address, tokenB.symbol);
      console.log("  amountInBigInt:", amountInBigInt.toString());

      try {
        const quoteStartTime = Date.now();
        
        // Log the exact parameters being sent
        // IMPORTANT: Always use env.asset0 and env.asset1 for the pool - these are fixed
        // zeroForOne determines the direction: true = asset0->asset1, false = asset1->asset0
        const quoteParams = {
          asset0: env.asset0, // Always use pool's asset0
          asset1: env.asset1, // Always use pool's asset1
          quoter: quoterAddress,
          amount: amountInBigInt,
          asset0Balance: 0n,
          asset1Balance: 0n,
          bucketID: 0,
          zeroForOne, // Determines direction: true = asset0->asset1, false = asset1->asset0
          functionFlags: 0,
        };
        
        console.log("📞 Calling quoter with params:", {
          quoterAddress,
          params: quoteParams,
          dataParam: "0x",
        });
        
        // Always use direct call as fallback since readContract has issues with pure functions
        const callData = encodeFunctionData({
          abi: quoterAbi,
          functionName: "quote",
          args: [quoteParams, "0x"],
        });
        
        console.log("Call data:", callData);
        console.log("🔵 About to try readContract...");
        
        // Use raw RPC call to completely bypass viem's decoder
        let result: bigint;
        try {
          // Make raw eth_call request to avoid viem's automatic decoding
          const rawResponse = await publicClient.request({
            method: 'eth_call',
            params: [
              {
                to: quoterAddress,
                data: callData,
              },
              'latest',
            ],
          }) as `0x${string}`;
          
          console.log("📥 Raw RPC response:", rawResponse);
          
          if (!rawResponse || rawResponse === "0x" || rawResponse === "0x0") {
            throw new Error(`Quoter returned empty data. Raw response: ${rawResponse}`);
          }
          
          // Manually decode the result
          result = decodeFunctionResult({
            abi: quoterAbi,
            functionName: "quote",
            data: rawResponse,
          }) as bigint;
          
          console.log("✅ Quoter call succeeded! Result:", result.toString());
        } catch (rpcError: any) {
          console.error("Raw RPC call failed:", rpcError);
          console.error("Error message:", rpcError?.message || rpcError?.toString());
          console.error("Error code:", rpcError?.code);
          console.error("Error data:", rpcError?.data);
          
          // Check if it's a contract not found error
          const errorMsg = rpcError?.message || rpcError?.toString() || "";
          if (errorMsg.includes("no code") || errorMsg.includes("contract") || errorMsg.includes("execution reverted")) {
            // Try to verify contract exists
            try {
              const code = await publicClient.getBytecode({ address: quoterAddress });
              if (!code || code === "0x") {
                throw new Error(`Quoter contract does not exist at ${quoterAddress}. Deploy contracts first.`);
              }
            } catch (verifyError) {
              throw new Error(`Quoter contract verification failed: ${verifyError}`);
            }
          }
          
          // If raw RPC fails, try the regular call as fallback
          const callResult = await publicClient.call({
            to: quoterAddress,
            data: callData,
          });
          
          console.log("Fallback call result:", callResult);
          
          const returnData = typeof callResult === "string" ? callResult : callResult?.data;
          
          if (!returnData || returnData === "0x") {
            throw new Error(`Quoter returned empty data. Raw response: ${JSON.stringify(callResult)}`);
          }
          
          result = decodeFunctionResult({
            abi: quoterAbi,
            functionName: "quote",
            data: returnData as `0x${string}`,
          }) as bigint;
          
          console.log("✅ Fallback call succeeded! Result:", result.toString());
        }

        const quoteDuration = Date.now() - quoteStartTime;

        if (cancelled) {
          console.log("⚠️  Quote cancelled");
          return;
        }

        const formattedOut = formatUnits(result, outputDecimals);
        const trimmedOut = trimTrailingZeros(formattedOut);
        
        // Validate the formatted output is reasonable
        const outNum = Number(trimmedOut);
        if (!Number.isFinite(outNum) || outNum < 0) {
          console.error("Invalid quote result:", trimmedOut, "from raw:", result.toString());
          throw new Error("Invalid quote result");
        }
        
        // Check for suspiciously large numbers (likely a decimal/formatting issue)
        if (outNum > 1e15) {
          console.error("Suspiciously large quote result:", trimmedOut, "from raw:", result.toString(), "decimals:", outputDecimals);
          throw new Error("Quote result seems incorrect - value too large");
        }

        console.log("\n✅ Quote Result:");
        console.log("  Raw Amount Out (BigInt):", result.toString());
        console.log("  Formatted Amount Out:", trimmedOut, amountOutSymbol);
        console.log("  Quote Duration:", quoteDuration + "ms");
        console.log("  Exchange Rate:", Number(trimmedOut) / Number(normalizedIn), `${amountOutSymbol}/${amountInSymbol}`);

        setAmountOutValue(trimmedOut);
        setQuote({
          amountOut: trimmedOut,
          rawAmountOut: result,
        });
        setIsQuoting(false);
        setQuoteError(null);
      } catch (error: any) {
        if (!cancelled) {
          console.error("❌ Quote failed:");
          console.error("Error details:", error);
          console.error("Error message:", error?.message || error?.toString());
          console.error("Quoter address:", quoterAddress);
          console.error("Token A:", tokenA.address, tokenA.symbol);
          console.error("Token B:", tokenB.address, tokenB.symbol);
          console.error("Amount in:", amountInBigInt.toString());
          console.error("Zero for one:", zeroForOne);
          
          const errorMessage = error?.message || error?.toString() || "Unknown error";
          const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "default public RPC";
          const isLocalhost = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
          let userFriendlyError = "Unable to fetch quote.";
          
          console.error("Full error object:", JSON.stringify(error, null, 2));
          console.error("Error message:", errorMessage);
          console.error("Quoter address being called:", quoterAddress);
          
          if (errorMessage.includes("revert") || errorMessage.includes("execution reverted")) {
            userFriendlyError = "Quote reverted. Check quoter contract and parameters.";
          } else if (errorMessage.includes("no code") || errorMessage.includes("contract does not exist")) {
            userFriendlyError = `Quoter contract not found at ${quoterAddress.substring(0, 10)}.... Ensure contracts are deployed. Run: npm run deploy:local`;
          } else if (errorMessage.includes("contract") || errorMessage.includes("no data")) {
            // More specific check - verify if contract actually exists
            try {
              const code = await publicClient.getBytecode({ address: quoterAddress });
              if (!code || code === "0x") {
                userFriendlyError = `Quoter contract does not exist at ${quoterAddress}. Deploy contracts: npm run deploy:local`;
              } else {
                userFriendlyError = `Quote call failed: ${errorMessage.substring(0, 150)}`;
              }
            } catch (verifyError) {
              userFriendlyError = `Failed to verify contract: ${errorMessage.substring(0, 150)}`;
            }
          } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
            if (isLocalhost) {
              userFriendlyError = "Network error. Is Hardhat node running? Start with: npx hardhat node";
            } else {
              userFriendlyError = "Network error. Check RPC connection.";
            }
          } else {
            userFriendlyError = `Quote failed: ${errorMessage.substring(0, 150)}`;
          }
          
          setQuoteError(userFriendlyError);
          setIsQuoting(false);
        }
      }
    };

    computeAmountOut();

    return () => {
      cancelled = true;
    };
  }, [activeField, amountIn, publicClient, inputDecimals, outputDecimals, tokenA, tokenB, zeroForOne, env.quoterAddress, amountInSymbol, amountOutSymbol, direction]);

  // Reverse quote: amountOut -> amountIn
  useEffect(() => {
    if (activeField !== "out") {
      return;
    }

    const supportsPair =
      (tokenA.address === env.asset0 && tokenB.address === env.asset1) ||
      (tokenA.address === env.asset1 && tokenB.address === env.asset0);
    if (!supportsPair) {
      return;
    }

    let cancelled = false;

    const computeAmountInFromDesiredOut = async () => {
      if (!amountOutValue) {
        setAmountIn("");
        setQuote(null);
        return;
      }

      if (!publicClient || !env.quoterAddress) {
        console.log("⚠️  Reverse quote skipped: No publicClient or quoterAddress");
        return;
      }

      const quoterAddress = env.quoterAddress as `0x${string}`;

      const normalizedOut = amountOutValue.endsWith(".")
        ? amountOutValue.slice(0, -1)
        : amountOutValue;
      if (normalizedOut === "" || normalizedOut === ".") {
        return;
      }

      let desiredOut: bigint;
      try {
        desiredOut = parseUnits(normalizedOut, outputDecimals);
      } catch {
        console.log("⚠️  Failed to parse desired output:", normalizedOut);
        return;
      }

      if (desiredOut === 0n) {
        setAmountIn("");
        setQuote(null);
        return;
      }

      console.log("\n╔═══════════════════════════════════════════════════════╗");
      console.log("║           📉 FETCHING REVERSE QUOTE                  ║");
      console.log("╚═══════════════════════════════════════════════════════╝");
      console.log("Direction:", direction === "a-to-b" ? `${tokenA.symbol} → ${tokenB.symbol}` : `${tokenB.symbol} → ${tokenA.symbol}`);
      console.log("Desired Amount Out:", normalizedOut, amountOutSymbol);
      console.log("Desired Out (BigInt):", desiredOut.toString());
      console.log("Inverting quote to find required input...");

      const readQuote = async (amount: bigint) =>
        publicClient.readContract({
          address: quoterAddress,
          abi: quoterAbi,
          functionName: "quote",
          args: [
            {
              asset0: env.asset0, // Always use pool's asset0
              asset1: env.asset1, // Always use pool's asset1
              quoter: quoterAddress,
              amount,
              asset0Balance: 0n,
              asset1Balance: 0n,
              bucketID: 0,
              zeroForOne,
              functionFlags: 0,
            },
            "0x",
          ],
        }) as Promise<bigint>;

      let guess: bigint;
      try {
        const normalizedIn = amountIn.endsWith(".") ? amountIn.slice(0, -1) : amountIn;
        guess = normalizedIn ? parseUnits(normalizedIn, inputDecimals) : desiredOut;
      } catch {
        guess = desiredOut;
      }

      if (guess === 0n) {
        guess = desiredOut === 0n ? 1n : desiredOut;
      }

      console.log("Initial guess:", formatUnits(guess, inputDecimals), amountInSymbol);

      const maxIterations = 8;
      const iterationStartTime = Date.now();
      
      for (let i = 0; i < maxIterations; i++) {
        let quoted: bigint;
        try {
          quoted = await readQuote(guess);
        } catch (error: any) {
          if (!cancelled) {
            console.error("❌ Failed to invert quote:");
            console.error("Error details:", error);
            console.error("Error message:", error?.message || error?.toString());
            console.error("Quoter address:", quoterAddress);
            console.error("Guess amount:", guess.toString());
            
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            let userFriendlyError = "Unable to fetch quote.";
            
            if (errorMessage.includes("revert") || errorMessage.includes("execution reverted")) {
              userFriendlyError = "Quote reverted. Check quoter contract.";
            } else if (errorMessage.includes("contract") || errorMessage.includes("no data")) {
              userFriendlyError = "Quoter contract not found. Check quoter address.";
            } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
              userFriendlyError = "Network error. Check RPC connection.";
            } else {
              userFriendlyError = `Quote failed: ${errorMessage.substring(0, 100)}`;
            }
            
            setQuoteError(userFriendlyError);
          }
          return;
        }

        if (cancelled) {
          console.log("⚠️  Reverse quote cancelled");
          return;
        }

        console.log(`  Iteration ${i + 1}: guess=${formatUnits(guess, inputDecimals)} → quoted=${formatUnits(quoted, outputDecimals)}`);

        if (quoted === desiredOut) {
          console.log(`  ✅ Exact match found at iteration ${i + 1}!`);
          break;
        }

        if (quoted === 0n) {
          guess = guess === 0n ? 1n : guess * 2n;
          console.log(`  ⚠️  Got 0, doubling guess to ${formatUnits(guess, inputDecimals)}`);
          continue;
        }

        const nextGuess = (guess * desiredOut) / quoted;
        if (nextGuess === guess || nextGuess === 0n) {
          guess = nextGuess === 0n ? 1n : nextGuess;
          console.log(`  ⚠️  Converged at iteration ${i + 1}`);
          break;
        }
        guess = nextGuess;
      }

      if (cancelled) {
        return;
      }

      const iterationDuration = Date.now() - iterationStartTime;
      const formattedGuess = trimTrailingZeros(formatUnits(guess, inputDecimals));
      
      console.log("\n✅ Reverse Quote Result:");
      console.log("  Required Amount In:", formattedGuess, amountInSymbol);
      console.log("  Raw Amount In (BigInt):", guess.toString());
      console.log("  Iteration Duration:", iterationDuration + "ms");
      console.log("  Inverse Exchange Rate:", Number(normalizedOut) / Number(formattedGuess), `${amountInSymbol}/${amountOutSymbol}`);
      
      setAmountIn(formattedGuess);
    };

    computeAmountInFromDesiredOut();

    return () => {
      cancelled = true;
    };
  }, [activeField, amountOutValue, publicClient, inputDecimals, outputDecimals, tokenA, tokenB, zeroForOne, env.quoterAddress, amountIn]);

  useEffect(() => {
    const fetchAllowance = async () => {
      if (
        !requiresApproval ||
        !isConnected ||
        !publicClient ||
        !configReady ||
        !env.poolManagerAddress ||
        !address ||
        isNativeInput ||
        !inputToken ||
        inputToken === "0x0000000000000000000000000000000000000000"
      ) {
        setAllowance(null);
        setAllowanceError(null);
        return;
      }

      setIsFetchingAllowance(true);
      setAllowanceError(null);
      try {
        // Add retry logic for network errors
        let lastError: any = null;
        const maxRetries = 2;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await publicClient.readContract({
              address: inputToken as `0x${string}`,
              abi: erc20Abi,
              functionName: "allowance",
              args: [address, env.poolManagerAddress],
            });
            setAllowance(result as bigint);
            setAllowanceError(null);
            return; // Success, exit retry loop
          } catch (error: any) {
            lastError = error;
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            
            // Handle "Cannot decode zero data" error - this can happen when contract returns empty response
            // Try fallback: use direct call or treat as allowance = 0
            if (errorMessage.includes("Cannot decode zero data") || errorMessage.includes("zero data")) {
              try {
                // Try using call directly as fallback
                const data = await publicClient.call({
                  to: inputToken as `0x${string}`,
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "allowance",
                    args: [address, env.poolManagerAddress],
                  }),
                });
                
                if (data && data.data && data.data !== "0x") {
                  const decoded = decodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "allowance",
                    data: data.data,
                  });
                  setAllowance(decoded as bigint);
                  setAllowanceError(null);
                  return;
                } else {
                  // If still empty, treat as allowance = 0 (safe default)
                  console.warn("Contract returned empty data, treating as allowance = 0");
                  setAllowance(0n);
                  setAllowanceError(null);
                  return;
                }
              } catch (fallbackError: any) {
                // If fallback also fails, treat as allowance = 0
                console.warn("Fallback allowance fetch failed, treating as allowance = 0", fallbackError);
                setAllowance(0n);
                setAllowanceError(null);
                return;
              }
            }
            
            // Only retry on network errors, not contract errors
            if (attempt < maxRetries && (
              errorMessage.includes("network") || 
              errorMessage.includes("fetch") ||
              errorMessage.includes("timeout") ||
              errorMessage.includes("ECONNREFUSED") ||
              errorMessage.includes("Failed to fetch")
            )) {
              console.warn(`Allowance fetch attempt ${attempt + 1} failed, retrying...`, errorMessage);
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
            throw error; // Re-throw if not a retryable error or max retries reached
          }
        }
      } catch (error: any) {
        console.error("Failed to fetch allowance after retries", error);
        console.error("Token address:", inputToken);
        console.error("RPC URL:", process.env.NEXT_PUBLIC_RPC_URL || "default public RPC");
        const errorMessage = error?.message || error?.toString() || "Unknown error";
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "default public RPC";
        const isLocalhost = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
        
        // Provide more helpful error messages
        if (errorMessage.includes("revert") || errorMessage.includes("execution reverted")) {
          setAllowanceError("Token contract error. Check token address.");
        } else if (errorMessage.includes("network") || errorMessage.includes("fetch") || errorMessage.includes("timeout")) {
          if (isLocalhost) {
            setAllowanceError("Network error. Is Hardhat node running? Start with: npx hardhat node");
          } else {
            setAllowanceError(`Network error. Check RPC connection (${rpcUrl.substring(0, 30)}...).`);
          }
        } else if (
          errorMessage.includes("Cannot decode zero data") ||
          errorMessage.includes("zero data") ||
          errorMessage.includes("returned no data") ||
          errorMessage.includes("contract")
        ) {
          // Check if this might be a localhost address on Sepolia network
          const isLocalhostAddress = inputToken.startsWith("0x5FbDB") || inputToken.startsWith("0xe7f17");
          const isPlaceholderAddress = /^0x000000000000000000000000000000000000000[0-9a-f]$/i.test(inputToken);
          
          if (isPlaceholderAddress) {
            setAllowanceError("This token doesn't exist on localhost. Only sWETH and sUSDC are available.");
          } else if (isLocalhostAddress && rpcUrl.includes("sepolia")) {
            setAllowanceError(`Contract not found. Token ${inputToken.substring(0, 10)}... is a localhost address. Switch to localhost RPC or deploy to Sepolia.`);
          } else if (isLocalhostAddress && isLocalhost) {
            setAllowanceError(`Contract not found at ${inputToken.substring(0, 10)}.... Ensure Hardhat node is running and contracts are deployed.`);
          } else if (!isLocalhost && !rpcUrl.includes("sepolia")) {
            setAllowanceError(`Contract not found at ${inputToken.substring(0, 10)}.... Token may not exist on this network. Check token address and network match.`);
          } else {
            setAllowanceError(`Contract not found at ${inputToken.substring(0, 10)}.... Token may not be deployed or doesn't exist on ${isLocalhost ? "localhost" : "this network"}.`);
          }
        } else {
          setAllowanceError(`Unable to fetch allowance: ${errorMessage.substring(0, 50)}`);
        }
      } finally {
        setIsFetchingAllowance(false);
      }
    };

    fetchAllowance();
  }, [
    requiresApproval,
    isConnected,
    publicClient,
    configReady,
    env.poolManagerAddress,
    address,
    inputToken,
    isNativeInput,
    txStatus,
  ]);

  const needsApproval = Boolean(
    requiresApproval &&
      parsedAmountIn &&
      parsedAmountIn > 0n &&
      allowance !== null &&
      allowance < parsedAmountIn
  );

  const handleSwap = async () => {
    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║              🔄 INITIATING SWAP                      ║");
    console.log("╚═══════════════════════════════════════════════════════╝");
    
    const supportsPair =
      (tokenA.address === env.asset0 && tokenB.address === env.asset1) ||
      (tokenA.address === env.asset1 && tokenB.address === env.asset0);
    
    console.log("Pre-flight checks:");
    console.log("  Wallet Client:", effectiveWalletClient ? "✅" : "❌");
    console.log("  Public Client:", publicClient ? "✅" : "❌");
    console.log("  Pool Manager:", env.poolManagerAddress || "❌ NOT SET");
    console.log("  Pool Markings:", env.poolMarkings || "❌ NOT SET");
    console.log("  Pair Supported:", supportsPair ? "✅" : "❌");
    
    if (!effectiveWalletClient || !publicClient || !env.poolManagerAddress || !env.poolMarkings || !supportsPair) {
      console.log("❌ Swap aborted: Configuration incomplete");
      setQuoteError("Swap configuration is incomplete. Check environment variables.");
      return;
    }
    if (!parsedAmountIn || parsedAmountIn === 0n) {
      console.log("❌ Swap aborted: No amount entered");
      setQuoteError("Enter an amount to swap.");
      return;
    }
    if (!quote) {
      console.log("❌ Swap aborted: No quote available");
      setQuoteError("Quote unavailable.");
      return;
    }
    if (requiresApproval && needsApproval) {
      console.log("❌ Swap aborted: Approval required");
      setQuoteError("Please approve the token before swapping.");
      return;
    }

    try {
      setTxStatus("pending");
      setQuoteError(null);

      const minAmountOut = quote.rawAmountOut - (quote.rawAmountOut * BigInt(DEFAULT_SLIPPAGE_BPS)) / 10_000n;

      console.log("\n📝 Swap Parameters:");
      console.log("  Input Token:", amountInSymbol, `(${inputToken})`);
      console.log("  Output Token:", amountOutSymbol);
      console.log("  Pool Asset0:", env.asset0Symbol, `(${env.asset0})`);
      console.log("  Pool Asset1:", env.asset1Symbol, `(${env.asset1})`);
      console.log("  Quoter:", env.quoterAddress);
      console.log("  Pool Markings:", env.poolMarkings);
      console.log("  Amount In:", formatUnits(parsedAmountIn, inputDecimals), amountInSymbol);
      console.log("  Amount In (Raw):", parsedAmountIn.toString());
      console.log("  Zero For One:", zeroForOne, `(${zeroForOne ? "asset0->asset1" : "asset1->asset0"})`);
      console.log("  Expected Out:", quote.amountOut, amountOutSymbol);
      console.log("  Expected Out (Raw):", quote.rawAmountOut.toString());
      console.log("  Min Amount Out:", formatUnits(minAmountOut, outputDecimals), amountOutSymbol);
      console.log("  Min Amount Out (Raw):", minAmountOut.toString());
      console.log("  Slippage:", DEFAULT_SLIPPAGE_BPS / 100, "%");

      console.log("\n⏳ Sending transaction...");
      const txStartTime = Date.now();

      // Simulate the transaction first to catch revert reasons
      if (publicClient) {
        try {
          console.log("🔍 Simulating transaction...");
          await publicClient.simulateContract({
            address: env.poolManagerAddress,
            abi: poolManagerAbi,
            functionName: "swap",
            args: [
              env.asset0,
              env.asset1,
              env.quoterAddress,
              env.poolMarkings as `0x${string}`,
              parsedAmountIn,
              zeroForOne,
              minAmountOut,
            ],
            account: address,
          });
          console.log("✅ Simulation successful");
        } catch (simError: any) {
          console.log("❌ Simulation failed:", simError);
          
          // Try to decode the error
          let decodedError: any = null;
          if (simError?.data || simError?.cause?.data) {
            const errorData = simError?.data || simError?.cause?.data;
            try {
              decodedError = decodeErrorResult({
                abi: poolManagerAbi,
                data: errorData as `0x${string}`,
              });
              console.log("Decoded error:", decodedError);
            } catch (decodeErr) {
              console.log("Could not decode error:", decodeErr);
            }
          }
          
          if (decodedError) {
            if (decodedError.errorName === "PoolManager__InsufficientAsset1") {
              const [required, available] = decodedError.args as [bigint, bigint];
              throw new Error(`Insufficient liquidity: Pool has ${formatUnits(available, outputDecimals)} ${amountOutSymbol}, but swap requires ${formatUnits(required, outputDecimals)} ${amountOutSymbol}. Try a smaller amount.`);
            } else if (decodedError.errorName === "PoolManager__InsufficientAsset0") {
              const [required, available] = decodedError.args as [bigint, bigint];
              throw new Error(`Insufficient liquidity: Pool has ${formatUnits(available, inputDecimals)} ${amountInSymbol}, but swap requires ${formatUnits(required, inputDecimals)} ${amountInSymbol}. Try a smaller amount.`);
            } else if (decodedError.errorName === "PoolManager__InsufficientOutput") {
              const [minOut, actual] = decodedError.args as [bigint, bigint];
              throw new Error(`Slippage exceeded: Expected at least ${formatUnits(minOut, outputDecimals)} ${amountOutSymbol}, but would receive ${formatUnits(actual, outputDecimals)} ${amountOutSymbol}. Try increasing slippage tolerance.`);
            } else if (decodedError.errorName === "PoolManager__InvalidQuote") {
              throw new Error("Invalid quote returned from quoter. The quoter may not support this swap.");
            } else {
              throw new Error(`Transaction would revert: ${decodedError.errorName || "Unknown error"}`);
            }
          }
          
          if (simError?.shortMessage) {
            throw new Error(`Transaction would revert: ${simError.shortMessage}`);
          }
          if (simError?.message) {
            throw new Error(`Transaction would revert: ${simError.message}`);
          }
          throw simError;
        }
      }

      const result = await effectiveWalletClient.writeContract({
        account: address!,
        address: env.poolManagerAddress,
        abi: poolManagerAbi,
        functionName: "swap",
        args: [
          env.asset0, // Always use pool's asset0
          env.asset1, // Always use pool's asset1
          env.quoterAddress,
          env.poolMarkings as `0x${string}`,
          parsedAmountIn,
          zeroForOne, // Determines direction: true = asset0->asset1, false = asset1->asset0
          minAmountOut,
        ],
        value: 0n,
        chain: null,
      });

      const txDuration = Date.now() - txStartTime;

      console.log("\n✅ SWAP TRANSACTION SUCCESS!");
      console.log("  Transaction Hash:", result);
      console.log("  Time to Submit:", txDuration + "ms");
      const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "";
      const isLocalhost = !explorerUrl || explorerUrl.includes("localhost") || explorerUrl.includes("127.0.0.1");
      if (!isLocalhost) {
        console.log("  Explorer:", `${explorerUrl}/tx/${result}`);
      } else {
        console.log("  Note: Localhost transaction - no block explorer available");
      }

      setTxHash(result);
      setTxStatus("success");
      setSwapDetails({
        amountIn: formatUnits(parsedAmountIn, inputDecimals),
        amountOut: quote.amountOut,
        tokenIn: amountInSymbol,
        tokenOut: amountOutSymbol,
      });
      // Open swap details popup automatically
      handleOpenSwapDetails();
    } catch (error: any) {
      console.log("\n❌ SWAP TRANSACTION FAILED!");
      console.error("Error details:", error);
      
      let errorMessage = "Swap transaction failed. ";
      
      if (error && typeof error === 'object') {
        console.log("Error type:", error.constructor?.name);
        if ('message' in error) {
          console.log("Message:", error.message);
          errorMessage += error.message;
        }
        if ('shortMessage' in error) {
          console.log("Short message:", error.shortMessage);
          errorMessage = error.shortMessage || errorMessage;
        }
        if ('code' in error) {
          console.log("Code:", error.code);
        }
        if ('cause' in error && error.cause) {
          console.log("Cause:", error.cause);
          if (typeof error.cause === 'object' && 'message' in error.cause) {
            errorMessage += ` (${error.cause.message})`;
          }
        }
        if ('data' in error) {
          console.log("Error data:", error.data);
          if (typeof error.data === 'object' && 'message' in error.data) {
            errorMessage += ` - ${error.data.message}`;
          }
        }
        if ('reason' in error) {
          console.log("Reason:", error.reason);
          errorMessage += ` Reason: ${error.reason}`;
        }
      }
      
      // Check if it's a network/RPC error
      if (errorMessage.includes("JSON-RPC") || errorMessage.includes("Internal")) {
        errorMessage = "Transaction reverted. Check console for details. Possible causes: insufficient liquidity, slippage too high, or pool not initialized.";
      }
      
      setTxStatus("error");
      setQuoteError(errorMessage);
    }
  };

  const handleApprove = async () => {
    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║            ✓ REQUESTING TOKEN APPROVAL               ║");
    console.log("╚═══════════════════════════════════════════════════════╝");
    
    console.log("Approval checks:");
    console.log("  Wallet Client:", effectiveWalletClient ? "✅" : "❌");
    console.log("  Pool Manager:", env.poolManagerAddress || "❌ NOT SET");
    console.log("  Is Native Input:", isNativeInput ? "✅ (no approval needed)" : "❌");
    
    if (!effectiveWalletClient) {
      console.log("❌ Approval aborted: Wallet client not available");
      setAllowanceError("Wallet client not available. Please reconnect your wallet.");
      return;
    }
    
    if (!env.poolManagerAddress) {
      console.log("❌ Approval aborted: Pool manager address not set");
      setAllowanceError("Pool manager address not configured.");
      return;
    }
    
    if (isNativeInput) {
      console.log("❌ Approval aborted: Native input doesn't require approval");
      return;
    }

    try {
      console.log("\n📝 Approval Parameters:");
      console.log("  Token:", amountInSymbol, `(${inputToken})`);
      console.log("  Spender:", env.poolManagerAddress);
      console.log("  Amount:", "Unlimited (maxUint256)");
      console.log("  Current Allowance:", allowance?.toString() || "unknown");
      
      // Pre-flight check: Verify contract exists
      if (publicClient) {
        try {
          const code = await publicClient.getBytecode({ address: inputToken });
          if (!code || code === "0x") {
            setAllowanceError(`Token contract not found at ${inputToken}. Is Hardhat node running and contracts deployed?`);
            return;
          }
          console.log("✅ Token contract verified at:", inputToken);
        } catch (checkError) {
          console.log("⚠️ Could not verify contract:", checkError);
        }
      }
      
      setIsApproving(true);
      setAllowanceError(null);
      
      console.log("\n⏳ Sending approval transaction...");
      const approvalStartTime = Date.now();
      
      const result = await effectiveWalletClient.writeContract({
        account: address!,
        address: inputToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [env.poolManagerAddress, maxUint256],
        chain: null,
      });
      
      const approvalDuration = Date.now() - approvalStartTime;
      
      console.log("\n✅ APPROVAL TRANSACTION SUCCESS!");
      console.log("  Transaction Hash:", result);
      console.log("  Time to Submit:", approvalDuration + "ms");
      console.log("  New Allowance:", maxUint256.toString());
      
      setAllowance(maxUint256);
    } catch (error: any) {
      console.log("\n❌ APPROVAL TRANSACTION FAILED!");
      console.error("Error details:", error);
      
      let errorMessage = "Approval failed. ";
      
      if (error && typeof error === 'object') {
        console.log("Error type:", error.constructor?.name);
        if ('message' in error) {
          console.log("Message:", error.message);
          errorMessage += error.message;
        }
        if ('code' in error) {
          console.log("Code:", error.code);
        }
        if ('shortMessage' in error) {
          console.log("Short message:", error.shortMessage);
          errorMessage = error.shortMessage || errorMessage;
        }
        if ('cause' in error && error.cause) {
          console.log("Cause:", error.cause);
          if (typeof error.cause === 'object' && 'message' in error.cause) {
            errorMessage += ` (${error.cause.message})`;
          }
        }
        if ('data' in error) {
          console.log("Error data:", error.data);
        }
      }
      
      // Check if it's a network/RPC error
      if (errorMessage.includes("JSON-RPC") || errorMessage.includes("Internal") || errorMessage.includes("network")) {
        errorMessage = "Network error. Is Hardhat node running? Start with: MAINNET_RPC=\"\" npx hardhat node";
      }
      
      setAllowanceError(errorMessage);
    } finally {
      setIsApproving(false);
    }
  };

  const handleOverlayPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Disable dragging on mobile
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return;
    }
    event.preventDefault();
    overlayPointerIdRef.current = event.pointerId;
    overlayDragLastRef.current = { x: event.clientX, y: event.clientY };
    setIsDraggingChart(true);
  }, []);

  const handleSwapCardDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    swapCardDragLastRef.current = { x: event.clientX, y: event.clientY };
    setIsDraggingSwapCard(true);
  }, []);

  const handleResizeStart = useCallback((edge: string, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    
    const chartHeightVh = isChartMaximized ? 90 : 77;
    const currentWidth = chartSize.width > 0 ? chartSize.width : (isChartMaximized ? window.innerWidth * 0.8 : Math.min(window.innerWidth * 0.92, 1100));
    const currentHeight = chartSize.height > 0 ? chartSize.height : (isChartMaximized ? window.innerHeight * 0.9 : Math.min(window.innerHeight * (chartHeightVh / 100), 840));
    
    resizeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: currentWidth,
      height: currentHeight,
      offsetX: overlayOffsetRef.current.x,
      offsetY: overlayOffsetRef.current.y,
    };
    
    setResizeEdge(edge);
    setIsResizing(true);
    if (chartSize.width === 0) {
      setChartSize({ width: currentWidth, height: currentHeight });
    }
  }, [isChartMaximized, chartSize]);

  useEffect(() => {
    if (!isDraggingSwapCard) return;

    const handleMove = (event: PointerEvent) => {
      if (swapCardDragLastRef.current) {
        const deltaX = event.clientX - swapCardDragLastRef.current.x;
        const deltaY = event.clientY - swapCardDragLastRef.current.y;
        swapCardDragLastRef.current = { x: event.clientX, y: event.clientY };
        setSwapCardOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
      }
    };

    const handleUp = () => {
      swapCardDragLastRef.current = null;
      setIsDraggingSwapCard(false);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDraggingSwapCard]);

  useEffect(() => {
    if (!isDraggingChart && !isResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (isDraggingChart) {
        if (overlayPointerIdRef.current !== null && event.pointerId !== overlayPointerIdRef.current) {
          return;
        }
        if (!overlayDragLastRef.current) return;
        const deltaX = event.clientX - overlayDragLastRef.current.x;
        const deltaY = event.clientY - overlayDragLastRef.current.y;
        overlayDragLastRef.current = { x: event.clientX, y: event.clientY };
        overlayOffsetRef.current = {
          x: overlayOffsetRef.current.x + deltaX,
          y: overlayOffsetRef.current.y + deltaY,
        };
        setOverlayOffset({ ...overlayOffsetRef.current });
      } else if (isResizing && resizeStartRef.current && resizeEdge) {
        const deltaX = event.clientX - resizeStartRef.current.x;
        const deltaY = event.clientY - resizeStartRef.current.y;
        
        let newWidth = resizeStartRef.current.width;
        let newHeight = resizeStartRef.current.height;
        
        if (resizeEdge.includes('right')) {
          newWidth = Math.max(400, Math.min(window.innerWidth - 100, resizeStartRef.current.width + deltaX));
        }
        if (resizeEdge.includes('left')) {
          newWidth = Math.max(400, Math.min(window.innerWidth - 100, resizeStartRef.current.width - deltaX));
        }
        if (resizeEdge.includes('bottom')) {
          newHeight = Math.max(300, Math.min(window.innerHeight - 100, resizeStartRef.current.height + deltaY));
        }
        if (resizeEdge.includes('top')) {
          newHeight = Math.max(400, Math.min(window.innerHeight - 100, resizeStartRef.current.height - deltaY));
        }
        
        setChartSize({ width: newWidth, height: newHeight });
        
        let newOffsetX = resizeStartRef.current.offsetX;
        let newOffsetY = resizeStartRef.current.offsetY;
        
        if (resizeEdge.includes('left')) {
          const widthChange = newWidth - resizeStartRef.current.width;
          newOffsetX = resizeStartRef.current.offsetX - (widthChange / 2);
        } else if (resizeEdge.includes('right')) {
          const widthChange = newWidth - resizeStartRef.current.width;
          newOffsetX = resizeStartRef.current.offsetX + (widthChange / 2);
        }
        
        if (resizeEdge.includes('top')) {
          const heightChange = newHeight - resizeStartRef.current.height;
          newOffsetY = resizeStartRef.current.offsetY - (heightChange / 2);
        } else if (resizeEdge.includes('bottom')) {
          const heightChange = newHeight - resizeStartRef.current.height;
          newOffsetY = resizeStartRef.current.offsetY + (heightChange / 2);
        }
        
        overlayOffsetRef.current = {
          x: newOffsetX,
          y: newOffsetY,
        };
        setOverlayOffset({ ...overlayOffsetRef.current });
      }
    };

    const handleUp = (event: PointerEvent) => {
      if (isDraggingChart) {
        if (overlayPointerIdRef.current !== null && event.pointerId !== overlayPointerIdRef.current) {
          return;
        }
        overlayPointerIdRef.current = null;
        overlayDragLastRef.current = null;
        setIsDraggingChart(false);
      } else if (isResizing) {
        setIsResizing(false);
        setResizeEdge(null);
        resizeStartRef.current = null;
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDraggingChart]);

  useEffect(() => {
    overlayOffsetRef.current = { x: 0, y: 0 };
    setOverlayOffset({ x: 0, y: 0 });
  }, [cardRect?.top, cardRect?.left, cardRect?.width, cardRect?.height]);

  useEffect(() => {
    const updateSwapTitleRect = () => {
      if (swapTitleRef.current) {
        setSwapTitleRect(swapTitleRef.current.getBoundingClientRect());
      }
    };
    updateSwapTitleRect();
    window.addEventListener("resize", updateSwapTitleRect);
    window.addEventListener("scroll", updateSwapTitleRect, true);
    return () => {
      window.removeEventListener("resize", updateSwapTitleRect);
      window.removeEventListener("scroll", updateSwapTitleRect, true);
    };
  }, []);

  useEffect(() => {
    console.log("\n\n");
    console.log("═══════════════════════════════════════════════════════");
    console.log("📊 CHART DATA EFFECT TRIGGERED - THIS SHOULD SHOW!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("Token A Symbol:", tokenA?.symbol || "UNDEFINED");
    console.log("Token B Symbol:", tokenB?.symbol || "UNDEFINED");
    console.log("Token A Object:", tokenA);
    console.log("Token B Object:", tokenB);
    
    const fetchRealPriceData = async () => {
      try {
        setIsLoadingChartData(true);
        const symbolA = tokenA.symbol.toUpperCase();
        const symbolB = tokenB.symbol.toUpperCase();
        
        console.log("\n🔍 Starting API fetch for", symbolA, "/", symbolB);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("API: CoinGecko (https://api.coingecko.com)");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Use CoinGecko API for real price data
        const coins: Record<string, string> = {
          ETH: "ethereum",
          WETH: "ethereum",
          SWETH: "ethereum", // Staked WETH maps to Ethereum
          BTC: "bitcoin",
          WBTC: "wrapped-bitcoin",
          USDC: "usd-coin",
          SUSDC: "usd-coin", // Staked USDC maps to USDC
          DAI: "dai",
          USDT: "tether",
          LINK: "chainlink",
          UNI: "uniswap",
          MKR: "maker",
          AAVE: "aave",
          COMP: "compound-governance-token",
          ARB: "arbitrum",
        };
        
        const coinA = coins[symbolA];
        const coinB = coins[symbolB];
        
        console.log("🔎 Mapped symbols:");
        console.log("  ", symbolA, "→", coinA || "NOT FOUND");
        console.log("  ", symbolB, "→", coinB || "NOT FOUND");
        
        if (!coinA || !coinB) {
          console.log("⚠️  Pair not supported for real data, using synthetic");
          generateSyntheticData();
          return;
        }
        
        // Map time range to days for CoinGecko API
        const timeRangeToDays: Record<string, number> = {
          "1D": 1,
          "1W": 7,
          "1M": 30,
          "3M": 90,
          "6M": 180,
          "YTD": Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24)),
          "1Y": 365,
          "2Y": 730,
          "5Y": 1825,
          "10Y": 3650,
          "ALL": 3650, // Max supported by CoinGecko free tier
        };
        const days = timeRangeToDays[chartTimeRange] || 7;
        const vs_currency = "usd";
        
        // Use Next.js API route to avoid CORS issues
        const urlA = `/api/coingecko/market-chart?id=${coinA}&vs_currency=${vs_currency}&days=${days}`;
        const urlB = `/api/coingecko/market-chart?id=${coinB}&vs_currency=${vs_currency}&days=${days}`;
        
        console.log("\n🌐 API Endpoints (via Next.js proxy):");
        console.log("  A:", urlA);
        console.log("  B:", urlB);
        
        console.log("\n⏳ Fetching from CoinGecko via API proxy...");
        const fetchStartTime = Date.now();
        
        const [responseA, responseB] = await Promise.all([
          fetch(urlA).catch(err => {
            console.error("❌ Fetch error for coinA:", err);
            throw new Error(`Failed to fetch ${coinA}: ${err.message}`);
          }),
          fetch(urlB).catch(err => {
            console.error("❌ Fetch error for coinB:", err);
            throw new Error(`Failed to fetch ${coinB}: ${err.message}`);
          })
        ]);
        
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`✅ Fetch completed in ${fetchDuration}ms`);
        console.log("📡 Response Status:");
        console.log("  A:", responseA.status, responseA.statusText);
        console.log("  B:", responseB.status, responseB.statusText);
        
        if (!responseA.ok || !responseB.ok) {
          const errorTextA = await responseA.text().catch(() => "Unable to read error");
          const errorTextB = await responseB.text().catch(() => "Unable to read error");
          throw new Error(`API error: ${responseA.status}/${responseB.status} - ${errorTextA.substring(0, 100)} / ${errorTextB.substring(0, 100)}`);
        }
        
        const dataA = await responseA.json().catch(err => {
          console.error("❌ JSON parse error for coinA:", err);
          throw new Error(`Failed to parse response for ${coinA}: ${err.message}`);
        });
        const dataB = await responseB.json().catch(err => {
          console.error("❌ JSON parse error for coinB:", err);
          throw new Error(`Failed to parse response for ${coinB}: ${err.message}`);
        });
        
        console.log("\n📦 Raw API Response:");
        console.log("Data A keys:", Object.keys(dataA));
        console.log("Data B keys:", Object.keys(dataB));
        console.log("Data A sample:", {
          prices_count: dataA.prices?.length || 0,
          first_price: dataA.prices?.[0],
          last_price: dataA.prices?.[dataA.prices?.length - 1]
        });
        console.log("Data B sample:", {
          prices_count: dataB.prices?.length || 0,
          first_price: dataB.prices?.[0],
          last_price: dataB.prices?.[dataB.prices?.length - 1]
        });
        
        if (dataA.prices && dataB.prices && dataA.prices.length > 0 && dataB.prices.length > 0) {
          const minLength = Math.min(dataA.prices.length, dataB.prices.length);
          console.log("\n🔢 Processing data points:", minLength);
          console.log("📐 Exchange rate direction:", `${symbolA}/${symbolB}`);
          console.log("   Formula: priceA / priceB =", symbolA, "per", symbolB);
          
          const points = [];
          
          // Match timestamps and calculate cross-rate
          // CoinGecko doesn't provide direct cross-rates, so we calculate from USD prices:
          // TokenA/USD / TokenB/USD = TokenA/TokenB
          // Example: ETH/USD ($2500) / USDC/USD ($1) = 2500 USDC per ETH (ETH/USDC)
          for (let i = 0; i < minLength; i++) {
            const timeA = Math.floor(dataA.prices[i][0] / 1000);
            const priceA = dataA.prices[i][1]; // TokenA price in USD
            const priceB = dataB.prices[i][1]; // TokenB price in USD
            
            if (priceB > 0) {
              // Calculate TokenA/TokenB exchange rate
              // This gives: how many TokenB units per 1 TokenA unit
              const ratio = priceA / priceB;
              points.push({
                time: timeA as UTCTimestamp,
                value: Number(ratio.toFixed(6)),
              });
            }
          }
          
          console.log("✅ Exchange rate calculation:");
          console.log("   Example: If ETH = $2500 USD and USDC = $1 USD");
          console.log("   Then ETH/USDC = $2500 / $1 = 2500 USDC per ETH");
          console.log("   This means 1 ETH = 2500 USDC ✓");
          
          console.log("\n✨ Processed Chart Data:");
          console.log("Total points:", points.length);
          console.log("First 5 points:", points.slice(0, 5));
          console.log("Last 5 points:", points.slice(-5));
          console.log("Value range:", {
            min: Math.min(...points.map(p => p.value)),
            max: Math.max(...points.map(p => p.value)),
            average: points.reduce((sum, p) => sum + p.value, 0) / points.length
          });
          
          // Apply bucketing for 1D charts (5-minute bars)
          let finalPoints = points;
          if (chartTimeRange === "1D") {
            console.log("\n📊 Applying 5-minute bucketing for 1D chart...");
            finalPoints = bucketDataInto5MinBars(points);
            console.log("✅ Bucketing complete:");
            console.log("  Original points:", points.length);
            console.log("  Bucketed points:", finalPoints.length);
            console.log("  Reduction:", ((1 - finalPoints.length / points.length) * 100).toFixed(1) + "%");
          }
          
          setChartData(finalPoints);
          setIsLoadingChartData(false);
          console.log("✅ Chart data set successfully!");
        } else {
          console.log("❌ API response invalid, using synthetic data");
          console.log("Reason: Missing or empty prices array");
          generateSyntheticData();
        }
      } catch (error) {
        console.error("❌ Failed to fetch real price data:", error);
        console.log("⚠️  Falling back to synthetic data");
        try {
          generateSyntheticData();
        } catch (fallbackError) {
          console.error("❌ Failed to generate synthetic data:", fallbackError);
          setIsLoadingChartData(false);
        }
      }
    };
    
    const generateSyntheticData = () => {
      const symbolA = tokenA.symbol.toUpperCase();
      const symbolB = tokenB.symbol.toUpperCase();
      console.log("\n🎲 Generating synthetic data...");
      const now = Math.floor(Date.now() / 1000);
      const points = Array.from({ length: 180 }, (_, index) => {
        const time = (now - (179 - index) * 300) as UTCTimestamp;
        const base = 1.05 + index * 0.0015;
        const wave = Math.sin(index / 12) * 0.03;
        const modulation = Math.cos(index / 24) * 0.015;
        const value = Number((base + wave + modulation).toFixed(4));
        return { time, value };
      });
      console.log("✨ Synthetic data generated:", {
        total_points: points.length,
        time_range: {
          start: new Date(points[0].time * 1000).toISOString(),
          end: new Date(points[points.length - 1].time * 1000).toISOString()
        },
        value_range: {
          min: Math.min(...points.map(p => p.value)),
          max: Math.max(...points.map(p => p.value))
        },
        first_3_points: points.slice(0, 3),
        last_3_points: points.slice(-3)
      });
      
      // Apply bucketing for 1D charts (5-minute bars)
      let finalPoints = points;
      if (chartTimeRange === "1D") {
        console.log("\n📊 Applying 5-minute bucketing for 1D chart (synthetic data)...");
        finalPoints = bucketDataInto5MinBars(points);
        console.log("✅ Bucketing complete:");
        console.log("  Original points:", points.length);
        console.log("  Bucketed points:", finalPoints.length);
        console.log("  Reduction:", ((1 - finalPoints.length / points.length) * 100).toFixed(1) + "%");
      }
      
      setChartData(finalPoints);
      setIsLoadingChartData(false);
      console.log("✅ Synthetic chart data set!");
    };
    
    fetchRealPriceData();
  }, [tokenA.symbol, tokenB.symbol, chartTimeRange]);

  // Live price updates - USING COINGECKO API for real-time prices
  useEffect(() => {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║  🔴 LIVE PRICE UPDATE EFFECT TRIGGERED                ║");
    console.log("╚════════════════════════════════════════════════════════╝");
    console.log("  isChartOpen:", isChartOpen);
    console.log("  chartData points:", chartDataRef.current.length);
    console.log("  Will start updates:", isChartOpen && hasInitialChartData);
    
    if (!isChartOpen) {
      console.log("❌ Live updates NOT starting - chart closed");
      return;
    }
    
    if (!hasInitialChartData) {
      console.log("⏳ Live updates waiting for initial chart data to load...");
      return;
    }

    const symbolA = tokenA.symbol.toUpperCase();
    const symbolB = tokenB.symbol.toUpperCase();
    
    // Coin mapping for CoinGecko API
    const coins: Record<string, string> = {
      ETH: "ethereum",
      WETH: "ethereum",
      SWETH: "ethereum", // Staked WETH maps to Ethereum
      BTC: "bitcoin",
      WBTC: "wrapped-bitcoin",
      USDC: "usd-coin",
      SUSDC: "usd-coin", // Staked USDC maps to USDC
      DAI: "dai",
      USDT: "tether",
      LINK: "chainlink",
      UNI: "uniswap",
      MKR: "maker",
      AAVE: "aave",
      COMP: "compound-governance-token",
      ARB: "arbitrum",
    };
    
    const coinA = coins[symbolA];
    const coinB = coins[symbolB];
    
    if (!coinA || !coinB) {
      console.log("⚠️  Pair not supported for live updates, skipping");
      console.log("  Symbol A:", symbolA, "→", coinA || "NOT FOUND");
      console.log("  Symbol B:", symbolB, "→", coinB || "NOT FOUND");
      return;
    }

    console.log("✅ Starting REAL-TIME updates from CoinGecko API every 60 seconds!");
    console.log("   Pair:", `${symbolA}/${symbolB}`);
    console.log("   Note: CoinGecko free tier has rate limits (10-50 calls/minute)");
    console.log("   Using 60s interval + 60s cache to stay within limits");

    let updateCounter = 0;

    const fetchLatestPrice = async () => {
      console.log(`\n🚀 === REAL-TIME PRICE UPDATE #${updateCounter + 1} ===`);
      
      if (chartDataRef.current.length === 0) {
        console.log("❌ No previous data to update from");
        return;
      }
      
      if (!coinA || !coinB) {
        console.log("❌ Coin mapping not available for live updates");
        return;
      }
      
      try {
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        updateCounter++;
        
        // Fetch current prices from CoinGecko via Next.js API route (avoids CORS and rate limiting)
        // Combine both coins into a single API call for efficiency
        const combinedIds = `${coinA},${coinB}`;
        const url = `/api/coingecko/price?ids=${combinedIds}`;
        
        console.log("🌐 Fetching latest prices from CoinGecko via API proxy...");
        console.log("  Combined URL:", url);
        const fetchStartTime = Date.now();
        
        let response: Response;
        
        try {
          response = await fetch(url);
        } catch (err: any) {
          console.error("❌ Fetch error:", err);
          throw new Error(`Failed to fetch prices: ${err?.message || "Network error"}`);
        }
        
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`✅ Fetch completed in ${fetchDuration}ms`);
        console.log("📡 Response Status:", response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unable to read error");
          
          // Handle rate limit errors gracefully
          if (response.status === 429) {
            console.warn("⚠️ Rate limit exceeded (429). Skipping this update, will retry on next interval.");
            console.log("   The API route will use cached data if available.");
            return; // Skip this update, don't throw error
          }
          
          throw new Error(`API error: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        
        const data = await response.json();
        
        const priceA = data[coinA]?.usd;
        const priceB = data[coinB]?.usd;
        
        if (!priceA || !priceB || priceB === 0) {
          throw new Error("Invalid price data received");
        }
        
        // Calculate cross-rate: TokenA/TokenB = priceA/USD / priceB/USD
        const newValue = Number((priceA / priceB).toFixed(6));
        const lastPoint = chartDataRef.current[chartDataRef.current.length - 1];
        
        // Determine direction
        let direction: "up" | "down" | "same";
        const changePercent = ((newValue - lastPoint.value) / lastPoint.value) * 100;
        
        if (newValue > lastPoint.value) {
          direction = "up";
        } else if (newValue < lastPoint.value) {
          direction = "down";
        } else {
          direction = "same";
        }
        
        console.log("📊 REAL PRICE DATA:");
        console.log("  Update #:", updateCounter);
        console.log("  Pair:", `${symbolA}/${symbolB}`);
        console.log(`  ${symbolA} price: $${priceA.toFixed(6)} USD`);
        console.log(`  ${symbolB} price: $${priceB.toFixed(6)} USD`);
        console.log(`  Exchange rate: ${newValue.toFixed(6)} ${symbolB} per ${symbolA}`);
        console.log("  Previous value:", lastPoint.value);
        console.log("  Change percent:", changePercent >= 0 ? "+" + changePercent.toFixed(4) : changePercent.toFixed(4), "%");
        console.log("  Direction:", direction.toUpperCase());
        console.log("  Expected color:", direction === "up" ? "🟢 GREEN" : direction === "down" ? "🔴 RED" : "🔵 BLUE");
        console.log("  Time:", new Date(now * 1000).toISOString());
        
        // CRITICAL: Calculate time interval based on chartTimeRange
        // Only add new X-axis tick when enough time has passed
        const timeRangeToInterval: Record<string, number> = {
          "1D": 300,      // 5 minutes for 1D
          "1W": 3600,     // 1 hour for 1W
          "1M": 14400,    // 4 hours for 1M
          "3M": 86400,    // 1 day for 3M
          "6M": 259200,   // 3 days for 6M
          "YTD": 259200,  // 3 days
          "1Y": 604800,   // 1 week for 1Y
          "2Y": 1209600,  // 2 weeks for 2Y
          "5Y": 2592000,  // 30 days for 5Y
          "10Y": 2592000, // 30 days for 10Y
          "ALL": 2592000, // 30 days
        };
        const tickInterval = timeRangeToInterval[chartTimeRange] || 300;
        const timeSinceLastTick = now - lastPoint.time;
        const shouldAddNewTick = timeSinceLastTick >= tickInterval;
        
        console.log("⏰ Time-based update logic:");
        console.log("  Time range:", chartTimeRange);
        console.log("  Tick interval:", tickInterval, "seconds");
        console.log("  Time since last tick:", timeSinceLastTick, "seconds");
        console.log("  Should add new tick:", shouldAddNewTick);
        
        // CRITICAL: Use series.update() for smooth updates without chart refresh
        // Only update data array if we're adding a new tick, otherwise just update Y value
        if (chartSeriesRef.current?.series && chartSeriesRef.current?.chart) {
          try {
            const series = chartSeriesRef.current.series;
            const chart = chartSeriesRef.current.chart;
            const timeScale = chart.timeScale();
            const priceScale = chart.priceScale('right');
            
            // Get current visible ranges BEFORE update
            const currentTimeRange = timeScale.getVisibleRange();
            // Calculate current gap BEFORE update to preserve it (including if user dragged to increase it)
            let currentGapBeforeUpdate = 0;
            if (currentTimeRange && typeof currentTimeRange.from === 'number' && typeof currentTimeRange.to === 'number') {
              const lastTimeCoordinate = timeScale.timeToCoordinate(lastPoint.time);
              const containerWidth = chart.options().width;
              if (containerWidth && lastTimeCoordinate !== null) {
                let priceScaleWidth = 60;
                try {
                  const ps = chart.priceScale('right');
                  if (ps && typeof ps.width === 'function') {
                    priceScaleWidth = ps.width() || 60;
                  }
                } catch (e) {}
                const chartPaneWidth = containerWidth - priceScaleWidth;
                currentGapBeforeUpdate = chartPaneWidth - lastTimeCoordinate;
              }
            }
            // Get current visible price range if user has manually zoomed (autoScale is false)
            const currentPriceRange = priceScale ? (() => {
              try {
                const options = priceScale.options();
                if (options && options.autoScale === false) {
                  // User has manually adjusted - get visible range from series
                  const visibleRange = series.priceScale().getVisibleRange();
                  if (visibleRange && typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number') {
                    return { from: visibleRange.from, to: visibleRange.to };
                  }
                }
              } catch (e) {}
              return null;
            })() : null;
            
            // CRITICAL: Disable auto-scale BEFORE update if user has manually zoomed
            // This prevents series.update() from resetting the zoom
            if (currentPriceRange && priceScale) {
              priceScale.applyOptions({ autoScale: false });
            }
            
            if (shouldAddNewTick) {
              // Add new point with new time tick
              console.log("  ✅ Adding new time tick - X-axis will move");
              const newPoint = { time: now, value: newValue };
              series.update(newPoint);
              
              // CRITICAL: Update position cache immediately after series.update()
              // This ensures dots, ripple, and caret update synchronously
              if (chartSeriesRef.current?.updatePositions) {
                chartSeriesRef.current.updatePositions();
              }
              
              // Update data array
              setChartData(prev => {
                const next = [...prev, newPoint];
                chartDataRef.current = next;
                return next;
              });
              
              // CRITICAL: Preserve the gap that existed before update (including if user dragged to increase it)
              // Always preserve the gap, whether it's the initial gap or a larger gap from dragging
              requestAnimationFrame(() => {
                // Check current gap after update
                const lastTimeCoordinate = timeScale.timeToCoordinate(now);
                const containerWidth = chart.options().width;
                if (containerWidth && lastTimeCoordinate !== null) {
                  let priceScaleWidth = 60;
                  try {
                    const ps = chart.priceScale('right');
                    if (ps && typeof ps.width === 'function') {
                      priceScaleWidth = ps.width() || 60;
                    }
                  } catch (e) {}
                  const chartPaneWidth = containerWidth - priceScaleWidth;
                  const currentGapAfterUpdate = chartPaneWidth - lastTimeCoordinate;
                  
                  // Calculate how much to scroll to restore the gap that existed before update
                  // This preserves both the initial gap and any gap increase from dragging
                  const gapDifference = currentGapBeforeUpdate - currentGapAfterUpdate;
                  if (Math.abs(gapDifference) > 1) { // Only restore if gap changed significantly
                    // Use scrollToPosition to pan (preserves zoom) instead of setVisibleRange (which scales)
                    // Negative value scrolls left, which increases gap
                    timeScale.scrollToPosition(-gapDifference, false);
                  }
                }
              });
            } else {
              // Update only Y value of last point (no X-axis movement)
              console.log("  ✅ Updating Y value only - X-axis stays still");
              const updatedPoint = { time: lastPoint.time, value: newValue };
              series.update(updatedPoint);
              
              // CRITICAL: Update position cache immediately after series.update()
              // This ensures dots, ripple, and caret update synchronously
              if (chartSeriesRef.current?.updatePositions) {
                chartSeriesRef.current.updatePositions();
              }
              
              // Update data array (replace last point)
              setChartData(prev => {
                const next = [...prev];
                next[next.length - 1] = updatedPoint;
                chartDataRef.current = next;
                return next;
              });
            }
            
            // CRITICAL: Preserve vertical zoom (price scale) if user has manually zoomed
            // Restore the visible price range after update to maintain user's zoom level
            if (currentPriceRange && priceScale) {
              // Use multiple attempts with delays to ensure the range is restored
              // The chart library might reset it during series.update()
              const restorePriceRange = () => {
                try {
                  // Restore the exact price range the user had zoomed to
                  series.priceScale().setVisibleRange(currentPriceRange);
                  // Ensure autoScale stays false to preserve manual zoom
                  priceScale.applyOptions({ autoScale: false });
                } catch (e) {
                  console.error("  ❌ Error restoring price range:", e);
                }
              };
              
              // Immediate restore
              restorePriceRange();
              
              // Also restore after chart has processed the update
              requestAnimationFrame(() => {
                restorePriceRange();
                // One more attempt after a short delay
                setTimeout(() => {
                  restorePriceRange();
                }, 10);
              });
            } else {
              // CRITICAL: Smart rescaling - only rescale if price goes outside bounds
              // Top bound: 0.07 (7%), Bottom bound: 0.175 (17.5%)
              // Only do this if user hasn't manually zoomed (autoScale is true)
              requestAnimationFrame(() => {
                if (priceScale) {
                  try {
                    const coordinate = series.priceToCoordinate(newValue);
                    const chartHeight = chart.options().height;
                    if (coordinate !== null && chartHeight) {
                      const topBound = chartHeight * 0.07;
                      const bottomBound = chartHeight * 0.175;
                      const distanceFromTop = coordinate;
                      const distanceFromBottom = chartHeight - coordinate;
                      
                      const needsRescale = distanceFromTop < topBound || distanceFromBottom < bottomBound;
                      
                      if (needsRescale) {
                        console.log("  ⚠️ Price outside bounds - rescaling");
                        console.log("    Distance from top:", distanceFromTop, "px (bound:", topBound, "px)");
                        console.log("    Distance from bottom:", distanceFromBottom, "px (bound:", bottomBound, "px)");
                        priceScale.applyOptions({ autoScale: true });
                      }
                    }
                  } catch (e) {
                    console.error("  ❌ Error checking price bounds:", e);
                  }
                }
              });
            }
            
            console.log("  ✅ Point updated smoothly via series.update()!");
          } catch (error) {
            console.error("  ❌ Error updating series:", error);
            // Fallback to setChartData if update fails
            const newPoint = { time: now, value: newValue };
            setChartData(prev => {
              const next = [...prev, newPoint];
              chartDataRef.current = next;
              return next;
            });
          }
        } else {
          console.log("  ⚠️ Series ref not ready, using setChartData (will refresh chart)");
          const newPoint = { time: now, value: newValue };
          setChartData(prev => {
            const next = [...prev, newPoint];
            chartDataRef.current = next;
            return next;
          });
        }
        
        // Update counters
        const currentTime = new Date();
        setLastUpdateTime(currentTime.toLocaleTimeString());
        setUpdateCount(prev => prev + 1);
        
        // Trigger pulse animation
        const colorToUse = direction === "up" ? "#10b981" : direction === "down" ? "#ef4444" : "#3b82f6";
        const colorName = direction === "up" ? "GREEN" : direction === "down" ? "RED" : "BLUE";
        
        console.log("🎯 Triggering pulse animation:");
        console.log("  Direction:", direction.toUpperCase());
        console.log("  Color:", colorName, "→", colorToUse);
        console.log("  Time:", currentTime.toLocaleTimeString());
        
        // Update permanent dot color
        setPermanentDotColor(colorToUse);
        setLatestPriceChange(direction);
        setShowPulse(true);
        setPulseKey(prev => prev + 1);
        
        // Hide ripple after animation (but keep the center dot)
        setTimeout(() => {
          console.log("🎯 Hiding ripples (keeping permanent dot)");
          setShowPulse(false);
          setLatestPriceChange(null);
        }, 2500);
        
        console.log("🏁 === REAL-TIME UPDATE COMPLETED ===\n");
      } catch (error) {
        console.error("❌ Failed to fetch latest price:", error);
        console.log("  Will retry on next interval");
      }
    };

    // Fetch first update immediately
    console.log("⏰ Fetching first real-time update IMMEDIATELY");
    fetchLatestPrice();

    // Then fetch every 15 seconds
    // The API route has a 60-second cache, but we poll more frequently for better UX
    console.log("⏰ Setting up interval to fetch real prices every 15 seconds");
    let callCount = 0;
    const interval = setInterval(() => {
      callCount++;
      console.log(`\n⏰⏰⏰ INTERVAL FIRED - Call #${callCount} at ${new Date().toLocaleTimeString()}`);
      fetchLatestPrice();
    }, 15000); // 15 seconds

    return () => {
      console.log("🛑 Cleaning up interval - effect is re-running");
      clearInterval(interval);
    };
  }, [isChartOpen, hasInitialChartData, tokenA.symbol, tokenB.symbol]);

  const chartPairLabel = useMemo(() => `${tokenA.symbol} / ${tokenB.symbol}`, [tokenA.symbol, tokenB.symbol]);

  // Debug: Monitor pulse state changes
  useEffect(() => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💥 PULSE STATE CHANGED:");
    console.log("  showPulse:", showPulse);
    console.log("  latestPriceChange:", latestPriceChange);
    console.log("  Should render pulse:", showPulse && latestPriceChange);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }, [showPulse, latestPriceChange]);

  // Cool loading animation component
  const LoadingAnimation = () => (
    <div className="flex items-center justify-center gap-2">
      <div 
        className="h-8 w-1 rounded-full bg-gradient-to-t from-blue-500/40 to-blue-400"
        style={{ animation: "loadingPulse 1.2s ease-in-out infinite" }}
      />
      <div 
        className="h-10 w-1 rounded-full bg-gradient-to-t from-purple-500/40 to-purple-400"
        style={{ animation: "loadingPulse 1.2s ease-in-out 0.15s infinite" }}
      />
      <div 
        className="h-12 w-1 rounded-full bg-gradient-to-t from-pink-500/40 to-pink-400"
        style={{ animation: "loadingPulse 1.2s ease-in-out 0.3s infinite" }}
      />
      <div 
        className="h-10 w-1 rounded-full bg-gradient-to-t from-cyan-500/40 to-cyan-400"
        style={{ animation: "loadingPulse 1.2s ease-in-out 0.45s infinite" }}
      />
      <div 
        className="h-8 w-1 rounded-full bg-gradient-to-t from-indigo-500/40 to-indigo-400"
        style={{ animation: "loadingPulse 1.2s ease-in-out 0.6s infinite" }}
      />
    </div>
  );

  // TradingView-style pulse indicator at last data point
  const PulsingPriceIndicator = ({ direction }: { direction: "up" | "down" | "same" }) => {
    // GREEN for up, RED for down, BLUE for same
    const color = direction === "up" ? "#10b981" : direction === "down" ? "#ef4444" : "#3b82f6";
    const colorName = direction === "up" ? "GREEN" : direction === "down" ? "RED" : "BLUE";
    
    console.log("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
    console.log("┃  🎨 PULSE INDICATOR RENDERING ON SCREEN           ┃");
    console.log("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛");
    console.log("  Direction:", direction);
    console.log("  Color:", colorName, "(", color, ")");
    console.log("  up=GREEN, down=RED, same=BLUE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    return (
      <div 
        className="absolute pointer-events-none"
        style={{
          // Position at last data point (right edge of chart data)
          right: "80px", // Account for price scale width
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 9999,
        }}
      >
        {/* First ripple wave */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: color,
            animation: "tradingViewRipple 2s ease-out forwards",
          }}
        />
        {/* Second ripple wave */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: color,
            animation: "tradingViewRipple 2s ease-out 0.5s forwards",
          }}
        />
        {/* Third ripple wave */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: color,
            animation: "tradingViewRipple 2s ease-out 1s forwards",
          }}
        />
        {/* Center dot that stays */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}, 0 0 20px ${color}60`,
          }}
        />
      </div>
    );
  };

  // Debug: Monitor chart data changes
  useEffect(() => {
    console.log("\n📊 Chart Data State Changed:");
    console.log("  Data points:", chartData.length);
    if (chartData.length > 0) {
      console.log("  First point:", chartData[0]);
      console.log("  Last point:", chartData[chartData.length - 1]);
      console.log("  Time range:", {
        start: new Date(chartData[0].time * 1000).toISOString(),
        end: new Date(chartData[chartData.length - 1].time * 1000).toISOString()
      });
    } else {
      console.log("  ⚠️ Chart data is EMPTY!");
    }
  }, [chartData]);

  // Simple test card component - exact same as Analytics page, positioned next to swap card
  function TestScrollCard({ isLimitSelected, onClose, cardRect }: { isLimitSelected: boolean; onClose: () => void; cardRect: DOMRect | null }) {
    const testItems = Array.from({ length: 50 }, (_, i) => `Test Item ${i + 1} - This is a scrollable item for testing purposes`);

    if (!isLimitSelected || !cardRect) {
      return null;
    }

    return (
      <div 
        className="fixed"
        style={{ 
          zIndex: 99999,
          top: `${cardRect.top}px`,
          left: `${cardRect.right + 20}px`,
        }}
      >
        <div 
          className="bg-gray-900 border border-white/20 rounded-lg shadow-2xl" 
          style={{ 
            width: "400px", 
            height: "600px", 
            display: "flex", 
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Test Scroll Card</h2>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content */}
          <div 
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "16px",
              minHeight: 0,
            }}
          >
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {testItems.map((item, index) => (
                <li 
                  key={index}
                  style={{
                    padding: "12px",
                    marginBottom: "8px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  function TokenSelector({ selected, tokens, onSelect, side = "left", cardRect, swapTitleRect, swapCardRect }: { selected: Token; tokens: Token[]; onSelect: (t: Token) => void; side?: "left" | "right"; cardRect: DOMRect | null; swapTitleRect?: DOMRect | null; swapCardRect?: DOMRect | null }) {
    type PointerTracker = {
      pointerId: number;
      x: number;
      y: number;
      time: number;
      moved: boolean;
      endedAt?: number;
    };

    const POINTER_MOVE_THRESHOLD = 6;
    const LONG_PRESS_THRESHOLD = 220;
    const [isDesktop, setIsDesktop] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // TEMPORARY: Wrap setters to prevent closing during scroll testing
    const setIsOpenSafe = (value: boolean) => {
      if (value === false) {
        console.log("🚫 BLOCKED setIsOpen(false) - card should stay open for testing");
        console.trace("Call stack:");
        return;
      }
      console.log("✅ setIsOpen(true) allowed");
      setIsOpen(value);
    };
    
    const setShouldRenderSafe = (value: boolean) => {
      if (value === false) {
        console.log("🚫 BLOCKED setShouldRender(false) - card should stay rendered for testing");
        console.trace("Call stack:");
        return;
      }
      console.log("✅ setShouldRender(true) allowed");
      setShouldRender(value);
    };
    const dropdownRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);
    const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const buttonPointerDownRef = useRef<PointerTracker | null>(null);
    const tokenPointerDownRef = useRef<PointerTracker | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingSelector, setIsResizingSelector] = useState(false);
  const [resizeEdgeSelector, setResizeEdgeSelector] = useState<string | null>(null);
  const [selectorOffset, setSelectorOffset] = useState({ x: 0, y: 0 });
  const [selectorSize, setSelectorSize] = useState({ width: 360, height: 0 }); // Will match swap card height
    const dragLastRef = useRef<{ x: number; y: number } | null>(null);
    const resizeSelectorStartRef = useRef<{ x: number; y: number; width: number; height: number; offsetX: number; offsetY: number } | null>(null);

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
      const check = () => {
        setIsDesktop(window.innerWidth >= 1024);
        setIsMobile(window.innerWidth < 768);
      };
      check();
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }, []);


    const animateDuration = 260;
    const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
    
    // DEBUG: Log state changes
    useEffect(() => {
      console.log("🔍 TokenSelector state changed:", { isOpen, shouldRender, phase });
    }, [isOpen, shouldRender, phase]);
    
    // TEMPORARY: Wrap setPhase to prevent closing during scroll testing
    const setPhaseSafe = (value: "closed" | "opening" | "open" | "closing") => {
      if (value === "closing") {
        console.log("🚫 BLOCKED setPhase('closing') - card should stay open for testing");
        console.trace("Call stack:");
        return;
      }
      if (value === "closed" && phase === "open") {
        console.log("🚫 BLOCKED setPhase('closed') while card is open - card should stay open for testing");
        console.trace("Call stack:");
        return;
      }
      console.log(`✅ setPhase('${value}') allowed`);
      setPhase(value);
    };

    const filteredTokens = useMemo(() => {
      const query = searchTerm.trim().toLowerCase();
      if (!query) return tokens;
      return tokens.filter((t) =>
        t.symbol.toLowerCase().includes(query) || t.name.toLowerCase().includes(query)
      );
    }, [tokens, searchTerm]);

    const tokensToDisplay = filteredTokens.length ? filteredTokens : tokens;

    const openDropdown = () => {
      setSearchTerm("");
      setShouldRenderSafe(true);
      setPhaseSafe("closed");
      setSelectorOffset({ x: 0, y: 0 });
      // Set height to 70vh for both cards
      const viewportHeight = window.innerHeight;
      const height70vh = viewportHeight * 0.7;
      setSelectorSize({ width: 360, height: height70vh });
      console.log("🪙 Token selector height set to 70vh:", height70vh);
      requestAnimationFrame(() => {
        setPhaseSafe("opening");
        setIsOpenSafe(true);
        // After card opening animation completes (0.52s), set phase to "open" to show glow
        setTimeout(() => {
          setPhaseSafe("open");
        }, 520);
      });
    };

    const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragLastRef.current = { x: event.clientX, y: event.clientY };
      setIsDragging(true);
    };

    const handleResizeSelectorStart = (edge: string, event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      
      resizeSelectorStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        width: selectorSize.width,
        height: selectorSize.height,
        offsetX: selectorOffset.x,
        offsetY: selectorOffset.y,
      };
      
      setResizeEdgeSelector(edge);
      setIsResizingSelector(true);
    };

    useEffect(() => {
      if (!isDragging && !isResizingSelector) return;

      const handleMove = (event: PointerEvent) => {
        if (isDragging && dragLastRef.current) {
          const deltaX = event.clientX - dragLastRef.current.x;
          const deltaY = event.clientY - dragLastRef.current.y;
          dragLastRef.current = { x: event.clientX, y: event.clientY };
          setSelectorOffset(prev => ({
            x: prev.x + deltaX,
            y: prev.y + deltaY,
          }));
        } else if (isResizingSelector && resizeSelectorStartRef.current && resizeEdgeSelector) {
          const deltaX = event.clientX - resizeSelectorStartRef.current.x;
          const deltaY = event.clientY - resizeSelectorStartRef.current.y;
          
          let newWidth = resizeSelectorStartRef.current.width;
          let newHeight = resizeSelectorStartRef.current.height;
          
          if (resizeEdgeSelector.includes('right')) {
            newWidth = Math.max(300, Math.min(window.innerWidth - 100, resizeSelectorStartRef.current.width + deltaX));
          }
          if (resizeEdgeSelector.includes('left')) {
            newWidth = Math.max(300, Math.min(window.innerWidth - 100, resizeSelectorStartRef.current.width - deltaX));
          }
          if (resizeEdgeSelector.includes('bottom')) {
            newHeight = Math.max(400, Math.min(window.innerHeight - 100, resizeSelectorStartRef.current.height + deltaY));
          }
          if (resizeEdgeSelector.includes('top')) {
            newHeight = Math.max(400, Math.min(window.innerHeight - 100, resizeSelectorStartRef.current.height - deltaY));
          }
          
          setSelectorSize({ width: newWidth, height: newHeight });
          
          let newOffsetX = resizeSelectorStartRef.current.offsetX;
          let newOffsetY = resizeSelectorStartRef.current.offsetY;
          
          if (resizeEdgeSelector.includes('left')) {
            const widthChange = newWidth - resizeSelectorStartRef.current.width;
            newOffsetX = resizeSelectorStartRef.current.offsetX - (widthChange / 2);
          } else if (resizeEdgeSelector.includes('right')) {
            const widthChange = newWidth - resizeSelectorStartRef.current.width;
            newOffsetX = resizeSelectorStartRef.current.offsetX + (widthChange / 2);
          }
          
          if (resizeEdgeSelector.includes('top')) {
            const heightChange = newHeight - resizeSelectorStartRef.current.height;
            newOffsetY = resizeSelectorStartRef.current.offsetY - (heightChange / 2);
          } else if (resizeEdgeSelector.includes('bottom')) {
            const heightChange = newHeight - resizeSelectorStartRef.current.height;
            newOffsetY = resizeSelectorStartRef.current.offsetY + (heightChange / 2);
          }
          
          setSelectorOffset({ x: newOffsetX, y: newOffsetY });
        }
      };

      const handleUp = () => {
        if (isDragging) {
          dragLastRef.current = null;
          setIsDragging(false);
        } else if (isResizingSelector) {
          setIsResizingSelector(false);
          setResizeEdgeSelector(null);
          resizeSelectorStartRef.current = null;
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);

      return () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
      };
    }, [isDragging, isResizingSelector, resizeEdgeSelector]);

    const closeDropdown = () => {
      // TEMPORARILY DISABLED FOR SCROLL TESTING - card will not close
      console.log("🔒 closeDropdown called but disabled for testing");
      console.trace("Call stack:");
      return;
      
      /* DISABLED CODE - Re-enable after scroll testing
      // Don't close if we're currently scrolling
      if (isScrollingRef.current) {
        return;
      }
      
      // Clear any pending scroll timeouts
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      
      setPhase("closing");
      setIsOpenSafe(false);
      setTimeout(() => {
        setShouldRenderSafe(false);
        setPhase("closed");
        setSearchTerm("");
        // Reset scroll tracking
        isScrollingRef.current = false;
        scrollPositionRef.current = null;
      }, animateDuration);
      */
    };

    // Prevent body scroll when card is open and listen for scroll events
    useEffect(() => {
      if (isOpen && isDesktop) {
        // Save current scroll position
        const scrollY = window.scrollY;
        // Prevent scrolling
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        
        // Listen for scroll events anywhere to mark scrolling state
        const handleScroll = (e: Event) => {
          // IMPORTANT: If scroll is happening inside the dropdown card, allow it and don't mark as scrolling
          if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
            console.log("🔒 Scroll event INSIDE card - allowing scroll, NOT marking as scrolling");
            // Don't mark as scrolling - let the card's internal scroll work
            return;
          }
          // Only mark as scrolling if it's OUTSIDE the dropdown card
          console.log("🔒 Scroll event OUTSIDE card - marking as scrolling");
          isScrollingRef.current = true;
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            isScrollingRef.current = false;
          }, 300);
        };
        
        // Listen for wheel events (scroll) anywhere
        const handleWheel = (e: WheelEvent) => {
          // IMPORTANT: If scroll is happening inside the dropdown card, allow it and don't mark as scrolling
          // This prevents the card from closing when scrolling inside it
          if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
            console.log("🔒 Wheel event INSIDE card - allowing scroll, NOT marking as scrolling");
            // Don't mark as scrolling - let the card's internal scroll work
            return;
          }
          // Only mark as scrolling if it's OUTSIDE the dropdown card
          console.log("🔒 Wheel event OUTSIDE card - marking as scrolling");
          isScrollingRef.current = true;
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            isScrollingRef.current = false;
          }, 300);
        };
        
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('wheel', handleWheel, true);
        
        return () => {
          // Restore scrolling
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          document.body.style.overflow = '';
          // Restore scroll position
          window.scrollTo(0, scrollY);
          // Remove scroll listeners
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('wheel', handleWheel, true);
        };
      }
    }, [isOpen, isDesktop]);


    const markScrolling = useCallback((delay = 250) => {
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        scrollPositionRef.current = null;
      }, delay);
    }, []);

    useEffect(() => {
      if (typeof window === "undefined") {
        return;
      }

      const maybeUpdateTracker = (trackerRef: MutableRefObject<PointerTracker | null>, event: PointerEvent) => {
        const tracker = trackerRef.current;
        if (!tracker || tracker.pointerId !== event.pointerId || tracker.moved) {
          return;
        }

        const deltaX = Math.abs(event.clientX - tracker.x);
        const deltaY = Math.abs(event.clientY - tracker.y);
        if (deltaX > POINTER_MOVE_THRESHOLD || deltaY > POINTER_MOVE_THRESHOLD) {
          tracker.moved = true;
          markScrolling();
        }
      };

      const handlePointerMove = (event: PointerEvent) => {
        maybeUpdateTracker(buttonPointerDownRef, event);
        maybeUpdateTracker(tokenPointerDownRef, event);
      };

      const handlePointerUp = (event: PointerEvent) => {
        if (buttonPointerDownRef.current?.pointerId === event.pointerId) {
          buttonPointerDownRef.current.endedAt = Date.now();
        }
        if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
          tokenPointerDownRef.current.endedAt = Date.now();
        }
      };

      const handlePointerCancel = (event: PointerEvent) => {
        if (buttonPointerDownRef.current?.pointerId === event.pointerId) {
          buttonPointerDownRef.current = null;
        }
        if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
          tokenPointerDownRef.current = null;
        }
      };

      window.addEventListener("pointermove", handlePointerMove, true);
      window.addEventListener("pointerup", handlePointerUp, true);
      window.addEventListener("pointercancel", handlePointerCancel, true);

      return () => {
        window.removeEventListener("pointermove", handlePointerMove, true);
        window.removeEventListener("pointerup", handlePointerUp, true);
        window.removeEventListener("pointercancel", handlePointerCancel, true);
      };
    }, [markScrolling]);

    const renderList = (tokenSet: Token[]) => (
      <div className="relative w-full h-full" style={{ minHeight: 0 }}>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
          <span
            className={`h-0.5 rounded-full bg-white/40 transition-all duration-[${animateDuration}ms] ease-out ${
              phase === "opening" || phase === "open"
                ? "w-24 opacity-0"
                : "w-0 opacity-100"
            }`}
          />
          <span
            className={`h-2 w-2 rounded-full bg-white transition-transform duration-[${animateDuration}ms] ease-out ${
              phase === "opening" || phase === "open"
                ? "scale-0"
                : "scale-100"
            }`}
          />
          <span
            className={`h-0.5 rounded-full bg-white/40 transition-all duration-[${animateDuration}ms] ease-out ${
              phase === "opening" || phase === "open"
                ? "w-24 opacity-0"
                : "w-0 opacity-100"
            }`}
          />
        </div>
        <div
          className={`relative origin-center transition-all duration-[${animateDuration}ms] ease-out w-full h-full ${
            phase === "opening" || phase === "open"
              ? "scale-y-100 opacity-100"
              : "scale-y-0 opacity-0"
          }`}
          style={{ minHeight: 0 }}
        >
          <ul 
            className="w-full h-full overflow-y-auto"
            style={{ 
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maxHeight: "100%"
            }}
            onWheel={(e) => {
              markScrolling();
              e.stopPropagation();
            }}
            onScroll={(e) => {
              markScrolling();
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              markScrolling();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
          >
            {tokenSet.length ? (
              tokenSet.map((t) => (
                <li key={t.address}>
                  <button
                    type="button"
                    onClick={(event) => {
                      // TEMPORARILY DISABLED FOR SCROLL TESTING
                      console.log("🔒 Token button onClick called but disabled for testing");
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                      
                      /* DISABLED CODE - Re-enable after scroll testing
                      if (isScrollingRef.current) {
                        event.preventDefault();
                        event.stopPropagation();
                        tokenPointerDownRef.current = null;
                        return;
                      }

                      const pointerInfo = tokenPointerDownRef.current;
                      if (pointerInfo) {
                        if (pointerInfo.moved) {
                          tokenPointerDownRef.current = null;
                          event.preventDefault();
                          event.stopPropagation();
                          return;
                        }

                        const duration = (pointerInfo.endedAt ?? Date.now()) - pointerInfo.time;
                        if (duration > LONG_PRESS_THRESHOLD) {
                          tokenPointerDownRef.current = null;
                          event.preventDefault();
                          event.stopPropagation();
                          return;
                        }
                      }

                      tokenPointerDownRef.current = null;

                      onSelect(t);
                      closeDropdown();
                      */
                    }}
                    onPointerDown={(event) => {
                      tokenPointerDownRef.current = {
                        pointerId: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        time: Date.now(),
                        moved: false,
                      };
                      event.stopPropagation();
                    }}
                    onPointerMove={(event) => {
                      event.stopPropagation();
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                    }}
                    onPointerCancel={(event) => {
                      if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
                        tokenPointerDownRef.current = null;
                      }
                      event.stopPropagation();
                    }}
                    onWheel={(e) => {
                      markScrolling();
                      e.stopPropagation();
                    }}
                    className={`flex w-full items-center gap-3 rounded-full border border-transparent px-3 md:px-3 py-2 md:py-2 text-left transition-all touch-manipulation min-h-[48px] md:min-h-0 ${
                      selected.address === t.address
                        ? "bg-white/10 hover:border-white/30"
                        : "hover:border-white/30 hover:bg-white/5"
                    }`}
                    style={{ minHeight: "48px" }}
                  >
                    {t.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.icon}
                        alt={t.symbol}
                        className="h-6 w-6 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
                        }}
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-white/20 ring-1 ring-white/15" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm text-white">{t.symbol}</div>
                      <div className="text-xs text-white/50">{t.name}</div>
                    </div>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-center text-xs text-white/40">No tokens found</li>
            )}
          </ul>
        </div>
      </div>
    );

    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            
            if (isScrollingRef.current) {
              e.preventDefault();
              return;
            }
            
            const pointerInfo = buttonPointerDownRef.current;
            if (pointerInfo) {
              if (pointerInfo.moved) {
                buttonPointerDownRef.current = null;
                e.preventDefault();
                return;
              }
              const duration = (pointerInfo.endedAt ?? Date.now()) - pointerInfo.time;
              if (duration > LONG_PRESS_THRESHOLD) {
                buttonPointerDownRef.current = null;
                e.preventDefault();
                return;
              }
            }
            
            buttonPointerDownRef.current = null;
            
            if (!isOpen) {
              openDropdown();
            }
          }}
          onPointerDown={(e) => {
            buttonPointerDownRef.current = {
              pointerId: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              time: Date.now(),
              moved: false,
            };
            e.stopPropagation();
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
          onPointerCancel={(e) => {
            if (buttonPointerDownRef.current?.pointerId === e.pointerId) {
              buttonPointerDownRef.current = null;
            }
            e.stopPropagation();
          }}
          onWheel={(e) => {
            markScrolling();
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            markScrolling();
            if (buttonPointerDownRef.current) {
              buttonPointerDownRef.current.moved = true;
            }
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
          }}
          className="flex items-center gap-2 rounded-full bg-white/10 pl-3 md:pl-4 pr-2 md:pr-3 py-2 md:py-2 text-sm md:text-sm text-white hover:bg-white/15 w-fit touch-manipulation min-h-[48px] md:min-h-0"
          style={{ minHeight: "48px" }}
        >
          {selected.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.icon}
              alt={selected.symbol}
              className="h-5 w-5 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
              }}
            />
          ) : (
            <div className="h-5 w-5 rounded-full bg-white/20 ring-1 ring-white/15" />
          )}
          <span className="font-medium">{selected.symbol}</span>
          <div className="flex-shrink-0">
            <svg className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {shouldRender && isDesktop && swapTitleRect && cardRect
          ? createPortal(
              <div
                className="fixed z-[9999] pointer-events-none"
                style={{
                  top: swapTitleRect.top,
                  left: side === "left" 
                    ? Math.max(16, cardRect.left - 65 - selectorSize.width)
                    : Math.min(window.innerWidth - 16 - selectorSize.width, cardRect.right + 65),
                  transform: `translate(0, 0) translate(${selectorOffset.x}px, ${selectorOffset.y}px)`,
                  height: "70vh",
                }}
              >
                {/* Token selector card - no glow effect */}
                <div
                  ref={dropdownRef}
                  className={`pointer-events-auto relative overflow-hidden rounded-[20px] border border-white/15 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)] transition-all flex flex-col ${
                    isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                  style={{
                    width: `${selectorSize.width}px`,
                    height: "70vh",
                    maxHeight: "70vh",
                    backgroundColor: "rgba(12, 14, 22, 0.3)",
                    backdropFilter: "blur(40px) saturate(180%)",
                    WebkitBackdropFilter: "blur(40px) saturate(180%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                    transition: isResizingSelector ? "none" : "opacity 0.3s ease",
                    animation: phase === "opening" ? "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards" : phase === "closing" ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
                    zIndex: 0,
                    position: "relative",
                  }}
                  onWheel={(e) => {
                    // Check if scroll is happening inside the scrollable area
                    const scrollableArea = e.currentTarget.querySelector('.overflow-y-auto') as HTMLElement;
                    if (scrollableArea && scrollableArea.contains(e.target as Node)) {
                      // Scroll is happening inside the scrollable area
                      // IMPORTANT: DON'T stop propagation - let the scrollable area handle the scroll!
                      console.log("🔒 Card onWheel - scroll INSIDE scrollable area, allowing scroll to work");
                      // Just mark as scrolling but don't prevent the scroll
                      isScrollingRef.current = true;
                      
                      // Clear any existing timeout
                      if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                      }
                      
                      // Reset scrolling flag after scroll ends
                      scrollTimeoutRef.current = setTimeout(() => {
                        isScrollingRef.current = false;
                      }, 500);
                      // DON'T call e.stopPropagation() - let the event reach the scrollable div!
                      return;
                    }
                    // If scroll is NOT in scrollable area, stop it
                    console.log("🔒 Card onWheel - scroll OUTSIDE scrollable area, preventing");
                    e.stopPropagation();
                  }}
                  onTouchMove={(e) => {
                    // Mark scrolling for touch moves
                    console.log("🔒 Card onTouchMove - marking as scrolling");
                    isScrollingRef.current = true;
                    e.preventDefault(); // Prevent default touch behavior
                    e.stopPropagation();
                    
                    // Clear any existing timeout
                    if (scrollTimeoutRef.current) {
                      clearTimeout(scrollTimeoutRef.current);
                    }
                    
                    // Reset scrolling flag after touch ends - INCREASED DELAY to prevent click conversion
                    scrollTimeoutRef.current = setTimeout(() => {
                      console.log("🔒 Resetting isScrollingRef to false after touch move");
                      isScrollingRef.current = false;
                    }, 500); // Increased from 150ms to 500ms
                  }}
                  onScroll={(e) => {
                    // Mark scrolling
                    isScrollingRef.current = true;
                    e.stopPropagation();
                    
                    // Clear any existing timeout
                    if (scrollTimeoutRef.current) {
                      clearTimeout(scrollTimeoutRef.current);
                    }
                    
                    // Reset scrolling flag after scroll ends
                    scrollTimeoutRef.current = setTimeout(() => {
                      isScrollingRef.current = false;
                    }, 150);
                  }}
                  onTouchStart={(e) => {
                    // Mark scrolling on touch start
                    console.log("🔒 Card onTouchStart - marking as scrolling");
                    isScrollingRef.current = true;
                    e.preventDefault(); // Prevent default touch behavior
                    e.stopPropagation();
                    
                    // Clear any existing timeout
                    if (scrollTimeoutRef.current) {
                      clearTimeout(scrollTimeoutRef.current);
                    }
                  }}
                  onTouchEnd={(e) => {
                    // Reset scrolling flag after touch ends - INCREASED DELAY to prevent click conversion
                    console.log("🔒 Card onTouchEnd - keeping isScrollingRef true for longer");
                    e.preventDefault(); // Prevent default touch behavior
                    e.stopPropagation();
                    if (scrollTimeoutRef.current) {
                      clearTimeout(scrollTimeoutRef.current);
                    }
                    // Increase timeout to 500ms to prevent touch-to-click conversion
                    scrollTimeoutRef.current = setTimeout(() => {
                      console.log("🔒 Resetting isScrollingRef to false after touch end");
                      isScrollingRef.current = false;
                    }, 500); // Increased from 150ms to 500ms
                  }}
                  onMouseDown={(e) => {
                    // Prevent mouse down during active scrolling
                    if (isScrollingRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    // TEMPORARILY DISABLED FOR SCROLL TESTING
                    console.log("🔒 Card container onClick called - BLOCKED for testing");
                    console.log("  isScrollingRef.current:", isScrollingRef.current);
                    console.trace("Call stack:");
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                    
                    // Prevent clicks during scrolling
                    if (isScrollingRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    // Prevent clicks from bubbling
                    e.stopPropagation();
                  }}
                >
                      {/* Header with drag and buttons - fully transparent for glow */}
                      <div
                        className={`flex h-12 flex-shrink-0 items-center justify-between px-6 relative ${
                          isDragging ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        onPointerDown={handleDragStart}
                      >
                        {/* Transparent overlay to let glow through */}
                        <div 
                          className="absolute inset-0" 
                          style={{ 
                            backgroundColor: "rgba(12, 14, 22, 0)",
                            backdropFilter: "none"
                          }}
                        />
                        {/* Border that respects padding */}
                        <div className="absolute bottom-0 left-6 right-6 h-px bg-white/10" />
                        <span 
                          className="text-sm font-semibold tracking-wide relative z-10"
                          style={{
                            background: "linear-gradient(90deg, #38bdf8, #6366f1, #ec4899, #f472b6, #06b6d4, #3b82f6, #8b5cf6, #38bdf8)",
                            backgroundSize: "200% 100%",
                            animation: "glowShift 8s linear infinite",
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            filter: "drop-shadow(0 0 6px rgba(56, 189, 248, 0.6)) drop-shadow(0 0 12px rgba(99, 102, 241, 0.4))",
                          }}
                        >
                          Select a token
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeDropdown();
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-[#ff5f57]/15 hover:text-[#ff5f57] relative z-10"
                          style={{ 
                            lineHeight: "0",
                            paddingBottom: "2px"
                          }}
                          aria-label="Close token selector"
                        >
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Content area */}
                      <div className="flex flex-col gap-4 p-6" style={{ height: "calc(100% - 48px)", overflow: "hidden", display: "flex" }}>
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Search token"
                          className="w-full flex-shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                        />
                        <div 
                          className="flex-1 min-h-0 overflow-y-auto"
                          style={{ 
                            overflowY: "auto",
                            WebkitOverflowScrolling: "touch",
                            maxHeight: "100%"
                          }}
                          onWheel={(e) => {
                            // Mark scrolling immediately
                            console.log("🔒 Scrollable area onWheel - allowing scroll to work");
                            isScrollingRef.current = true;
                            // DON'T stop propagation - we want the scroll to work!
                            // DON'T prevent default - we want native scrolling!
                            // Clear any existing timeout
                            if (scrollTimeoutRef.current) {
                              clearTimeout(scrollTimeoutRef.current);
                            }
                            // Reset scrolling flag after scroll ends (increased delay)
                            scrollTimeoutRef.current = setTimeout(() => {
                              isScrollingRef.current = false;
                            }, 500);
                          }}
                          onScroll={(e) => {
                            const target = e.currentTarget;
                            const currentScrollTop = target.scrollTop;
                            const now = Date.now();
                            
                            // Track scroll position changes (Uniswap approach)
                            if (scrollPositionRef.current) {
                              const scrollDelta = Math.abs(currentScrollTop - scrollPositionRef.current.top);
                              // If scroll position changed significantly, user is actively scrolling
                              if (scrollDelta > 1) {
                                isScrollingRef.current = true;
                              }
                            }
                            
                            scrollPositionRef.current = {
                              top: currentScrollTop,
                              timestamp: now
                            };
                            
                            // Stop scroll events from propagating
                            e.stopPropagation();
                            
                            // Clear any existing timeout
                            if (scrollTimeoutRef.current) {
                              clearTimeout(scrollTimeoutRef.current);
                            }
                            
                            // Reset scrolling flag after scroll ends (150ms after last scroll event)
                            scrollTimeoutRef.current = setTimeout(() => {
                              isScrollingRef.current = false;
                              scrollPositionRef.current = null;
                            }, 150);
                          }}
                          onTouchMove={(e) => {
                            // Mark scrolling immediately for touch
                            console.log("🔒 Scrollable area onTouchMove - marking as scrolling");
                            isScrollingRef.current = true;
                            e.preventDefault(); // Prevent default touch behavior
                            e.stopPropagation();
                            
                            // Clear any existing timeout
                            if (scrollTimeoutRef.current) {
                              clearTimeout(scrollTimeoutRef.current);
                            }
                            
                            // Reset scrolling flag after touch ends - INCREASED DELAY
                            scrollTimeoutRef.current = setTimeout(() => {
                              console.log("🔒 Resetting isScrollingRef to false after scrollable touch move");
                              isScrollingRef.current = false;
                            }, 500); // Increased from 150ms to 500ms
                          }}
                          onTouchStart={(e) => {
                            // Mark scrolling on touch start
                            console.log("🔒 Scrollable area onTouchStart - marking as scrolling");
                            isScrollingRef.current = true;
                            e.preventDefault(); // Prevent default touch behavior
                            e.stopPropagation();
                            
                            // Clear any existing timeout
                            if (scrollTimeoutRef.current) {
                              clearTimeout(scrollTimeoutRef.current);
                            }
                          }}
                          onTouchEnd={(e) => {
                            // Reset scrolling flag after touch ends - INCREASED DELAY
                            console.log("🔒 Scrollable area onTouchEnd - keeping isScrollingRef true for longer");
                            e.preventDefault(); // Prevent default touch behavior
                            e.stopPropagation();
                            if (scrollTimeoutRef.current) {
                              clearTimeout(scrollTimeoutRef.current);
                            }
                            scrollTimeoutRef.current = setTimeout(() => {
                              console.log("🔒 Resetting isScrollingRef to false after scrollable touch end");
                              isScrollingRef.current = false;
                            }, 500); // Increased from 150ms to 500ms
                          }}
                          onMouseDown={(e) => {
                            // Prevent mouse down during active scrolling
                            if (isScrollingRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onClick={(e) => {
                            // TEMPORARILY DISABLED FOR SCROLL TESTING
                            console.log("🔒 Scrollable area onClick called - BLOCKED for testing");
                            console.log("  isScrollingRef.current:", isScrollingRef.current);
                            console.trace("Call stack:");
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                            
                            // Prevent clicks during scrolling
                            if (isScrollingRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            // Prevent clicks from bubbling
                            e.stopPropagation();
                          }}
                        >
                          {renderList(tokensToDisplay)}
                        </div>
                      </div>
                      
                      {/* Resize handles */}
                      <>
                        <div className="absolute top-0 left-4 right-4 h-1 cursor-ns-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('top', e)} />
                        <div className="absolute bottom-0 left-4 right-4 h-1 cursor-ns-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('bottom', e)} />
                        <div className="absolute top-4 bottom-4 left-0 w-1 cursor-ew-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('left', e)} />
                        <div className="absolute top-4 bottom-4 right-0 w-1 cursor-ew-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('right', e)} />
                        <div className="absolute top-0 left-0 h-4 w-4 cursor-nwse-resize z-50 rounded-tl-[20px]" onPointerDown={(e) => handleResizeSelectorStart('top-left', e)} />
                        <div className="absolute top-0 right-0 h-4 w-4 cursor-nesw-resize z-50 rounded-tr-[20px]" onPointerDown={(e) => handleResizeSelectorStart('top-right', e)} />
                        <div className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize z-50 rounded-bl-[20px]" onPointerDown={(e) => handleResizeSelectorStart('bottom-left', e)} />
                        <div className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize z-50 rounded-br-[20px]" onPointerDown={(e) => handleResizeSelectorStart('bottom-right', e)} />
                      </>
                    </div>
              </div>,
            document.body
          )
          :
          shouldRender &&
            createPortal(
              <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-[${animateDuration}ms] ${
                isOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}>
                <div
                  className={`w-[70vw] max-w-sm rounded-3xl border border-white/10 bg-black/95 px-5 pb-5 pt-7 shadow-2xl transition-all duration-[${animateDuration}ms] ${
                    isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-6"
                  }`}
                  style={{ maxHeight: "80vh" }}
                >
                  <div className="relative mb-5 flex items-center justify-center text-xs text-white/60">
                    <span className="bg-gradient-to-r from-[#38bdf8] via-[#6366f1] to-[#ec4899] bg-clip-text text-xl font-semibold tracking-wide text-transparent">
                      Select a token
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Only close if not scrolling
                        if (!isScrollingRef.current) {
                          closeDropdown();
                        }
                      }}
                      className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full text-3xl text-white/70 transition hover:bg-white/10 hover:text-white"
                      style={{ 
                        top: "-2px",
                        lineHeight: "0",
                        paddingBottom: "3px"
                      }}
                      aria-label="Close token selector"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search token"
                    className="mb-5 w-full rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                  />
                  <div className="max-h-[60vh] overflow-hidden">
                    {renderList(tokensToDisplay)}
                  </div>
                </div>
              </div>,
              document.body
            )}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ width: "100vw", overflowX: "hidden", margin: 0, padding: 0, boxSizing: "border-box", position: "relative", left: 0, right: 0, backgroundColor: "transparent" }}>
      <Header />

      {/* Global container with no padding - sections stack on each other */}
      <div className="relative" style={{ padding: 0, width: "100vw", margin: 0, boxSizing: "border-box", position: "relative", left: 0, right: 0 }}>
        {/* Simple blur test rectangle */}
      {(isChartOpen || chartPhase === "closing") && (() => {
        console.log("🎨 Rendering Chart Overlay:");
        console.log("  Chart data available:", chartData.length, "points");
        console.log("  Token pair:", tokenA.symbol, "/", tokenB.symbol);
        
        const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;
        const offsetX = overlayOffset?.x ?? 0;
        const offsetY = overlayOffset?.y ?? 0;
        // On mobile, position at top: 0, desktop uses centered positioning
        const transform = isMobileView
          ? "translateX(-50%)"
          : isChartMaximized
          ? "translate(-50%, -50%)"
          : `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
        return (
          <div
            className={`fixed pointer-events-none ${isMobileView ? 'z-[60]' : 'z-20'}`}
            style={{
              top: isMobileView ? "0" : "50%",
              left: "50%",
              transform,
            }}
          >
            <div
              className={`pointer-events-auto relative flex flex-col ${isMobileView ? '' : 'rounded-[20px] border border-white/15'} shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)]`}
                style={{
                  width: isMobileView ? "100vw" : (chartSize.width > 0 ? `${chartSize.width}px` : (isChartMaximized ? "80vw" : "92vw")),
                  maxWidth: isMobileView ? "100vw" : (chartSize.width > 0 ? "none" : (isChartMaximized ? "none" : "1100px")),
                  height: isMobileView ? "100vh" : (chartSize.height > 0 ? `${chartSize.height}px` : (isChartMaximized ? "90vh" : "77vh")),
                  maxHeight: isMobileView ? "100vh" : (chartSize.height > 0 ? "none" : (isChartMaximized ? "none" : "840px")),
                  backgroundColor: isMobileView ? "#000000" : "rgba(12, 14, 22, 0.6)",
                  backdropFilter: isMobileView ? "none" : "blur(40px) saturate(180%)",
                  WebkitBackdropFilter: isMobileView ? "none" : "blur(40px) saturate(180%)",
                  boxShadow: isMobileView ? "none" : "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                  transition: isResizing ? "none" : "width 0.3s ease, height 0.3s ease",
                  animation: chartPhase === "opening" ? "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards" : chartPhase === "closing" ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
                  zIndex: 1,
                  position: "relative",
                }}
              >
                {/* Header with drag and buttons */}
                <div
                  className={`flex items-center justify-between border-b border-white/10 ${
                    isMobileView ? "h-[62px]" : "h-12"
                  } ${
                    (typeof window !== 'undefined' && window.innerWidth < 768) 
                      ? "" 
                      : (isChartMaximized || isDraggingChart ? "cursor-grabbing" : "cursor-grab")
                  }`}
                  style={{
                    ...(isMobileView && {
                      paddingLeft: "16px", // px-4 - same as mobile content padding
                      paddingRight: "16px", // px-4 - same as mobile content padding
                      paddingTop: "16px", // 2x of 8px (default)
                      paddingBottom: "16px", // 2x of 8px (default)
                    }),
                    ...(!isMobileView && {
                      paddingLeft: "16px", // px-4
                      paddingRight: "16px", // px-4
                    }),
                  }}
                  onPointerDown={handleOverlayPointerDown}
                >
                  <div className="flex items-center gap-4">
                    {/* Token pair with icons */}
                    <div className="flex items-center gap-2">
                      {tokenA.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tokenA.icon}
                          alt={tokenA.symbol}
                          className="h-5 w-5 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
                          }}
                        />
                      )}
                      <span className="text-xs uppercase tracking-[0.35em] text-white/55">
                        {chartPairLabel}
                      </span>
                      {tokenB.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tokenB.icon}
                          alt={tokenB.symbol}
                          className="h-5 w-5 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
                          }}
                        />
                      )}
                    </div>
                    
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Maximize button - hidden on mobile */}
                    {!isMobileView && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsChartMaximized((prev) => !prev);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white"
                        aria-label={isChartMaximized ? "Restore" : "Maximize"}
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          {isChartMaximized ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l-6 6m0 0l6 6m-6-6h12a2 2 0 002-2V3" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          )}
                        </svg>
                      </button>
                    )}
                    {/* Close button - bigger on mobile */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseChart();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`flex items-center justify-center rounded-full text-white/70 transition hover:bg-[#ff5f57]/15 hover:text-[#ff5f57] ${
                        isMobileView ? "h-12 w-12" : "h-10 w-10"
                      }`}
                      aria-label="Close"
                    >
                      <svg className={isMobileView ? "h-8 w-8" : "h-6 w-6"} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Time Range Buttons - Mobile: below header */}
                {isMobileView && (() => {
                  const timeRanges: Array<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y" | "10Y" | "ALL"> = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "10Y", "ALL"];
                  
                  return (
                    <div className="relative flex-shrink-0 border-b border-white/10 bg-black overflow-hidden" style={{ minHeight: "48px" }}>
                      <div
                        className="flex gap-2 px-4 py-3 overflow-x-auto"
                        style={{
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                          WebkitOverflowScrolling: 'touch',
                        }}
                      >
                        {timeRanges.map((range) => (
                          <button
                            key={range}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChartTimeRange(range);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs uppercase tracking-wide font-medium transition-all ${
                              chartTimeRange === range
                                ? "bg-white/20 text-white"
                                : "text-white/60 hover:text-white/80"
                            }`}
                          >
                            {range}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Time Range Buttons - Desktop: below header */}
                {!isMobileView && (() => {
                  const timeRanges: Array<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y" | "10Y" | "ALL"> = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "10Y", "ALL"];
                  
                  return (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-black">
                      {timeRanges.map((range) => (
                        <button
                          key={range}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChartTimeRange(range);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={`px-4 py-2 rounded-lg text-xs uppercase tracking-wide font-medium transition-all ${
                            chartTimeRange === range
                              ? "bg-white/20 text-white"
                              : "text-white/60 hover:text-white/80"
                          }`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {/* Chart Container - flex-1 on mobile to take remaining space, full height on desktop */}
                <div
                  key={`chart-container-${tokenA.symbol}-${tokenB.symbol}-${chartTimeRange}`}
                  className={isMobileView ? "relative overflow-visible flex-1" : "absolute overflow-hidden"}
                  onTouchStart={(e) => {
                    if (isMobileView) {
                      // Touch start - crosshair will appear, buttons will hide via onCrosshairChange
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (isMobileView) {
                      // Touch end - hide crosshair and show buttons
                      setIsCrosshairActive(false);
                    }
                  }}
                  style={{
                    ...(isMobileView ? {
                      // flex-1 will take remaining space after header and buttons
                    } : {
                      top: "96px", // 48px header + 48px time range buttons
                      left: "0",
                      right: "0",
                      bottom: "0",
                      borderBottomLeftRadius: "20px",
                      borderBottomRightRadius: "20px",
                    }),
                  }}
                >
                  <div className="relative w-full h-full">
                    {chartData.length > 0 ? (
                      <div 
                        className="w-full h-full transition-opacity duration-300"
                        style={{
                          opacity: isLoadingChartData ? 0.3 : 1,
                        }}
                      >
                        <LightweightChart 
                          key={`lw-${tokenA.symbol}-${tokenB.symbol}-${chartTimeRange}-${chartData.length}`} 
                          data={chartData}
                          pulseColor={latestPriceChange === "up" ? "#10b981" : latestPriceChange === "down" ? "#ef4444" : "#3b82f6"}
                          showPulse={showPulse}
                          permanentDotColor={permanentDotColor}
                          onSeriesReady={(series, chart, updatePositions) => {
                            console.log("📢 Chart series ready, storing reference");
                            chartSeriesRef.current = { series, chart, updatePositions };
                          }}
                          onCrosshairChange={(isActive) => {
                            if (isMobileView) {
                              setIsCrosshairActive(isActive);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                        <LoadingAnimation />
                        <p className="text-sm text-white/40 font-medium">Loading chart data...</p>
                      </div>
                    )}
                    {/* Loading overlay with spinner */}
                    {isLoadingChartData && chartData.length > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-50">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="relative">
                            <div className="h-12 w-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                          </div>
                          <p className="text-sm text-white/70 font-medium">Loading new data...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Info Card - Mobile only, 35vh */}
                {isMobileView && (
                  <div
                    className="relative flex-shrink-0 border-t border-white/10"
                    style={{
                      height: "35vh",
                      backgroundColor: "#000000",
                    }}
                  >
                    <div className="h-full w-full p-4">
                      {/* Info card content - placeholder for now */}
                      <div className="h-full w-full rounded-lg border border-white/10 bg-black p-4 flex items-center justify-center">
                        <p className="text-sm text-white/60">Info card content</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
          </div>
        );
      })()}

      {/* Swap Details Popup - Liquid Glass */}
      {(isSwapDetailsOpen || swapDetailsPhase === "closing") && swapDetails && (() => {
        const isActive = swapDetailsPhase === "opening" || swapDetailsPhase === "open";
        
        const overlayStyle: CSSProperties = {
          opacity: isActive ? 1 : 0,
          transform: `scale(${isActive ? 1 : 0.3})`,
          transformOrigin: "center center",
          transition: `opacity 0.52s cubic-bezier(0.16, 1, 0.3, 1), transform 0.52s cubic-bezier(0.16, 1, 0.3, 1)`,
          willChange: "transform, opacity",
          pointerEvents: isActive ? "auto" : "none",
        };

        return createPortal(
          <div 
            className="fixed inset-0 z-30 flex items-center justify-center"
            style={{
              backgroundColor: "transparent",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleCloseSwapDetails();
              }
            }}
          >
            <div 
              className="pointer-events-auto relative" 
              style={{
                opacity: overlayStyle.opacity,
                transform: `translate(${swapDetailsOffset.x}px, ${swapDetailsOffset.y}px) scale(${isActive ? 1 : 0.3})`,
                transformOrigin: "center center",
                transition: isDraggingSwapDetails ? "none" : overlayStyle.transition,
                willChange: overlayStyle.willChange,
                pointerEvents: overlayStyle.pointerEvents,
              }}
            >
              {/* Shadow wrapper - shadow only visible around edges */}
              <div
                className="absolute"
                style={{
                  width: "600px",
                  maxWidth: "90vw",
                  height: "70vh",
                  minHeight: "500px",
                  borderRadius: "28px",
                  boxShadow: "0 100px 250px -20px rgba(0, 0, 0, 1), 0 50px 120px -5px rgba(0, 0, 0, 0.8)",
                  pointerEvents: "none",
                  zIndex: -1,
                }}
              />
              <div
                className="relative flex flex-col overflow-hidden rounded-[28px] border border-white/15"
                style={{
                  width: "600px",
                  maxWidth: "90vw",
                  height: "70vh",
                  minHeight: "500px",
                  backgroundColor: "rgba(12, 14, 22, 0.7)",
                  backdropFilter: "blur(40px) saturate(180%)",
                  WebkitBackdropFilter: "blur(40px) saturate(180%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                  animation: swapDetailsPhase === "opening" ? "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards" : swapDetailsPhase === "closing" ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {/* Header with drag and close button */}
                <div 
                  className={`relative z-10 flex h-12 items-center justify-between border-b border-white/10 bg-white/5 px-4 md:px-6 backdrop-blur-xl backdrop-saturate-[180%] ${
                    isDraggingSwapDetails ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  onPointerDown={handleSwapDetailsPointerDown}
                >
                  <div className="text-sm font-medium tracking-wide text-white/70">Swap Details</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseSwapDetails();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-[#ff5f57]/15 hover:text-[#ff5f57]"
                    aria-label="Close"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 pb-8">
                  {/* Success icon */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg className="h-10 w-10 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>

                  {/* Success message */}
                  <div className="text-center">
                    <h2 className="text-2xl font-semibold text-white mb-2">Swap Successful!</h2>
                    <p className="text-sm text-white/60">Your transaction has been completed</p>
                  </div>

                  {/* Swap details */}
                  <div className="w-full space-y-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs text-white/50 mb-2">You Paid</div>
                      <div className="flex items-center justify-between">
                        <div className="text-lg font-semibold text-white">{swapDetails.amountIn}</div>
                        <div className="text-sm text-white/70">{swapDetails.tokenIn}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-center">
                      <svg className="h-6 w-6 text-white/40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                      </svg>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs text-white/50 mb-2">You Received</div>
                      <div className="flex items-center justify-between">
                        <div className="text-lg font-semibold text-emerald-400">{swapDetails.amountOut}</div>
                        <div className="text-sm text-white/70">{swapDetails.tokenOut}</div>
                      </div>
                    </div>
                  </div>

                  {/* Transaction hash */}
                  {txHash && (() => {
                    const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "";
                    const isLocalhost = !explorerUrl || explorerUrl.includes("localhost") || explorerUrl.includes("127.0.0.1");
                    
                    const handleCopyHash = async () => {
                      try {
                        await navigator.clipboard.writeText(txHash);
                        setCopiedHash(true);
                        setTimeout(() => setCopiedHash(false), 2000);
                      } catch (err) {
                        console.error("Failed to copy hash:", err);
                      }
                    };
                    
                    return (
                      <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4 relative">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-white/50">Transaction Hash</div>
                          <button
                            type="button"
                            onClick={handleCopyHash}
                            className="flex items-center justify-center w-6 h-6 rounded text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
                            aria-label="Copy transaction hash"
                          >
                            {copiedHash ? (
                              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0018 20.25h-7.5A2.25 2.25 0 008.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 00-2.25 2.25v6.75m8.25-8.25v6.75m0 0v-1.5m0 1.5h-8.25m8.25 0H12" />
                              </svg>
                            )}
                          </button>
                        </div>
                        {isLocalhost ? (
                          <code className="text-xs text-white/70 break-all pr-8">{txHash}</code>
                        ) : (
                          <a
                            href={`${explorerUrl}/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 underline hover:text-emerald-300 break-all pr-8 block"
                          >
                            {txHash}
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Main swap interface - section with its own padding */}
      <main className="relative z-10 flex min-h-screen flex-col" style={{ paddingTop: "15vh", width: "100vw", margin: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: 0 }}>
        {/* Fixed section wrapper - Isolated from dynamic content to prevent centering shifts */}
        <div ref={fixedSectionRef} className="w-full max-w-md md:max-w-[524px] mx-auto px-2 md:px-4" style={{ position: "relative", flexShrink: 0 }}>
          {/* Fixed section: Title through You receive card - Position doesn't change */}
          <div 
            ref={swapTitleRef}
            style={{
              transform: `translate(${swapCardOffset.x}px, ${swapCardOffset.y}px)`,
              transition: isDraggingSwapCard ? "none" : "transform 0.3s ease",
            }}
          >
            {/* Swap tokens title above card */}
            <h1 className="text-4xl font-semibold text-white/60 mb-[25px] text-center">
              Swap tokens
            </h1>
            
            {/* Unified swap card with glassmorphic styling */}
            <div 
              ref={swapCardRef}
              className="rounded-[20px] overflow-visible flex flex-col relative"
                style={{
                  backgroundColor: "transparent",
                  zIndex: 1,
                }}
              >
              {/* Content area with swap fields */}
              <div className="flex flex-col flex-1 min-h-0">
                {/* Swap card content */}
                <div className="px-0 md:px-4">
                <div ref={cardRef}>

            <div className="mb-4 mt-6 md:mb-[11.2px] md:mt-[16.8px] flex items-center justify-between gap-4 text-xs text-white/60">
              <span className="text-left pl-0 md:pl-4" style={{ fontSize: "0.75rem" }}>Order type</span>
              <div className="flex items-center gap-[11.2px]">
              {(["Swap", "Limit", "Buy", "Sell"] as const).map((type) => (
                <button
                  key={type}
                  ref={type === "Swap" ? swapButtonRef : undefined}
                  onClick={() => setOrderType(type)}
                  className={`order-type-button rounded-full border border-white/20 px-3 py-2 md:px-3 md:py-1 text-xs font-normal transition-all touch-manipulation flex items-center justify-center whitespace-nowrap ${
                    orderType === type
                      ? "bg-white/15 text-white hover:bg-white/10 hover:border-white/30 md:border-white/40"
                      : "text-white/80 hover:bg-white/10 hover:border-white/30 hover:text-white md:border-white/20"
                  }`}
                  type="button"
                  style={{ 
                    ...(orderButtonWidth && type !== "Swap" ? { width: `${orderButtonWidth}px`, minWidth: `${orderButtonWidth}px` } : {})
                  }}
                >
                  {type}
                </button>
              ))}
              </div>
            </div>

            <div className="relative flex flex-col" style={{ isolation: "auto" }}>
                {/* Cards container - Fixed position, doesn't shift */}
                <div className="flex flex-col flex-shrink-0">
                  {/* You pay card - ALWAYS on top */}
                  <div className="rounded-2xl bg-transparent border border-white/10 p-4 md:p-4 mb-[10px]" style={{ minHeight: "120px", height: "auto", position: "relative", zIndex: 1, width: "100%" }}>
                    <div className="mb-1">
                      <span className="text-sm text-white/60">You pay</span>
                    </div>
                    <div className="flex items-center gap-3 h-full">
                      <TestScrollCard
                        isLimitSelected={orderType === "Limit"}
                        onClose={() => setOrderType("Swap")}
                        cardRect={cardRect}
                      />
                      <TokenSelector
                        selected={direction === "a-to-b" ? tokenA : tokenB}
                        tokens={tokens}
                        onSelect={(t) => {
                          if (direction === "a-to-b") {
                            if (t.address === tokenB.address) {
                              setTokenA(tokenB);
                              setTokenB(t);
                              setDirection("b-to-a");
                            } else {
                              setTokenA(t);
                            }
                          } else {
                            if (t.address === tokenA.address) {
                              setTokenB(tokenA);
                              setTokenA(t);
                              setDirection("a-to-b");
                            } else {
                              setTokenB(t);
                            }
                          }
                        }}
                        side="left"
                        cardRect={cardRect}
                        swapTitleRect={swapTitleRect}
                        swapCardRect={swapCardRect}
                      />
                      <div className="flex-1 text-right flex flex-col justify-center h-full">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.0"
                          value={formatWithCommas(amountIn)}
                          onChange={(e) => handleAmountInChange(e.target.value)}
                          onFocus={() => setActiveField("in")}
                          className={`w-full bg-transparent font-medium text-white text-right outline-none placeholder:text-white/30 ${
                            amountIn && Number(amountIn.replace(/,/g, "")) > 1e3 
                              ? Number(amountIn.replace(/,/g, "")) > 1e6 
                                ? "text-xl" 
                                : "text-2xl"
                              : "text-3xl"
                          }`}
                        />
                        <div className="mt-1 text-xs text-white/40" style={{ minHeight: "16px" }}>
                          {(() => {
                            const normalized = amountIn.endsWith(".") ? amountIn.slice(0, -1) : amountIn;
                            if (!normalized) return "\u00A0";
                            const numeric = Number(normalized.replace(/,/g, ""));
                            if (!Number.isFinite(numeric) || numeric <= 0) return "\u00A0";
                            const fiatValue = numeric * fiatRates[fiatCurrency];
                            return `≈ ${fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}`;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Switch button - positioned between cards */}
                  <div className="flex justify-center relative" style={{ zIndex: 20, isolation: "auto", height: "0px" }}>
                    <button
                      onClick={() => setDirection(direction === "a-to-b" ? "b-to-a" : "a-to-b")}
                    className="rounded-xl transition-all hover:scale-105 relative touch-manipulation flex items-center justify-center"
                    style={{
                      background: "rgba(255, 255, 255, 0.1)",
                      backdropFilter: "blur(20px) saturate(180%)",
                      WebkitBackdropFilter: "blur(20px) saturate(180%)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      boxShadow: "0 0 0 7px rgba(0, 0, 0, 0.7), 0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)",
                      position: "relative",
                      width: "48px",
                      height: "48px",
                      minWidth: "48px",
                      minHeight: "48px",
                      borderRadius: "18px",
                      padding: 0,
                      marginTop: "-29px"
                    }}
                  >
                    <svg
                      className="h-5 w-5 md:h-5 md:w-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* You receive card - ALWAYS on bottom */}
                  <div className="rounded-2xl bg-white/5 p-4 md:p-4" style={{ 
                    minHeight: "120px", 
                    height: "auto",
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                  }}>
                    <div className="mb-1">
                      <span className="text-sm text-white/60">You receive</span>
                    </div>
                    <div className="flex items-center gap-3 h-full">
                      <div className="flex-1 text-left relative flex flex-col justify-center h-full">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.0"
                          value={formatWithCommas(amountOutValue)}
                          onChange={(e) => handleAmountOutChange(e.target.value)}
                          onFocus={() => setActiveField("out")}
                          className={`w-full bg-transparent font-medium text-white text-left outline-none placeholder:text-white/30 ${
                            amountOutValue && Number(amountOutValue.replace(/,/g, "")) > 1e3 
                              ? Number(amountOutValue.replace(/,/g, "")) > 1e6 
                                ? "text-xl" 
                                : "text-2xl"
                              : "text-3xl"
                          }`}
                        />
                        {isQuoting && activeField === "in" && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1">
                            <div className="w-1 h-3 rounded-full bg-blue-400/60" style={{ animation: "loadingPulse 1s ease-in-out infinite" }} />
                            <div className="w-1 h-3 rounded-full bg-purple-400/60" style={{ animation: "loadingPulse 1s ease-in-out 0.2s infinite" }} />
                            <div className="w-1 h-3 rounded-full bg-pink-400/60" style={{ animation: "loadingPulse 1s ease-in-out 0.4s infinite" }} />
                          </div>
                        )}
                        <div className="mt-1 text-xs text-white/40" style={{ minHeight: "16px" }}>
                          {(() => {
                            const normalized = amountOutValue.endsWith(".") ? amountOutValue.slice(0, -1) : amountOutValue;
                            if (!normalized) return "\u00A0";
                            const numeric = Number(normalized.replace(/,/g, ""));
                            if (!Number.isFinite(numeric) || numeric <= 0) return "\u00A0";
                            const fiatValue = numeric * fiatRates[fiatCurrency];
                            return `≈ ${fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}`;
                          })()}
                        </div>
                      </div>
                      <TokenSelector
                        selected={direction === "a-to-b" ? tokenB : tokenA}
                        tokens={tokens}
                        onSelect={(t) => {
                          if (direction === "a-to-b") {
                            if (t.address === tokenA.address) {
                              setTokenB(tokenA);
                              setTokenA(t);
                              setDirection("b-to-a");
                            } else {
                              setTokenB(t);
                            }
                          } else {
                            if (t.address === tokenB.address) {
                              setTokenA(tokenB);
                              setTokenB(t);
                              setDirection("a-to-b");
                            } else {
                              setTokenA(t);
                            }
                          }
                        }}
                        side="right"
                        cardRect={cardRect}
                        swapTitleRect={swapTitleRect}
                        swapCardRect={swapCardRect}
                      />
                    </div>
                  </div>
                </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Dynamic section container - Positioned absolutely relative to fixed section wrapper */}
        <div
          ref={dynamicSectionRef}
          className="w-full max-w-md md:max-w-[524px] mx-auto px-2 md:px-4 flex flex-col"
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: "24px",
            zIndex: 10,
            width: "100%",
          }}
        >
            {/* Exchange Rate Display - Always reserves space to prevent flickering */}
            {(amountIn || amountOutValue) && (
            <div className="rounded-xl bg-white/5 overflow-hidden" style={{ minHeight: "48px" }}>
                    <button
                      onClick={() => quote && amountIn && amountOutValue && setShowDetails(!showDetails)}
                      disabled={!quote || !amountIn || !amountOutValue}
                      className="w-full px-4 py-3 md:py-3 flex items-center justify-between text-xs md:text-xs hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-default touch-manipulation min-h-[48px] md:min-h-0"
                      style={{ minHeight: "48px" }}
                    >
                      <div className="text-xs font-medium flex-1 text-left">
                        <span 
                          className="text-white/60 tracking-wide"
                          style={quote && amountIn && amountOutValue ? {
                            background: "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.8) 70%, rgba(255,255,255,0.5) 100%)",
                            backgroundSize: "200% 100%",
                            backgroundClip: "text",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            animation: "shimmer 3s ease-in-out infinite",
                          } : {}}
                        >
                          {(() => {
                            if (!quote || !amountIn || !amountOutValue) {
                              return "\u00A0"; // Non-breaking space placeholder
                            }
                            
                            const normalizedIn = amountIn.endsWith(".") ? amountIn.slice(0, -1) : amountIn;
                            if (!normalizedIn) return "\u00A0";
                            
                            // Use amountOutValue from state instead of quote.amountOut to ensure consistency
                            const normalizedOut = amountOutValue.endsWith(".") ? amountOutValue.slice(0, -1) : amountOutValue;
                            if (!normalizedOut) return "\u00A0";
                            
                            const inNumber = Number(normalizedIn.replace(/,/g, ""));
                            const outNumber = Number(normalizedOut.replace(/,/g, ""));
                            
                            if (!Number.isFinite(inNumber) || inNumber === 0 || !Number.isFinite(outNumber) || outNumber === 0) {
                              return "\u00A0";
                            }
                            
                            // Determine tokens from cards: You pay is always top, You receive is always bottom
                            const payToken = direction === "a-to-b" ? tokenA : tokenB;
                            const receiveToken = direction === "a-to-b" ? tokenB : tokenA;
                            
                            // Calculate rate: outNumber / inNumber gives how much receiveToken per 1 payToken
                            const rate = outNumber / inNumber;
                            
                            // Debug logging
                            console.log("📊 Exchange Rate Calculation:");
                            console.log("  Direction:", direction);
                            console.log("  Pay Token:", payToken.symbol, payToken.address);
                            console.log("  Receive Token:", receiveToken.symbol, receiveToken.address);
                            console.log("  Amount In:", inNumber, payToken.symbol);
                            console.log("  Amount Out:", outNumber, receiveToken.symbol);
                            console.log("  Quote.amountOut:", quote.amountOut);
                            console.log("  AmountOutValue:", amountOutValue);
                            console.log("  Calculated Rate:", rate, `${receiveToken.symbol}/${payToken.symbol}`);
                            
                            if (!Number.isFinite(rate) || rate <= 0) return "\u00A0";
                            
                            // Format rate with proper decimal places
                            let formattedRate: string;
                            if (rate < 0.000001) {
                              formattedRate = rate.toExponential(2);
                            } else if (rate < 1) {
                              // For small rates, show up to 9 decimal places to capture 0.000333
                              formattedRate = trimTrailingZeros(rate.toFixed(9));
                            } else {
                              formattedRate = trimTrailingZeros(rate.toFixed(6));
                            }
                            return `1 ${payToken.symbol} = ${formattedRate} ${receiveToken.symbol}`;
                          })()}
                        </span>
                      </div>
                      {quote && amountIn && amountOutValue && (
                      <svg
                        className={`h-4 w-4 text-white/60 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      )}
                    </button>
                    {showDetails && quote && amountIn && amountOutValue && (
                      <div className="px-4 pb-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="flex justify-between items-center text-sm text-white/60">
                          <div className="flex items-center gap-1">
                            <span>Slippage tolerance</span>
                            <svg className="h-3 w-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span>{(slippageBps / 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-white/60">
                          <div className="flex items-center gap-1">
                            <span>Minimum received</span>
                            <svg className="h-3 w-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span>
                            {(() => {
                              if (!quote || !amountOutValue) return "-";
                              const outNum = Number(quote.amountOut.replace(/,/g, ""));
                              if (!Number.isFinite(outNum)) return "-";
                              const minAmount = outNum * (1 - slippageBps / 10000);
                              return `${trimTrailingZeros(minAmount.toFixed(6))} ${amountOutSymbol}`;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-white/60">
                          <div className="flex items-center gap-1">
                            <span>Price impact</span>
                            <svg className="h-3 w-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span>—</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-white/60">
                          <div className="flex items-center gap-1">
                            <span>Network fee</span>
                            <svg className="h-3 w-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span>—</span>
                        </div>
                      </div>
                    )}
                  </div>
                  )}

            {/* Error messages */}
            {quoteError && (
              <div className="w-full rounded-full bg-red-500/10 px-4 py-2 text-sm text-red-400">
                {quoteError}
              </div>
            )}

            {allowanceError && (
              <div className="w-full rounded-full bg-red-500/10 px-4 py-2 text-sm text-red-400">
                {allowanceError}
              </div>
            )}

            {/* Error messages */}
            {!configReady && (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                Swap not configured. Check environment variables.
              </div>
            )}

            {connectError && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {connectError?.message || "Connection error"}
              </div>
            )}

            {/* Loading Animation */}
            {isLoadingChartData && (
              <div className="flex flex-col items-center justify-center gap-3 py-4">
                <LoadingAnimation />
                <p className="text-xs text-white/50 font-medium">Loading chart data...</p>
              </div>
            )}

            {/* Network mismatch warning */}
            {isConnected && !isCorrectChain && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 space-y-3">
                <div>
                  Wrong network detected. Please switch to <strong>{targetChain.name}</strong> (Chain ID: {targetChain.id}).
                </div>
                <button
                  onClick={() => switchChain({ chainId: targetChain.id })}
                  disabled={isSwitchingChain}
                  className="rounded-full border border-red-500/30 px-3 md:px-3 py-2 md:py-1.5 text-xs md:text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px] md:min-h-0"
                  style={{ minHeight: "48px" }}
                >
                  {isSwitchingChain ? "Switching..." : `Switch to ${targetChain.name}`}
                </button>
              </div>
            )}

            {/* Approve button */}
            {!isNativeInput && needsApproval && isConnected && effectiveWalletClient && isCorrectChain && (
              <button
                onClick={handleApprove}
                disabled={isApproving || isFetchingAllowance || !configReady}
                className="rounded-full border border-white/20 px-3 md:px-3 py-2 md:py-2 text-sm md:text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:border-white/30 hover:text-white w-full touch-manipulation min-h-[48px] md:min-h-0"
                style={{ minHeight: "48px" }}
              >
                {isApproving ? "Approving..." : `Approve ${amountInSymbol}`}
              </button>
            )}

            {/* Wallet connection error for approval */}
            {!isNativeInput && needsApproval && isConnected && !effectiveWalletClient && (
              <div className="rounded-xl bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400 space-y-3">
                <div>Wallet client not available. Please try reconnecting your wallet.</div>
                <div className="flex gap-2">
                  <button
                    onClick={retryGetWalletClient}
                    disabled={isRetryingWalletClient}
                    className="rounded-full border border-yellow-500/30 px-3 md:px-3 py-2 md:py-1.5 text-xs md:text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px] md:min-h-0"
                    style={{ minHeight: "48px" }}
                  >
                    {isRetryingWalletClient ? "Retrying..." : "Retry Wallet Client"}
                  </button>
                  <button
                    onClick={() => {
                      disconnect();
                      setTimeout(() => {
                        if (connectors[0]) {
                          connect({ connector: connectors[0] });
                        }
                      }, 100);
                    }}
                    disabled={isConnecting || isConnectPending}
                    className="rounded-full border border-yellow-500/30 px-3 md:px-3 py-2 md:py-1.5 text-xs md:text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px] md:min-h-0"
                    style={{ minHeight: "48px" }}
                  >
                    Reconnect Wallet
                  </button>
                </div>
              </div>
            )}

            {/* Buttons container with padding matching cards */}
            <div className="px-0 md:px-4 pb-4">
              {/* Swap/Connect Wallet button */}
              <button
                onClick={() => {
                  if (!isConnected) {
                    if (connectors[0]) {
                      connect({ connector: connectors[0] });
                    }
                  } else {
                    handleSwap();
                  }
                }}
                disabled={
                  (isConnected && txStatus === "pending") ||
                  (isConnected && isQuoting) ||
                  (isConnected && requiresApproval && needsApproval) ||
                  (isConnected && !configReady) ||
                  (isConnected && (!parsedAmountIn || parsedAmountIn === 0n)) ||
                  isConnecting ||
                  isConnectPending ||
                  (!isConnected && !connectors[0])
                }
                className="rounded-full border border-white/20 px-4 md:px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:border-white/30 hover:text-white w-full touch-manipulation min-h-[48px] md:min-h-0"
                style={{ minHeight: "48px", height: "48px" }}
              >
                {!isConnected
                  ? isConnecting || isConnectPending
                    ? "Connecting..."
                    : "Connect Wallet"
                  : txStatus === "pending"
                  ? "Swapping..."
                  : !parsedAmountIn || parsedAmountIn === 0n
                  ? "Enter amount"
                  : requiresApproval && needsApproval
                  ? "Approve first"
                  : "Swap"}
              </button>

              {/* Error messages */}
              {txStatus === "error" && (
                <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 mt-4">
                  Swap failed. Check console for details.
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 w-full mt-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleOpenChart();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                disabled={isLoadingChartData}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[48px] md:min-h-0"
                style={{ minHeight: "48px", height: "48px" }}
              >
                <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
                View live chart
              </button>
              
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log("⚙️ Advanced view clicked");
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white touch-manipulation min-h-[48px] md:min-h-0"
                style={{ minHeight: "48px", height: "48px" }}
              >
                <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Advanced view
              </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        /* Hide scrollbar for time range buttons on mobile */
        .overflow-x-auto::-webkit-scrollbar {
          display: none;
        }
        .overflow-x-auto {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        @keyframes swapGradientShift {
          0% {
            background-position: 100% 50%;
          }
          50% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        
        @keyframes glowShift {
          0% {
            background-position: 200% 50%;
          }
          100% {
            background-position: -200% 50%;
          }
        }
        
        @keyframes glowFadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 0.45;
          }
        }
        
        @keyframes glowFadeOut {
          0% {
            opacity: 0.45;
          }
          100% {
            opacity: 0;
          }
        }
        
        @keyframes loadingPulse {
          0%, 100% {
            transform: scaleY(0.3);
            opacity: 0.5;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
        
        @keyframes tradingViewRipple {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(8);
            opacity: 0;
          }
        }
        
        @keyframes pricePulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
        }
        
        @keyframes chart-appear {
          from {
            opacity: 0;
            transform: scale(0.6);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes chartRectangleAppear {
          from {
            opacity: 0;
            transform: scale(0.3);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes chartRectangleDisappear {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(0.3);
          }
        }
        
        .animate-chart-appear {
          animation: chart-appear 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        
        /* Mobile: Order type buttons match toolbar Connect button style */
        @media (max-width: 767px) {
          .order-type-button {
            min-height: 36px !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            color: rgba(255, 255, 255, 0.8) !important;
          }
        }
        
        /* Desktop: Override button padding to match toolbar buttons (px-3 py-1) */
        @media (min-width: 768px) {
          .order-type-button {
            padding-top: 4px !important;
            padding-bottom: 4px !important;
          }
        }
      `}</style>
      </div>
    </div>
  );
}


