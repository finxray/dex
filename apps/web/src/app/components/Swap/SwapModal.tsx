"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { formatUnits, parseUnits, maxUint256 } from "viem";

import { useSwapModal } from "../../../lib/swap-modal-context";
import { poolManagerAbi } from "../../../lib/abi/poolManager";
import { quoterAbi } from "../../../lib/abi/quoter";
import { erc20Abi } from "../../../lib/abi/erc20";

type SwapDirection = "eth-to-usdc" | "usdc-to-eth";

const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

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

export function SwapModal() {
  const { isOpen, closeModal } = useSwapModal();
  const { address, isConnecting, isConnected } = useAccount();
  const { connect, error: connectError, isPending: isConnectPending } = useConnect({
    connector: injected({ shimDisconnect: true }),
  });
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountIn, setAmountIn] = useState<string>("");
  const [direction, setDirection] = useState<SwapDirection>("eth-to-usdc");
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);
  const [isFetchingAllowance, setIsFetchingAllowance] = useState(false);

  const amountOutSymbol = direction === "eth-to-usdc" ? env.asset1Symbol : env.asset0Symbol;
  const amountInSymbol = direction === "eth-to-usdc" ? env.asset0Symbol : env.asset1Symbol;
  const zeroForOne = direction === "eth-to-usdc";
  const inputDecimals = direction === "eth-to-usdc" ? env.asset0Decimals : env.asset1Decimals;
  const outputDecimals = direction === "eth-to-usdc" ? env.asset1Decimals : env.asset0Decimals;
  const inputToken = zeroForOne ? env.asset0 : env.asset1;
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

  useEffect(() => {
    if (!isOpen) {
      setAmountIn("");
      setQuote(null);
      setQuoteError(null);
      setTxStatus("idle");
      setTxHash(null);
      setAllowance(null);
      setAllowanceError(null);
      setIsApproving(false);
      setIsFetchingAllowance(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!publicClient || !env.quoterAddress || !parsedAmountIn || parsedAmountIn === 0n) {
        setQuote(null);
        return;
      }
      setIsQuoting(true);
      setQuoteError(null);
      try {
        const amount0Balance = 0n;
        const amount1Balance = 0n;

        const result = await publicClient.readContract({
          address: env.quoterAddress,
          abi: quoterAbi,
          functionName: "quote",
          args: [
            {
              asset0: env.asset0,
              asset1: env.asset1,
              quoter: env.quoterAddress,
              amount: parsedAmountIn,
              asset0Balance: BigInt(amount0Balance),
              asset1Balance: BigInt(amount1Balance),
              bucketID: 0,
              zeroForOne,
              functionFlags: 0,
            },
            "0x",
          ],
        });

        const formatted = formatUnits(result as bigint, outputDecimals);
        setQuote({ amountOut: formatted, rawAmountOut: result as bigint });
      } catch (error) {
        console.error("Failed to fetch quote", error);
        setQuote(null);
        setQuoteError("Unable to fetch quote. Ensure quoter address is correct.");
      } finally {
        setIsQuoting(false);
      }
    };

    fetchQuote();
  }, [publicClient, env.quoterAddress, parsedAmountIn, zeroForOne, outputDecimals]);

  useEffect(() => {
    const fetchAllowance = async () => {
      if (
        !isOpen ||
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
    isOpen,
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
  const allowanceDisplay = !requiresApproval
    ? "N/A"
    : isFetchingAllowance
    ? "Checking..."
    : allowance === null
    ? "--"
    : allowance >= maxUint256 / 2n
    ? "Unlimited"
    : Number.parseFloat(formatUnits(allowance, inputDecimals)).toFixed(4);

  const handleSwap = async () => {
    if (!walletClient || !publicClient || !env.poolManagerAddress || !env.poolMarkings) {
      setQuoteError("Swap configuration is incomplete. Check environment variables.");
      return;
    }
    if (!parsedAmountIn || parsedAmountIn === 0n) {
      setQuoteError("Enter an amount to swap.");
      return;
    }
    if (!quote) {
      setQuoteError("Quote unavailable.");
      return;
    }
    if (requiresApproval && needsApproval) {
      setQuoteError("Please approve the token before swapping.");
      return;
    }

    try {
      setTxStatus("pending");
      setQuoteError(null);

      const minAmountOut = quote.rawAmountOut - (quote.rawAmountOut * BigInt(DEFAULT_SLIPPAGE_BPS)) / 10_000n;

      const result = await walletClient.writeContract({
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
        value: 0n,
      });

      setTxHash(result);
      setTxStatus("success");
    } catch (error) {
      console.error("Swap failed", error);
      setTxStatus("error");
      setQuoteError("Swap transaction failed. Check console for details.");
    }
  };

  const handleApprove = async () => {
    if (!walletClient || !env.poolManagerAddress || isNativeInput) return;

    try {
      setIsApproving(true);
      setAllowanceError(null);
      await walletClient.writeContract({
        address: inputToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [env.poolManagerAddress, maxUint256],
      });
      setAllowance(maxUint256);
    } catch (error) {
      console.error("Approval failed", error);
      setAllowanceError("Approval failed. Check console for details.");
    } finally {
      setIsApproving(false);
    }
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/80 p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">Stoix Swap</h2>
            <p className="text-sm text-white/50">Single-pool swap prototype (ETH/USDC)</p>
          </div>
          <button
            onClick={closeModal}
            className="rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
          >
            Close
          </button>
        </div>

        {!configReady && (
          <div className="mb-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Swap configuration incomplete. Set <code className="mx-1 rounded bg-black/40 px-1">NEXT_PUBLIC_POOL_MANAGER_ADDRESS</code>,
            <code className="mx-1 rounded bg-black/40 px-1">NEXT_PUBLIC_QUOTER_ADDRESS</code> and
            <code className="mx-1 rounded bg-black/40 px-1">NEXT_PUBLIC_POOL_MARKINGS</code> in <code>.env.local</code>.
          </div>
        )}

        {!isConnected ? (
          <button
            onClick={() => connect()}
            disabled={isConnecting || isConnectPending}
            className="w-full rounded-2xl bg-white text-black py-3 font-medium transition hover:bg-white/80"
          >
            {isConnecting || isConnectPending ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : connectError ? (
          <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {connectError.message}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/50">
                Connected as <span className="text-white">{address}</span>
              </div>
              <button onClick={() => disconnect()} className="text-sm text-white/50 hover:text-white/80">
                Disconnect
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm text-white/60">
                From
                <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <input
                    className="w-full bg-transparent text-2xl text-white focus:outline-none"
                    placeholder="0.0"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                  />
                  <span className="text-white/60 text-sm">{amountInSymbol}</span>
                </div>
              </label>

              <button
                onClick={() => setDirection(direction === "eth-to-usdc" ? "usdc-to-eth" : "eth-to-usdc")}
                className="mx-auto block rounded-full border border-white/10 px-4 py-1 text-sm text-white/60 hover:bg-white/10"
              >
                Switch Direction
              </button>

              <label className="block text-sm text-white/60">
                To
                <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <div className="text-2xl text-white">
                    {quote ? Number(quote.amountOut).toFixed(4) : "0.0"}
                  </div>
                  <span className="text-white/60 text-sm">{amountOutSymbol}</span>
                </div>
              </label>
            </div>

            {quoteError && <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{quoteError}</div>}

            <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/60">
              <div className="flex justify-between">
                <span>Slippage</span>
                <span>0.5%</span>
              </div>
              <div className="flex justify-between">
                <span>Quote status</span>
                <span>{isQuoting ? "Fetching..." : quote ? "Ready" : "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span>Allowance</span>
                <span>{allowanceDisplay}</span>
              </div>
              {txHash && (
                <div className="flex justify-between">
                  <span>Tx hash</span>
                  <a
                    className="text-cyan-400 hover:text-cyan-300"
                    href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://sepolia.etherscan.io"}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View
                  </a>
                </div>
              )}
            </div>

            {!isNativeInput && (
              <button
                onClick={handleApprove}
                disabled={!needsApproval || isApproving || isFetchingAllowance || !configReady}
                className="w-full rounded-2xl border border-white/20 py-3 text-base font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
              >
                {isApproving ? "Approving..." : needsApproval ? `Approve ${amountInSymbol}` : `${amountInSymbol} Approved`}
              </button>
            )}

            {allowanceError && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{allowanceError}</div>
            )}

            {needsApproval && requiresApproval && !isApproving && configReady && (
              <div className="rounded-xl bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200">
                Approval required before swapping.
              </div>
            )}

            <button
              onClick={handleSwap}
              disabled={
                txStatus === "pending" ||
                isQuoting ||
                (requiresApproval && needsApproval) ||
                !configReady
              }
              className="w-full rounded-2xl bg-[#007AFF] py-3 text-base font-medium text-white transition hover:bg-[#0066CC] disabled:cursor-not-allowed disabled:bg-white/20"
            >
              {txStatus === "pending" ? "Swapping..." : `Swap ${amountInSymbol} for ${amountOutSymbol}`}
            </button>

            {txStatus === "success" && (
              <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                Swap submitted! Waiting for confirmations.
              </div>
            )}
            {txStatus === "error" && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Swap failed. Check console for more details.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

