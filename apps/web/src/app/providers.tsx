"use client";

import { PropsWithChildren, useMemo, useState, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import { SwapModalProvider } from "../lib/swap-modal-context";
import { isLocalRpc } from "../lib/isLocalRpc";
import { isMobileDevice } from "../lib/isMobile";

// Set up global error suppression immediately (before WalletConnect loads)
// This runs at module load time to catch errors from WalletConnect's initialization
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  // Suppress WalletConnect session errors globally
  // Catch all variations including "no matching key.session" and "without any listeners"
  const isWalletConnectSessionError = (message: string): boolean => {
    const lowerMessage = message.toLowerCase();
    // Very broad matching - catch anything with "matching" and "key" or "session"
    return (
      lowerMessage.includes("no matching key") ||
      lowerMessage.includes("no matching key.") ||
      lowerMessage.includes("no matching key.session") ||
      lowerMessage.includes("no matching key.session top") ||
      lowerMessage.includes("pending session not found") ||
      lowerMessage.includes("session not found") ||
      lowerMessage.includes("session not found for topic") ||
      lowerMessage.includes("proposal:") ||
      lowerMessage.includes("session top") ||
      lowerMessage.includes("session topic") ||
      lowerMessage.includes("session.top") ||
      lowerMessage.includes("session.topic") ||
      lowerMessage.includes("matching key") ||
      lowerMessage.includes("emiting session_request") ||
      lowerMessage.includes("emitting session_request") ||
      lowerMessage.includes("without any listeners") ||
      lowerMessage.includes("without listeners") ||
      (lowerMessage.includes("matching") && lowerMessage.includes("key")) ||
      (lowerMessage.includes("key") && lowerMessage.includes("session")) ||
      (lowerMessage.includes("key") && lowerMessage.includes("topic")) ||
      (lowerMessage.includes("session_request") && lowerMessage.includes("listeners")) ||
      (lowerMessage.includes("topic") && (lowerMessage.includes("walletconnect") || lowerMessage.includes("wc@"))) ||
      (lowerMessage.includes("wc@") && lowerMessage.includes("key")) ||
      (lowerMessage.includes("wc@") && lowerMessage.includes("session"))
    );
  };
  
  // Suppress MetaMask eth_accounts error (known MetaMask bug)
  const isMetaMaskAccountsError = (message: string): boolean => {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes("eth_accounts") &&
      (lowerMessage.includes("unexpectedly updated") || lowerMessage.includes("unexpectedly updatd") || lowerMessage.includes("please report this bug"))
    );
  };
  
  console.error = (...args: any[]) => {
    const message = args.map(a => String(a)).join(" ");
    if (!isWalletConnectSessionError(message) && !isMetaMaskAccountsError(message)) {
      originalError.apply(console, args);
    }
  };
  
  console.warn = (...args: any[]) => {
    const message = args.map(a => String(a)).join(" ");
    if (!isWalletConnectSessionError(message) && !isMetaMaskAccountsError(message)) {
      originalWarn.apply(console, args);
    }
  };
  
  // Also suppress in console.log (some WalletConnect errors come through log)
  console.log = (...args: any[]) => {
    const message = args.map(a => String(a)).join(" ");
    if (!isWalletConnectSessionError(message) && !isMetaMaskAccountsError(message)) {
      originalLog.apply(console, args);
    }
  };
  
  // Global error handler for uncaught errors - catch at the earliest possible point
  const errorHandler = (event: ErrorEvent) => {
    const message = String(event.message || event.error || event.filename || "").toLowerCase();
    if (isWalletConnectSessionError(message) || isMetaMaskAccountsError(message)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
  };
  
  // Add multiple layers of error interception
  window.addEventListener("error", errorHandler, true);
  window.addEventListener("error", errorHandler, false);
  
  // Override window.onerror as well
  const originalOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    const errorStr = String(message || source || "").toLowerCase();
    if (isWalletConnectSessionError(errorStr) || isMetaMaskAccountsError(errorStr)) {
      return true; // Suppress the error
    }
    if (originalOnError) {
      return originalOnError.call(this, message, source, lineno, colno, error);
    }
    return false;
  };
  
  // Global handler for unhandled promise rejections
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const message = String(event.reason || event.promise || "").toLowerCase();
    if (isWalletConnectSessionError(message) || isMetaMaskAccountsError(message)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
  };
  
  window.addEventListener("unhandledrejection", rejectionHandler);
  window.addEventListener("unhandledrejection", rejectionHandler, true);
}

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  const [walletConnectConnector, setWalletConnectConnector] = useState<any>(null);
  const walletConnectConnectorRef = useRef<any>(null);
  const [metaMaskConnector, setMetaMaskConnector] = useState<any>(null);
  const metaMaskConnectorRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    
    if (typeof window === "undefined") return;
    
    // In development, suppress WalletConnect session errors and clear stale sessions
    let consoleCleanup: (() => void) | undefined;
    if (process.env.NODE_ENV !== "production") {
      // Suppress WalletConnect internal session errors in console to prevent call stack issues
      const originalError = console.error;
      const originalWarn = console.warn;
      
      // Additional error suppression in useEffect (redundant but ensures coverage)
      // The global suppression above should catch most errors, but this provides extra safety
      const isWalletConnectSessionError = (message: string): boolean => {
        const lowerMessage = message.toLowerCase();
        return (
          lowerMessage.includes("no matching key") ||
          lowerMessage.includes("no matching key.") ||
          lowerMessage.includes("no matching key.session") ||
          lowerMessage.includes("pending session not found") ||
          lowerMessage.includes("session not found") ||
          lowerMessage.includes("session not found for topic") ||
          lowerMessage.includes("proposal:") ||
          lowerMessage.includes("session top") ||
          lowerMessage.includes("session topic") ||
          lowerMessage.includes("session.top") ||
          lowerMessage.includes("session.topic") ||
          lowerMessage.includes("matching key") ||
          lowerMessage.includes("emiting session_request") ||
          lowerMessage.includes("emitting session_request") ||
          lowerMessage.includes("without any listeners") ||
          lowerMessage.includes("without listeners") ||
          (lowerMessage.includes("key") && lowerMessage.includes("session")) ||
          (lowerMessage.includes("session_request") && lowerMessage.includes("listeners")) ||
          (lowerMessage.includes("topic") && (lowerMessage.includes("walletconnect") || lowerMessage.includes("wc@"))) ||
          (lowerMessage.includes("wc@") && lowerMessage.includes("key"))
        );
      };
      
      const isMetaMaskAccountsError = (message: string): boolean => {
        const lowerMessage = message.toLowerCase();
        return (
          lowerMessage.includes("eth_accounts") &&
          (lowerMessage.includes("unexpectedly updated") || lowerMessage.includes("unexpectedly updatd") || lowerMessage.includes("please report this bug"))
        );
      };
      
      console.error = (...args: any[]) => {
        const message = args.map(a => String(a)).join(" ");
        if (!isWalletConnectSessionError(message) && !isMetaMaskAccountsError(message)) {
          originalError.apply(console, args);
        }
      };
      
      console.warn = (...args: any[]) => {
        const message = args.map(a => String(a)).join(" ");
        if (!isWalletConnectSessionError(message) && !isMetaMaskAccountsError(message)) {
          originalWarn.apply(console, args);
        }
      };
      
      // Clear ONLY stale WalletConnect sessions (not active ones)
      // This prevents "no matching key" errors from stale sessions while preserving active connections
      const clearWalletConnectSessions = () => {
        try {
          const storage = window.localStorage;
          const keysToRemove: string[] = [];
          
          // Only clear core/pending keys, NOT active session keys
          // Active sessions have format: wc@2:core:... or wc@2:session:...
          // We only want to clear stale core keys, not active sessions
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && (
              // Only clear core keys that might be stale, not active sessions
              (key.startsWith("wc@2:core:") && key.includes("pending")) ||
              key.startsWith("wc@2:core:keychain") // Keychain can be stale
            )) {
              keysToRemove.push(key);
            }
          }
          
          // Remove only stale core keys (only in development)
          if (keysToRemove.length > 0) {
            console.log(`🧹 Clearing ${keysToRemove.length} stale WalletConnect core key(s) from localStorage`);
            keysToRemove.forEach((key) => storage.removeItem(key));
          }
        } catch (error) {
          // Silently fail - localStorage might not be available
        }
      };
      
      // Clear stale sessions on mount only (not periodically)
      // Periodic clearing was interfering with active sessions
      clearWalletConnectSessions();
      
      // Store cleanup function to restore console
      consoleCleanup = () => {
        console.error = originalError;
        console.warn = originalWarn;
      };
    }
    
    // Dynamically load and initialize WalletConnect connector only once
    // Following best practice from WalletConnect docs: initialize properly and only once
    // This prevents "Pending session not found" errors from multiple initializations
    if (!walletConnectConnectorRef.current) {
      // Don't clear sessions before init - this was interfering with active connections
      // WalletConnect manages its own session lifecycle
      
      import("@wagmi/connectors").then((module) => {
        try {
          if (module?.walletConnect) {
            const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "3279f11c6eac09393e92f6d59360e07f";
            if (projectId) {
              // Create WalletConnect connector instance once and store it
              // This ensures proper initialization and avoids multiple initializations
              // Similar to the fix: Core is initialized inside Web3Wallet scope, not separately
              // Detect if we're on mobile
              const isMobile = typeof window !== "undefined" && isMobileDevice();
              
              const connector = module.walletConnect({
                projectId,
                showQrModal: true,
                metadata: {
                  name: "Stoix App",
                  description: "Stoix DEX - Decentralized Exchange",
                  url: window.location.origin,
                  icons: [`${window.location.origin}/icon.png`],
                },
                // Improve mobile UX - use dark theme to match app
                qrModalOptions: {
                  themeMode: "dark",
                  themeVariables: {
                    "--w3m-z-index": "9999",
                    "--w3m-accent-color": "#007AFF",
                    "--w3m-background-color": "#000000",
                    "--w3m-overlay-background-color": "rgba(0, 0, 0, 0.8)",
                    "--w3m-text-color": "#FFFFFF",
                    "--w3m-font-family": "var(--font-geist-sans)",
                  },
                  // Improve mobile connection reliability
                  enableAccountView: true,
                  enableNetworkView: true,
                },
                // Improve connection reliability
                relayUrl: "wss://relay.walletconnect.com",
              });
              
              // Store connector instance to prevent recreation
              walletConnectConnectorRef.current = connector;
              setWalletConnectConnector(connector);
              console.log("✅ WalletConnect connector initialized");
            }
          }
        } catch (error) {
          console.warn("Could not initialize WalletConnect connector:", error);
        }
      }).catch((error) => {
        console.warn("Could not load WalletConnect:", error);
      });
      
      // Also load MetaMask connector
      import("@wagmi/connectors").then((module) => {
        try {
          if (module?.metaMask) {
            const connector = module.metaMask({
              dappMetadata: {
                name: "Stoix App",
                url: window.location.origin,
              },
            });
            metaMaskConnectorRef.current = connector;
            setMetaMaskConnector(connector);
            console.log("✅ MetaMask connector initialized");
          }
        } catch (error) {
          console.warn("Could not initialize MetaMask connector:", error);
        }
      }).catch((error) => {
        console.warn("Could not load MetaMask:", error);
      });
    }
    
    // Cleanup: restore console methods if they were modified
    return () => {
      if (consoleCleanup) {
        consoleCleanup();
      }
    };
  }, []);

  const config = useMemo(
    () => {
      // Build connectors only after mount on the client
      const connectorList: any[] = [];
      if (mounted && typeof window !== "undefined") {
        // PRIORITY 1: MetaMask connector (explicit, better UX)
        if (metaMaskConnectorRef.current) {
          connectorList.push(metaMaskConnectorRef.current);
        }
        
        // PRIORITY 2: WalletConnect connector (for other wallets)
        if (walletConnectConnectorRef.current) {
          connectorList.push(walletConnectConnectorRef.current);
        }

        // PRIORITY 3: Generic injected connector (fallback for other browser wallets)
        try {
          connectorList.push(injected({ shimDisconnect: true }));
        } catch (error) {
          console.warn("⚠️ Injected connector unavailable:", error);
        }
      }

      // Auto-detect mobile vs desktop and use appropriate RPC URL.
      // IMPORTANT: Never hardcode a LAN IP; derive it from the host the user is currently visiting.
      // This makes local Hardhat work across different Wi‑Fi networks and machines.
      const isMobile = mounted && typeof window !== "undefined" && isMobileDevice();
      const host =
        mounted && typeof window !== "undefined"
          ? (window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname)
          : "127.0.0.1";
      const localRpcUrlFromEnv = process.env.NEXT_PUBLIC_LOCAL_RPC_URL;
      const rpcUrl =
        localRpcUrlFromEnv ||
        (isMobile
          ? `http://${host}:8545`
          : "http://127.0.0.1:8545");
      
      const isLocalhost = isLocalRpc(rpcUrl);
      
      // Create Hardhat chain dynamically with the correct RPC URL based on device type
      // This ensures mobile (LAN IP) and desktop (127.0.0.1) both work correctly
      const hardhatChain = isLocalhost ? defineChain({
        id: 31337,
        name: "Hardhat Local",
        nativeCurrency: {
          decimals: 18,
          name: "Ether",
          symbol: "ETH",
        },
        rpcUrls: {
          default: {
            http: [rpcUrl],
          },
        },
      }) : null;
      
      const targetChain = isLocalhost ? hardhatChain! : sepolia;
      
      console.log(`🌐 RPC Configuration: ${isMobile ? "Mobile" : "Desktop"} device detected, using RPC: ${rpcUrl}`);

      return createConfig({
        chains: [targetChain],
        connectors: connectorList,
        transports: {
          [targetChain.id]: http(rpcUrl, {
            retryCount: 3,
            retryDelay: 1000,
            timeout: 10000, // 10 second timeout
          }),
        },
        ssr: true,
      });
    },
    [mounted, walletConnectConnector, metaMaskConnector] // Recreate config when connectors are initialized
  );

  return (
    <div style={{ margin: 0, padding: 0, width: "100vw", overflowX: "hidden" }}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <SwapModalProvider>{children}</SwapModalProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </div>
  );
}

