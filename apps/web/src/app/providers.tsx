"use client";

import { PropsWithChildren, useMemo, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { SwapModalProvider } from "../lib/swap-modal-context";

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

      return createConfig({
        chains: [sepolia],
        connectors,
        transports: {
          [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || sepolia.rpcUrls.public.http[0], {
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

