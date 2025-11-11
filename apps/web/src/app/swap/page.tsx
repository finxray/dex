"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
import { GlowingCardWrapper } from "./components/GlowingCardWrapper";
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
  const [isLoadingChartData, setIsLoadingChartData] = useState(false);
  const [latestPriceChange, setLatestPriceChange] = useState<"up" | "down" | "same" | null>(null);
  const [showPulse, setShowPulse] = useState(false);
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
        address: inputToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [env.poolManagerAddress, maxUint256],
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
          BTC: "bitcoin",
          WBTC: "wrapped-bitcoin",
          USDC: "usd-coin",
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
        
        // Fetch 7 days of data (hourly data automatically returned for 2-90 days)
        // NOTE: interval=hourly is Enterprise-only, but we get hourly data automatically
        const days = 7;
        const vs_currency = "usd";
        
        const urlA = `https://api.coingecko.com/api/v3/coins/${coinA}/market_chart?vs_currency=${vs_currency}&days=${days}`;
        const urlB = `https://api.coingecko.com/api/v3/coins/${coinB}/market_chart?vs_currency=${vs_currency}&days=${days}`;
        
        console.log("\n🌐 API Endpoints:");
        console.log("  A:", urlA);
        console.log("  B:", urlB);
        
        console.log("\n⏳ Fetching from CoinGecko...");
        const fetchStartTime = Date.now();
        
        const [responseA, responseB] = await Promise.all([
          fetch(urlA),
          fetch(urlB)
        ]);
        
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`✅ Fetch completed in ${fetchDuration}ms`);
        console.log("📡 Response Status:");
        console.log("  A:", responseA.status, responseA.statusText);
        console.log("  B:", responseB.status, responseB.statusText);
        
        const dataA = await responseA.json();
        const dataB = await responseB.json();
        
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
          
          setChartData(points);
          setIsLoadingChartData(false);
          console.log("✅ Chart data set successfully!");
        } else {
          console.log("❌ API response invalid, using synthetic data");
          console.log("Reason: Missing or empty prices array");
          generateSyntheticData();
        }
      } catch (error) {
        console.error("❌ Failed to fetch real price data:");
        console.error(error);
        console.log("⚠️  Falling back to synthetic data");
        generateSyntheticData();
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
      setChartData(points);
      setIsLoadingChartData(false);
      console.log("✅ Synthetic chart data set!");
    };
    
    fetchRealPriceData();
  }, [tokenA.symbol, tokenB.symbol]);

  // Live price updates - USING COINGECKO API for real-time prices
  useEffect(() => {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║  🔴 LIVE PRICE UPDATE EFFECT TRIGGERED                ║");
    console.log("╚════════════════════════════════════════════════════════╝");
    console.log("  isChartOpen:", isChartOpen);
    console.log("  chartData.length:", chartData.length);
    console.log("  Will start updates:", isChartOpen && chartData.length > 0);
    
    if (!isChartOpen || chartData.length === 0) {
      console.log("❌ Live updates NOT starting - chart closed or no data");
      return;
    }

    const symbolA = tokenA.symbol.toUpperCase();
    const symbolB = tokenB.symbol.toUpperCase();
    
    // Coin mapping for CoinGecko API
    const coins: Record<string, string> = {
      ETH: "ethereum",
      WETH: "ethereum",
      BTC: "bitcoin",
      WBTC: "wrapped-bitcoin",
      USDC: "usd-coin",
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
      return;
    }

    console.log("✅ Starting REAL-TIME updates from CoinGecko API every 30 seconds!");
    console.log("   Pair:", `${symbolA}/${symbolB}`);
    console.log("   Note: CoinGecko free tier has rate limits (10-50 calls/minute)");

    let updateCounter = 0;

    const fetchLatestPrice = async () => {
      console.log(`\n🚀 === REAL-TIME PRICE UPDATE #${updateCounter + 1} ===`);
      
      if (chartData.length === 0) {
        console.log("❌ No previous data to update from");
        return;
      }
      
      try {
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        updateCounter++;
        
        // Fetch current prices from CoinGecko
        // Using simple price endpoint (faster than market_chart for current price)
        const urlA = `https://api.coingecko.com/api/v3/simple/price?ids=${coinA}&vs_currencies=usd`;
        const urlB = `https://api.coingecko.com/api/v3/simple/price?ids=${coinB}&vs_currencies=usd`;
        
        console.log("🌐 Fetching latest prices from CoinGecko...");
        const fetchStartTime = Date.now();
        
        const [responseA, responseB] = await Promise.all([
          fetch(urlA),
          fetch(urlB)
        ]);
        
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`✅ Fetch completed in ${fetchDuration}ms`);
        
        if (!responseA.ok || !responseB.ok) {
          throw new Error(`API error: ${responseA.status} / ${responseB.status}`);
        }
        
        const dataA = await responseA.json();
        const dataB = await responseB.json();
        
        const priceA = dataA[coinA]?.usd;
        const priceB = dataB[coinB]?.usd;
        
        if (!priceA || !priceB || priceB === 0) {
          throw new Error("Invalid price data received");
        }
        
        // Calculate cross-rate: TokenA/TokenB = priceA/USD / priceB/USD
        const newValue = Number((priceA / priceB).toFixed(6));
        const lastPoint = chartData[chartData.length - 1];
        
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
        
        const newPoint = { time: now, value: newValue };
        
        // Use chart series update method if available (smooth update, no refresh)
        if (chartSeriesRef.current?.series) {
          console.log("  ✅ Using series.update() - SMOOTH addition, no chart refresh");
          try {
            chartSeriesRef.current.series.update(newPoint);
            console.log("  ✅ Point added smoothly to chart via update()!");
            
            // Update local state WITHOUT triggering re-render (for reference only)
            chartData.push(newPoint);
          } catch (error) {
            console.error("  ❌ Error updating series:", error);
            // Fallback to state update
            setChartData(prev => [...prev, newPoint]);
          }
        } else {
          console.log("  ⚠️ Series ref not ready, using setChartData (will refresh chart)");
          setChartData(prev => [...prev, newPoint]);
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

    // Then fetch every 30 seconds (to respect CoinGecko rate limits)
    console.log("⏰ Setting up interval to fetch real prices every 30 seconds");
    let callCount = 0;
    const interval = setInterval(() => {
      callCount++;
      console.log(`\n⏰⏰⏰ INTERVAL FIRED - Call #${callCount} at ${new Date().toLocaleTimeString()}`);
      fetchLatestPrice();
    }, 30000); // 30 seconds

    return () => {
      console.log("🛑 Cleaning up interval - effect is re-running");
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChartOpen, tokenA.symbol, tokenB.symbol]);

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

  function TokenSelector({ selected, tokens, onSelect, side = "left", cardRect, swapTitleRect, swapCardRect }: { selected: Token; tokens: Token[]; onSelect: (t: Token) => void; side?: "left" | "right"; cardRect: DOMRect | null; swapTitleRect?: DOMRect | null; swapCardRect?: DOMRect | null }) {
    const [isDesktop, setIsDesktop] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingSelector, setIsResizingSelector] = useState(false);
  const [resizeEdgeSelector, setResizeEdgeSelector] = useState<string | null>(null);
  const [selectorOffset, setSelectorOffset] = useState({ x: 0, y: 0 });
  const [selectorSize, setSelectorSize] = useState({ width: 360, height: 0 }); // Will match swap card height
    const dragLastRef = useRef<{ x: number; y: number } | null>(null);
    const resizeSelectorStartRef = useRef<{ x: number; y: number; width: number; height: number; offsetX: number; offsetY: number } | null>(null);

    useEffect(() => {
      const check = () => setIsDesktop(window.innerWidth >= 1024);
      check();
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }, []);


    const animateDuration = 260;
    const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");

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
      setShouldRender(true);
      setPhase("closed");
      setSelectorOffset({ x: 0, y: 0 });
      // Match full swap card height
      const matchHeight = swapCardRect?.height || 600;
      setSelectorSize({ width: 360, height: matchHeight });
      console.log("🪙 Token selector height set to match swap card:", matchHeight);
      requestAnimationFrame(() => {
        setPhase("opening");
        setIsOpen(true);
        // After card opening animation completes (0.52s), set phase to "open" to show glow
        setTimeout(() => {
          setPhase("open");
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
      setPhase("closing");
      setIsOpen(false);
      setTimeout(() => {
        setShouldRender(false);
        setPhase("closed");
        setSearchTerm("");
      }, animateDuration);
    };

    const renderList = (tokenSet: Token[]) => (
      <div className="relative h-full overflow-hidden">
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
          className={`relative origin-center transition-all duration-[${animateDuration}ms] ease-out ${
            phase === "opening" || phase === "open"
              ? "scale-y-100 opacity-100"
              : "scale-y-0 opacity-0"
          }`}
        >
          <ul className="max-h-full overflow-y-auto">
            {tokenSet.length ? (
              tokenSet.map((t) => (
                <li key={t.address}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(t);
                      closeDropdown();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                    className={`flex w-full items-center gap-3 rounded-full border border-transparent px-3 py-2 text-left transition-all ${
                      selected.address === t.address
                        ? "bg-white/10 hover:border-white/30"
                        : "hover:border-white/30 hover:bg-white/5"
                    }`}
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
          onClick={() => (isOpen ? closeDropdown() : openDropdown())}
          className="flex items-center gap-2 rounded-full bg-white/10 pl-4 pr-3 py-2 text-sm text-white hover:bg-white/15 w-fit"
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
                }}
              >
                {/* Wrapper for glow effect */}
                <GlowingCardWrapper phase={phase}>
                  <div
                    ref={dropdownRef}
                    className={`pointer-events-auto relative overflow-hidden rounded-[20px] border border-white/15 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)] transition-all flex flex-col ${
                      isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    style={{
                      width: `${selectorSize.width}px`,
                      height: `${selectorSize.height}px`,
                      maxHeight: `${selectorSize.height}px`,
                      backgroundColor: "rgb(12, 14, 22)",
                      backdropFilter: "blur(40px) saturate(180%)",
                      WebkitBackdropFilter: "blur(40px) saturate(180%)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                      transition: isResizingSelector ? "none" : "opacity 0.3s ease",
                      animation: phase === "opening" ? "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards" : phase === "closing" ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
                      zIndex: 0,
                      position: "relative",
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
                  <div className="flex flex-col gap-4 p-6" style={{ height: "calc(100% - 48px)" }}>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search token"
                      autoFocus
                      className="w-full rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                    />
                    <div className="flex-1 overflow-hidden">
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
                </GlowingCardWrapper>
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
                      onClick={closeDropdown}
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
                    autoFocus
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
    <div className="min-h-screen bg-black text-white">
      <Header />

      {/* Simple blur test rectangle */}
      {(isChartOpen || chartPhase === "closing") && (() => {
        console.log("🎨 Rendering Chart Overlay:");
        console.log("  Chart data available:", chartData.length, "points");
        console.log("  Token pair:", tokenA.symbol, "/", tokenB.symbol);
        
        const offsetX = overlayOffset?.x ?? 0;
        const offsetY = overlayOffset?.y ?? 0;
        const transform = isChartMaximized
          ? "translate(-50%, -50%)"
          : `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
        return (
          <div
            className="fixed z-20 pointer-events-none"
            style={{
              top: "50%",
              left: "50%",
              transform,
            }}
          >
            <GlowingCardWrapper 
              phase={chartPhase}
              glowGradient="linear-gradient(90deg, #38bdf8, #6366f1, #ec4899, #f472b6, #06b6d4, #3b82f6, #8b5cf6, #38bdf8)"
            >
              <div
                className="pointer-events-auto relative rounded-[20px] border border-white/15 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)]"
                style={{
                  width: chartSize.width > 0 ? `${chartSize.width}px` : (isChartMaximized ? "80vw" : "92vw"),
                  maxWidth: chartSize.width > 0 ? "none" : (isChartMaximized ? "none" : "1100px"),
                  height: chartSize.height > 0 ? `${chartSize.height}px` : (isChartMaximized ? "90vh" : "77vh"),
                  maxHeight: chartSize.height > 0 ? "none" : (isChartMaximized ? "none" : "840px"),
                  backgroundColor: "rgb(12, 14, 22)",
                  backdropFilter: "blur(40px) saturate(180%)",
                  WebkitBackdropFilter: "blur(40px) saturate(180%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                  transition: isResizing ? "none" : "width 0.3s ease, height 0.3s ease",
                  animation: chartPhase === "opening" ? "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards" : chartPhase === "closing" ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
                  zIndex: 1,
                  position: "relative",
                }}
              >
                {/* Header with drag and buttons */}
                <div
                  className={`flex h-12 items-center justify-between px-4 border-b border-white/10 ${
                    isChartMaximized || isDraggingChart ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  onPointerDown={handleOverlayPointerDown}
                >
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
                  <div className="flex items-center gap-3">
                    {/* Maximize button - 20% bigger */}
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
                    {/* Close button - 20% bigger */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseChart();
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
                </div>
                {/* Lightweight Chart */}
                <div
                  key={`chart-${tokenA.symbol}-${tokenB.symbol}`}
                  className="absolute overflow-hidden"
                  style={{
                    top: "48px",
                    left: "0",
                    right: "0",
                    bottom: "0",
                    borderBottomLeftRadius: "20px",
                    borderBottomRightRadius: "20px",
                  }}
                >
                  {chartData.length > 0 ? (
                    <div className="relative w-full h-full">
                      <LightweightChart 
                        key={`lw-${tokenA.symbol}-${tokenB.symbol}`} 
                        data={chartData}
                        pulseColor={latestPriceChange === "up" ? "#10b981" : latestPriceChange === "down" ? "#ef4444" : "#3b82f6"}
                        showPulse={showPulse}
                        permanentDotColor={permanentDotColor}
                        onSeriesReady={(series, chart) => {
                          console.log("📢 Chart series ready, storing reference");
                          chartSeriesRef.current = { series, chart };
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                      <LoadingAnimation />
                      <p className="text-sm text-white/40 font-medium">Loading chart data...</p>
                    </div>
                  )}
                </div>
              </div>
            </GlowingCardWrapper>
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
                  className={`relative z-10 flex h-12 items-center justify-between border-b border-white/10 bg-white/5 px-6 backdrop-blur-xl backdrop-saturate-[180%] ${
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

      {/* Main swap interface */}
      <main className="relative z-10 flex min-h-screen flex-col items-center px-4" style={{ paddingTop: "15vh" }}>
        {/* Fixed section wrapper - Isolated from dynamic content to prevent centering shifts */}
        <div ref={fixedSectionRef} className="w-full max-w-md" style={{ position: "relative", flexShrink: 0 }}>
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
                <div className="px-8">
                <div ref={cardRef}>

            <div className="mb-4 mt-6 flex items-center justify-end gap-2 text-xs text-white/50">
              <span>Display values in</span>
              {(["USD", "EUR", "GBP"] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setFiatCurrency(code)}
                  className={`rounded-full border px-2 py-1 transition ${
                    fiatCurrency === code
                      ? "border-white/40 bg-white/15 text-white"
                      : "border-white/15 text-white/60 hover:border-white/25 hover:text-white"
                  }`}
                  type="button"
                >
                  {code}
                </button>
              ))}
            </div>

            <div className="relative flex flex-col" style={{ isolation: "auto" }}>
                {/* Cards container - Fixed position, doesn't shift */}
                <div className="flex flex-col flex-shrink-0">
                  {/* You pay card - ALWAYS on top */}
                  <div className="rounded-2xl bg-transparent border border-white/10 p-4" style={{ minHeight: "120px", height: "120px", position: "relative", zIndex: 1 }}>
                    <div className="mb-1">
                      <span className="text-sm text-white/60">You pay</span>
                    </div>
                    <div className="flex items-center gap-3 h-full">
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
                  <div className="flex justify-center -my-4 relative" style={{ zIndex: 20, isolation: "auto" }}>
                    <button
                      onClick={() => setDirection(direction === "a-to-b" ? "b-to-a" : "a-to-b")}
                      className="rounded-lg p-2 transition-all hover:scale-105 relative"
                      style={{
                        background: "rgba(255, 255, 255, 0.1)",
                        backdropFilter: "blur(20px) saturate(180%)",
                        WebkitBackdropFilter: "blur(20px) saturate(180%)",
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        boxShadow: "0 0 0 7px rgba(0, 0, 0, 0.7), 0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)",
                        position: "relative",
                      }}
                    >
                      <svg
                        className="h-5 w-5 text-white"
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
                  <div className="rounded-2xl bg-white/5 p-4" style={{ minHeight: "120px", height: "120px" }}>
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
            className="w-full px-8 flex flex-col space-y-4"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: "24px",
              zIndex: 10,
            }}
          >
            {/* Exchange Rate Display - Always reserves space to prevent flickering */}
            {(amountIn || amountOutValue) && (
            <div className="rounded-xl bg-white/5 overflow-hidden" style={{ minHeight: "48px" }}>
                    <button
                      onClick={() => quote && amountIn && amountOutValue && setShowDetails(!showDetails)}
                      disabled={!quote || !amountIn || !amountOutValue}
                      className="w-full px-4 py-3 flex items-center justify-between text-xs hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-default"
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
                  className="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="rounded-full border border-white/20 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:border-white/30 hover:text-white w-full"
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
                    className="rounded-full border border-yellow-500/30 px-3 py-1.5 text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="rounded-full border border-yellow-500/30 px-3 py-1.5 text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reconnect Wallet
                  </button>
                </div>
              </div>
            )}

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
              className="rounded-full border border-white/20 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:border-white/30 hover:text-white w-full"
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
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Swap failed. Check console for details.
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
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
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white"
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
      </main>

      <style jsx global>{`
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
      `}</style>
    </div>
  );
}

