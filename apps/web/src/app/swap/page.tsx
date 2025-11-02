"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { formatUnits, parseUnits, maxUint256 } from "viem";
import type { UTCTimestamp } from "lightweight-charts";

import { poolManagerAbi } from "../../lib/abi/poolManager";
import { quoterAbi } from "../../lib/abi/quoter";
import { erc20Abi } from "../../lib/abi/erc20";
import LightweightChart from "./components/LightweightChart";


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
  
  const { address, isConnecting, isConnected } = useAccount();
  const { connect, error: connectError, isPending: isConnectPending } = useConnect({
    connector: injected({ shimDisconnect: true }),
  });
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Debug: Monitor connection state
  useEffect(() => {
    console.log("\n🔌 Connection State Changed:");
    console.log("  Address:", address || "❌ Not connected");
    console.log("  Is Connected:", isConnected ? "✅" : "❌");
    console.log("  Is Connecting:", isConnecting ? "⏳" : "✅");
    console.log("  Public Client:", publicClient ? "✅" : "❌");
    console.log("  Wallet Client:", walletClient ? "✅" : "❌");
  }, [address, isConnected, isConnecting, publicClient, walletClient]);

  const [amountIn, setAmountIn] = useState<string>("");
  const [amountOutValue, setAmountOutValue] = useState<string>("");
  const [activeField, setActiveField] = useState<"in" | "out">("in");
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [isChartMaximized, setIsChartMaximized] = useState(false);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [overlayOffset, setOverlayOffset] = useState({ x: 0, y: 0 });
  const overlayOffsetRef = useRef({ x: 0, y: 0 });
  const overlayPointerIdRef = useRef<number | null>(null);
  const overlayDragLastRef = useRef<{ x: number; y: number } | null>(null);
  const [isDraggingChart, setIsDraggingChart] = useState(false);
  // Token list (add ~10 entries; only sWETH/sUSDC are active on local)
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
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      address: "0x0000000000000000000000000000000000000003",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
    },
    {
      symbol: "WBTC",
      name: "Wrapped Bitcoin",
      address: "0x0000000000000000000000000000000000000004",
      decimals: 8,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
    },
    {
      symbol: "LINK",
      name: "Chainlink",
      address: "0x0000000000000000000000000000000000000005",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
    },
    {
      symbol: "UNI",
      name: "Uniswap",
      address: "0x0000000000000000000000000000000000000006",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
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
      symbol: "AAVE",
      name: "Aave",
      address: "0x0000000000000000000000000000000000000008",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7E9c93437bFc5Ac33E2DDaE9/logo.png",
    },
    {
      symbol: "COMP",
      name: "Compound",
      address: "0x0000000000000000000000000000000000000009",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xc00e94Cb662C3520282E6f5717214004A7f26888/logo.png",
    },
    {
      symbol: "ARB",
      name: "Arbitrum",
      address: "0x000000000000000000000000000000000000000a",
      decimals: 18,
      icon:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png",
    },
  ];

  const defaultA = tokens[0];
  const defaultB = tokens[1];

  console.log("\n🎲 Initial Token State:");
  console.log("  Default Token A:", defaultA.symbol, defaultA.address);
  console.log("  Default Token B:", defaultB.symbol, defaultB.address);

  const [tokenA, setTokenA] = useState<Token>(defaultA);
  const [tokenB, setTokenB] = useState<Token>(defaultB);
  const [direction, setDirection] = useState<SwapDirection>("a-to-b");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const swapTitleRef = useRef<HTMLDivElement | null>(null);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [swapTitleRect, setSwapTitleRect] = useState<DOMRect | null>(null);
  const [chartData, setChartData] = useState<AreaData[]>([]);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
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
  const zeroForOne = direction === "a-to-b"; // swap from tokenA to tokenB
  const inputDecimals = direction === "a-to-b" ? tokenA.decimals : tokenB.decimals;
  const outputDecimals = direction === "a-to-b" ? tokenB.decimals : tokenA.decimals;
  const inputToken = direction === "a-to-b" ? tokenA.address : tokenB.address;
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
    setIsChartOpen(true);
  };

  const [chartDisappearing, setChartDisappearing] = useState(false);

  const handleCloseChart = () => {
    setChartDisappearing(true);
    setTimeout(() => {
      setIsChartOpen(false);
      setChartDisappearing(false);
    }, 600); // 400ms * 1.5 = 600ms
  };

  useEffect(() => {
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
  }, [direction, tokenA, tokenB]);

  useEffect(() => {
    const updateRect = () => {
      if (cardRef.current) {
        setCardRect(cardRef.current.getBoundingClientRect());
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
      console.log("Zero for One:", zeroForOne);
      console.log("Quoter Address:", quoterAddress);

      setIsQuoting(true);
      setQuoteError(null);

      try {
        const quoteStartTime = Date.now();
        const result = await publicClient.readContract({
          address: quoterAddress,
          abi: quoterAbi,
          functionName: "quote",
          args: [
            {
              asset0: tokenA.address,
              asset1: tokenB.address,
              quoter: quoterAddress,
              amount: amountInBigInt,
              asset0Balance: 0n,
              asset1Balance: 0n,
              bucketID: 0,
              zeroForOne,
              functionFlags: 0,
            },
            "0x",
          ],
        }) as bigint;

        const quoteDuration = Date.now() - quoteStartTime;

        if (cancelled) {
          console.log("⚠️  Quote cancelled");
          return;
        }

        const formattedOut = formatUnits(result, outputDecimals);
        const trimmedOut = trimTrailingZeros(formattedOut);

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
      } catch (error) {
        if (!cancelled) {
          console.error("❌ Quote failed:");
          console.error(error);
          setQuoteError("Unable to fetch quote. Ensure quoter address is correct.");
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
              asset0: tokenA.address,
              asset1: tokenB.address,
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
        } catch (error) {
          if (!cancelled) {
            console.error("❌ Failed to invert quote:", error);
            setQuoteError("Unable to fetch quote. Ensure quoter address is correct.");
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
        !address
      ) {
        setAllowance(null);
        setAllowanceError(null);
        return;
      }

      setIsFetchingAllowance(true);
      setAllowanceError(null);
      try {
        const result = await publicClient.readContract({
          address: inputToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, env.poolManagerAddress],
        });
        setAllowance(result as bigint);
      } catch (error) {
        console.error("Failed to fetch allowance", error);
        setAllowanceError("Unable to fetch allowance.");
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
    console.log("  Wallet Client:", walletClient ? "✅" : "❌");
    console.log("  Public Client:", publicClient ? "✅" : "❌");
    console.log("  Pool Manager:", env.poolManagerAddress || "❌ NOT SET");
    console.log("  Pool Markings:", env.poolMarkings || "❌ NOT SET");
    console.log("  Pair Supported:", supportsPair ? "✅" : "❌");
    
    if (!walletClient || !publicClient || !env.poolManagerAddress || !env.poolMarkings || !supportsPair) {
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
      console.log("  Token A:", tokenA.symbol, `(${tokenA.address})`);
      console.log("  Token B:", tokenB.symbol, `(${tokenB.address})`);
      console.log("  Quoter:", env.quoterAddress);
      console.log("  Pool Markings:", env.poolMarkings);
      console.log("  Amount In:", formatUnits(parsedAmountIn, inputDecimals), amountInSymbol);
      console.log("  Amount In (Raw):", parsedAmountIn.toString());
      console.log("  Zero For One:", zeroForOne);
      console.log("  Expected Out:", quote.amountOut, amountOutSymbol);
      console.log("  Expected Out (Raw):", quote.rawAmountOut.toString());
      console.log("  Min Amount Out:", formatUnits(minAmountOut, outputDecimals), amountOutSymbol);
      console.log("  Min Amount Out (Raw):", minAmountOut.toString());
      console.log("  Slippage:", DEFAULT_SLIPPAGE_BPS / 100, "%");

      console.log("\n⏳ Sending transaction...");
      const txStartTime = Date.now();

      const result = await walletClient.writeContract({
        address: env.poolManagerAddress,
        abi: poolManagerAbi,
        functionName: "swap",
        args: [
          tokenA.address,
          tokenB.address,
          env.quoterAddress,
          env.poolMarkings as `0x${string}`,
          parsedAmountIn,
          zeroForOne,
          minAmountOut,
        ],
        value: 0n,
      });

      const txDuration = Date.now() - txStartTime;

      console.log("\n✅ SWAP TRANSACTION SUCCESS!");
      console.log("  Transaction Hash:", result);
      console.log("  Time to Submit:", txDuration + "ms");
      console.log("  Explorer:", `${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://sepolia.etherscan.io"}/tx/${result}`);

      setTxHash(result);
      setTxStatus("success");
    } catch (error) {
      console.log("\n❌ SWAP TRANSACTION FAILED!");
      console.error("Error details:", error);
      
      if (error && typeof error === 'object') {
        console.log("Error type:", error.constructor?.name);
        if ('message' in error) console.log("Message:", error.message);
        if ('code' in error) console.log("Code:", error.code);
        if ('data' in error) console.log("Data:", error.data);
      }
      
      setTxStatus("error");
      setQuoteError("Swap transaction failed. Check console for details.");
    }
  };

  const handleApprove = async () => {
    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║            ✓ REQUESTING TOKEN APPROVAL               ║");
    console.log("╚═══════════════════════════════════════════════════════╝");
    
    console.log("Approval checks:");
    console.log("  Wallet Client:", walletClient ? "✅" : "❌");
    console.log("  Pool Manager:", env.poolManagerAddress || "❌ NOT SET");
    console.log("  Is Native Input:", isNativeInput ? "✅ (no approval needed)" : "❌");
    
    if (!walletClient || !env.poolManagerAddress || isNativeInput) {
      console.log("❌ Approval aborted: Pre-conditions not met");
      return;
    }

    try {
      console.log("\n📝 Approval Parameters:");
      console.log("  Token:", amountInSymbol, `(${inputToken})`);
      console.log("  Spender:", env.poolManagerAddress);
      console.log("  Amount:", "Unlimited (maxUint256)");
      console.log("  Current Allowance:", allowance?.toString() || "unknown");
      
      setIsApproving(true);
      setAllowanceError(null);
      
      console.log("\n⏳ Sending approval transaction...");
      const approvalStartTime = Date.now();
      
      const result = await walletClient.writeContract({
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
    } catch (error) {
      console.log("\n❌ APPROVAL TRANSACTION FAILED!");
      console.error("Error details:", error);
      
      if (error && typeof error === 'object') {
        console.log("Error type:", error.constructor?.name);
        if ('message' in error) console.log("Message:", error.message);
        if ('code' in error) console.log("Code:", error.code);
      }
      
      setAllowanceError("Approval failed. Check console for details.");
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

  useEffect(() => {
    if (!isDraggingChart) return;

    const handleMove = (event: PointerEvent) => {
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
    };

    const handleUp = (event: PointerEvent) => {
      if (overlayPointerIdRef.current !== null && event.pointerId !== overlayPointerIdRef.current) {
        return;
      }
      overlayPointerIdRef.current = null;
      overlayDragLastRef.current = null;
      setIsDraggingChart(false);
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
          
          const points = [];
          
          for (let i = 0; i < minLength; i++) {
            const timeA = Math.floor(dataA.prices[i][0] / 1000);
            const priceA = dataA.prices[i][1];
            const priceB = dataB.prices[i][1];
            
            if (priceB > 0) {
              const ratio = priceA / priceB;
              points.push({
                time: timeA as UTCTimestamp,
                value: Number(ratio.toFixed(6)),
              });
            }
          }
          
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

  // Live price updates - USING DUMMY DATA for testing pulse animation
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

    console.log("✅ Starting DUMMY DATA updates every 5 seconds!");
    console.log("   Random movement: -1% to +1% (normal distribution)");
    console.log("   Every 15 seconds: 0% movement (blue ripple test)");

    let updateCounter = 0;

    // Normal distribution random number generator (Box-Muller transform)
    const randomNormal = () => {
      const u1 = Math.random();
      const u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const generateDummyUpdate = () => {
      console.log("\n🚀 === DUMMY UPDATE ===");
      
      if (chartData.length === 0) {
        console.log("❌ No previous data to update from");
        return;
      }
      
      const lastPoint = chartData[chartData.length - 1];
      const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
      
      updateCounter++;
      
      let percentChange: number;
      let changePercent: number;
      
      // Every 3rd update (15 seconds): 0% movement
      if (updateCounter % 3 === 0) {
        percentChange = 1.0;
        changePercent = 0;
        console.log("🔵 BLUE RIPPLE TEST - Zero movement (update #" + updateCounter + ")");
      } else {
        // Random movement with normal distribution
        // Mean = 0%, Std Dev = 0.3% (so ±1% is ~3 standard deviations, rare)
        const randomChange = randomNormal() * 0.003; // 0.3% std dev
        // Clamp to -1% to +1%
        const clampedChange = Math.max(-0.01, Math.min(0.01, randomChange));
        
        percentChange = 1 + clampedChange;
        changePercent = clampedChange * 100;
        
        console.log("🎲 Random movement generated:");
        console.log("  Raw normal value:", randomChange.toFixed(6));
        console.log("  Clamped to ±1%:", clampedChange.toFixed(6));
      }
      
      const newValue = Number((lastPoint.value * percentChange).toFixed(6));
      
      // Determine direction
      let direction: "up" | "down" | "same";
      if (newValue > lastPoint.value) {
        direction = "up";
      } else if (newValue < lastPoint.value) {
        direction = "down";
      } else {
        direction = "same";
      }
      
      console.log("📊 DUMMY DATA GENERATED:");
      console.log("  Update #:", updateCounter);
      console.log("  Previous value:", lastPoint.value);
      console.log("  Change percent:", changePercent >= 0 ? "+" + changePercent.toFixed(4) : changePercent.toFixed(4), "%");
      console.log("  Multiplier:", percentChange.toFixed(6));
      console.log("  New value:", newValue);
      console.log("  Direction:", direction.toUpperCase());
      console.log("  Expected color:", direction === "up" ? "🟢 GREEN" : direction === "down" ? "🔴 RED" : "🔵 BLUE");
      console.log("  Time:", new Date(now * 1000).toISOString());
      console.log("  Next update in: 5 seconds");
      
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
      console.log("  Logic: up=GREEN(#10b981), down=RED(#ef4444), same=BLUE(#3b82f6)");
      console.log("  💎 Permanent dot will keep this color until next update");
      
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
      
      console.log("🏁 === DUMMY UPDATE COMPLETED ===\n");
    };

    // Generate first dummy update immediately
    console.log("⏰ Generating first dummy update IMMEDIATELY");
    generateDummyUpdate();

    // Then generate every 5 seconds
    console.log("⏰ Setting up interval to generate dummy data every 5 seconds");
    let callCount = 0;
    const interval = setInterval(() => {
      callCount++;
      console.log(`\n⏰⏰⏰ INTERVAL FIRED - Call #${callCount} at ${new Date().toLocaleTimeString()}`);
      generateDummyUpdate();
    }, 5000);

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

  function TokenSelector({ selected, tokens, onSelect, side = "left", cardRect }: { selected: Token; tokens: Token[]; onSelect: (t: Token) => void; side?: "left" | "right"; cardRect: DOMRect | null }) {
    const [isDesktop, setIsDesktop] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

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
      requestAnimationFrame(() => {
        setPhase("opening");
        setIsOpen(true);
      });
    };

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
        {shouldRender && isDesktop && cardRect
          ? createPortal(
              <div
                className={`fixed z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-black/95 px-[18px] pb-4 pt-6 shadow-2xl backdrop-blur-2xl transition-all duration-[${animateDuration}ms] ${
                  isOpen ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-3"
                }`}
                style={{
                  top: cardRect.top,
                  bottom: 24,
                  left:
                    side === "left"
                      ? Math.max(16, cardRect.left - 50 - 288)
                      : Math.min(window.innerWidth - 16 - 288, cardRect.right + 50),
                }}
              >
                <div className="flex h-full flex-col gap-4">
                  <div className="relative flex items-center justify-center pt-2 text-xs text-white/60">
                    <span className="bg-gradient-to-r from-[#38bdf8] via-[#6366f1] to-[#ec4899] bg-clip-text text-base font-semibold tracking-wide text-transparent">
                      Select a token
                    </span>
                    <button
                      type="button"
                      onClick={closeDropdown}
                      className="absolute right-0 flex h-8 w-8 items-center justify-center rounded-full text-2xl leading-none text-white/70 transition hover:bg-white/10 hover:text-white"
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
                    className="w-full rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                  />
                  <div className="flex-1 pt-3">
                    {renderList(tokensToDisplay)}
                  </div>
                </div>
              </div>,
              document.body
            )
          :
          shouldRender &&
            createPortal(
              <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-[${animateDuration}ms] ${
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
                      className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full text-3xl leading-none text-white/70 transition hover:bg-white/10 hover:text-white"
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
      {/* Header matching main website */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-2xl backdrop-saturate-[180%]">
        <div className="mx-auto flex h-11 max-w-[980px] items-center justify-between px-6">
          <a href="/" className="flex items-center">
            <img
              src="/stoix full white.png"
              alt="Stoix"
              className="h-6 w-auto"
            />
          </a>
          <nav className="hidden items-center gap-8 text-xs font-normal text-white/80 md:flex">
            <a href="/swap" className="text-white">Swap</a>
            <a href="/liquidity" className="transition-colors hover:text-white">Liquidity</a>
            <a href="/pools" className="transition-colors hover:text-white">Pools</a>
            <a href="/positions" className="transition-colors hover:text-white">Positions</a>
            <a href="/analytics" className="transition-colors hover:text-white">Analytics</a>
          </nav>
          <div className="flex items-center gap-6">
            <a
              href="/"
              className="rounded-full bg-[#007AFF] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#0066CC]"
            >
              Back to Protocol
            </a>
          </div>
        </div>
      </header>

      {/* Simple blur test rectangle */}
      {(isChartOpen || chartDisappearing) && (() => {
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
            <div
              className="pointer-events-auto relative rounded-[20px] border border-white/15 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)]"
              style={{
                width: isChartMaximized ? "80vw" : "92vw",
                maxWidth: isChartMaximized ? "none" : "1100px",
                height: isChartMaximized ? "90vh" : "77vh",
                maxHeight: isChartMaximized ? "none" : "840px",
                backgroundColor: "rgba(12, 14, 22, 0.25)",
                backdropFilter: "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                transition: "width 0.3s ease, height 0.3s ease",
                animation: chartDisappearing 
                  ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                  : "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards",
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
          </div>
        );
      })()}

      {/* Main swap interface */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div ref={swapTitleRef} className="w-full max-w-md text-center mb-8 space-y-4">
          <h1
            className="bg-clip-text text-3xl font-semibold text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #9333ea, #a855f7, #d946ef, #ec4899, #f472b6, #06b6d4, #3b82f6, #6366f1, #8b5cf6, #9333ea)",
              backgroundSize: "150% 100%",
              animation: "swapGradientShift 12s linear infinite",
              WebkitAnimation: "swapGradientShift 12s linear infinite",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            Swap tokens
          </h1>
        </div>
        <div className="w-full max-w-md px-6">
          <div className="mb-3 pl-6 text-left text-xs font-medium py-2">
            <span 
              className="font-medium tracking-wide"
              style={{
                background: "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.8) 70%, rgba(255,255,255,0.5) 100%)",
                backgroundSize: "200% 100%",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 3s ease-in-out infinite",
              }}
            >
              {spotRateDisplay}
            </span>
          </div>
          <div ref={cardRef} className="rounded-[28px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
            {!configReady && (
              <div className="mb-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                Swap not configured. Check environment variables.
              </div>
            )}

            {connectError && (
              <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {connectError.message}
              </div>
            )}

            <div className="mb-4 flex items-center justify-end gap-2 text-xs text-white/50">
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

            <div className="space-y-3">
                {/* Input */}
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-white/60">You pay</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <TokenSelector
                      selected={tokenA}
                      tokens={tokens}
                      onSelect={(t) => {
                        if (t.address === tokenB.address) {
                          setTokenA(tokenB);
                          setTokenB(t);
                          setDirection(direction === "a-to-b" ? "b-to-a" : "a-to-b");
                        } else {
                          setTokenA(t);
                        }
                      }}
                      side="left"
                      cardRect={cardRect}
                    />
                    <div className="flex-1 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.0"
                        value={formatWithCommas(amountIn)}
                        onChange={(e) => handleAmountInChange(e.target.value)}
                        onFocus={() => setActiveField("in")}
                        className="w-full bg-transparent text-3xl font-medium text-white text-right outline-none placeholder:text-white/30"
                      />
                      <div className="mt-1 text-xs text-white/40">
                        {(() => {
                          const normalized = amountIn.endsWith(".") ? amountIn.slice(0, -1) : amountIn;
                          if (!normalized) return "";
                          const numeric = Number(normalized);
                          if (!Number.isFinite(numeric) || numeric <= 0) return "";
                          const fiatValue = numeric * fiatRates[fiatCurrency];
                          return `≈ ${fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Switch button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setDirection(direction === "a-to-b" ? "b-to-a" : "a-to-b")}
                    className="rounded-full border border-white/10 bg-black p-2 transition hover:bg-white/5"
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

                {/* Output */}
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-white/60">You receive</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-left relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.0"
                        value={formatWithCommas(amountOutValue)}
                        onChange={(e) => handleAmountOutChange(e.target.value)}
                        onFocus={() => setActiveField("out")}
                        className="w-full bg-transparent text-3xl font-medium text-white text-left outline-none placeholder:text-white/30"
                      />
                      {isQuoting && activeField === "in" && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1">
                          <div className="w-1 h-3 rounded-full bg-blue-400/60" style={{ animation: "loadingPulse 1s ease-in-out infinite" }} />
                          <div className="w-1 h-3 rounded-full bg-purple-400/60" style={{ animation: "loadingPulse 1s ease-in-out 0.2s infinite" }} />
                          <div className="w-1 h-3 rounded-full bg-pink-400/60" style={{ animation: "loadingPulse 1s ease-in-out 0.4s infinite" }} />
                        </div>
                      )}
                      <div className="mt-1 text-xs text-white/40">
                        {(() => {
                          const normalized = amountOutValue.endsWith(".") ? amountOutValue.slice(0, -1) : amountOutValue;
                          if (!normalized) return "";
                          const numeric = Number(normalized);
                          if (!Number.isFinite(numeric) || numeric <= 0) return "";
                          const fiatValue = numeric * fiatRates[fiatCurrency];
                          return `≈ ${fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}`;
                        })()}
                      </div>
                    </div>
                    <TokenSelector
                      selected={tokenB}
                      tokens={tokens}
                      onSelect={(t) => {
                        if (t.address === tokenA.address) {
                          setTokenB(tokenA);
                          setTokenA(t);
                          setDirection(direction === "a-to-b" ? "b-to-a" : "a-to-b");
                        } else {
                          setTokenB(t);
                        }
                      }}
                      side="right"
                      cardRect={cardRect}
                    />
                  </div>
                </div>

                {/* Info */}
                {quote && (
                  <div className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/60">
                    <div className="flex justify-between">
                      <span>Slippage tolerance</span>
                      <span>0.5%</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span>Rate</span>
                      <span>
                        1 {amountInSymbol} ≈ {(() => {
                          const normalizedIn = amountIn.endsWith(".") ? amountIn.slice(0, -1) : amountIn;
                          if (!normalizedIn) return "-";
                          const inNumber = Number(normalizedIn);
                          const outNumber = Number(quote.amountOut);
                          if (!Number.isFinite(inNumber) || inNumber === 0 || !Number.isFinite(outNumber)) {
                            return "-";
                          }
                          const rate = outNumber / inNumber;
                          if (!Number.isFinite(rate)) return "-";
                          return `${rate.toFixed(6)} ${amountOutSymbol}`;
                        })()}
                      </span>
                    </div>
                  </div>
                )}

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

                {/* Approve button */}
                {!isNativeInput && needsApproval && (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || isFetchingAllowance || !configReady}
                    className="rounded-full border border-white/20 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:border-white/30 hover:text-white w-full"
                  >
                    {isApproving ? "Approving..." : `Approve ${amountInSymbol}`}
                  </button>
                )}

                {/* Swap button */}
                <button
                  onClick={() => {
                    if (!isConnected) {
                      connect();
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
                    isConnectPending
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

                {/* Success/Error */}
                {txStatus === "success" && txHash && (
                  <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                    <div className="mb-1 font-medium">Swap successful!</div>
                    <a
                      href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://sepolia.etherscan.io"}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-300 underline hover:text-emerald-200"
                    >
                      View transaction
                    </a>
                  </div>
                )}

                {txStatus === "error" && (
                  <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    Swap failed. Check console for details.
                  </div>
                )}
              </div>
          </div>
        </div>
        
        {/* Loading Animation */}
        {isLoadingChartData && (
          <div className="mt-6 flex flex-col items-center justify-center gap-3">
            <LoadingAnimation />
            <p className="text-xs text-white/50 font-medium">Loading chart data...</p>
          </div>
        )}
        
        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={handleOpenChart}
            disabled={isLoadingChartData}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            View live chart
          </button>
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

