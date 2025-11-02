"use client";

import { PropsWithChildren, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { SwapModalProvider } from "../lib/swap-modal-context";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || sepolia.rpcUrls.public.http[0]),
  },
  ssr: true,
});

export function Providers({ children }: PropsWithChildren) {
  // In case we need to memoize further providers later
  const config = useMemo(() => wagmiConfig, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SwapModalProvider>{children}</SwapModalProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

