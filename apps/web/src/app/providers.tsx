"use client";

import { PropsWithChildren, useMemo, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import { SwapModalProvider } from "../lib/swap-modal-context";

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

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const config = useMemo(
    () => {
      // Create connectors array - always include injected connector
      // The connector will handle the case when no provider is available
      const connectors = [];
      
      if (mounted) {
        try {
          // Only create if window is available (client-side)
          if (typeof window !== "undefined") {
            connectors.push(injected({ shimDisconnect: true }));
          }
        } catch (error) {
          // Silently fail - connector will handle missing provider gracefully
          console.warn("Could not create injected connector:", error);
        }
      }

      // Use Hardhat (31337) if RPC_URL points to localhost, otherwise use Sepolia
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";
      const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1") || rpcUrl === "";
      const targetChain = isLocalhost ? hardhat : sepolia;
      const defaultRpcUrl = isLocalhost 
        ? "http://127.0.0.1:8545" 
        : sepolia.rpcUrls.public.http[0];

      return createConfig({
        chains: [targetChain],
        connectors,
        transports: {
          [targetChain.id]: http(rpcUrl || defaultRpcUrl, {
            retryCount: 3,
            retryDelay: 1000,
            timeout: 10000, // 10 second timeout
          }),
        },
        ssr: true,
      });
    },
    [mounted]
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SwapModalProvider>{children}</SwapModalProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

