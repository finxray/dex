"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Connector } from "wagmi";
import { MobileWalletSelectorCard } from "./MobileWalletSelectorCard";

interface WalletSelectorProps {
  connectors: Connector[];
  onSelect: (connector: Connector) => void;
  onClose: () => void;
  isOpen: boolean;
  cardRect?: DOMRect | null;
  swapTitleRect?: DOMRect | null;
  swapCardRect?: DOMRect | null;
}

type WalletOption = {
  connector: Connector;
  displayName: string;
  icon: string;
  isDetected: boolean;
};

// Wallet logos (verified non-404)
// MetaMask: served via jsDelivr from the official MetaMask extension repo
const METAMASK_ICON = "https://cdn.jsdelivr.net/gh/MetaMask/metamask-extension@master/app/images/icon-128.png";
const METAMASK_ICON_FALLBACKS = [
  // Wikimedia (also verified working)
  "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
];
// WalletConnect: served via jsDelivr from the official WalletConnect assets repo
const WALLETCONNECT_ICON = "https://cdn.jsdelivr.net/gh/WalletConnect/walletconnect-assets@master/Logo/Blue%20(Default)/Logo.svg";

function makePlaceholderDataUri(label: string) {
  const letter = (label || "?").trim().slice(0, 1).toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="31" fill="url(#g)" stroke="rgba(255,255,255,0.18)" />
  <text x="32" y="38" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="28" font-weight="700" fill="rgba(255,255,255,0.65)">${letter}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function WalletSelector({
  connectors,
  onSelect,
  onClose,
  isOpen,
  cardRect = null,
  swapTitleRect = null,
  swapCardRect = null,
}: WalletSelectorProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingSelector, setIsResizingSelector] = useState(false);
  const [resizeEdgeSelector, setResizeEdgeSelector] = useState<string | null>(null);
  const [selectorOffset, setSelectorOffset] = useState({ x: 0, y: 0 });
  const [selectorSize, setSelectorSize] = useState({ width: 360, height: 0 });
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
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any pending timeouts
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    
    if (isOpen) {
      setShouldRender(true);
      setPhase("closed");
      setSelectorOffset({ x: 0, y: 0 });
      const viewportHeight = window.innerHeight;
      const height70vh = viewportHeight * 0.7;
      setSelectorSize({ width: 360, height: height70vh });
      requestAnimationFrame(() => {
        setPhase("opening");
        animationTimeoutRef.current = setTimeout(() => {
          setPhase("open");
          animationTimeoutRef.current = null;
        }, 520);
      });
    } else {
      // Only set phase to closing if not already closing (prevents race condition with closeDropdown)
      if (phase !== "closing") {
        setPhase("closing");
      }
      // For mobile, delay state update until animation completes (400ms for smooth slide-down animation)
      // For desktop, use normal duration
      const closeDelay = isMobile ? 400 : animateDuration;
      animationTimeoutRef.current = setTimeout(() => {
        setShouldRender(false);
        setPhase("closed");
        animationTimeoutRef.current = null;
      }, closeDelay);
    }
    
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
    };
  }, [isOpen, isMobile, animateDuration, phase]);

  // Filter connectors - prioritize MetaMask, then show other popular wallets
  const walletOptions = useMemo(() => {
    console.log("🔍 Available connectors:", connectors.map(c => ({ id: c.id, name: c.name, type: (c as any)?.type })));
    
    // Find MetaMask connector - check multiple possible IDs
    const metaMaskConnector = connectors.find(
      (c) => 
        c.id === "metaMaskSDK" || 
        c.id === "metaMask" || 
        c.id === "io.metamask" ||
        c.name?.toLowerCase().includes("metamask")
    );
    
    const walletConnectConnector = connectors.find(
      (c) => c.id === "walletConnect" || c.name?.toLowerCase().includes("walletconnect")
    );
    
    const injectedConnector = connectors.find(
      (c) => (c as any)?.type === "injected" || c.id === "injected"
    );
    
    // Check if MetaMask is detected via window.ethereum
    const isMetaMaskDetected = typeof window !== "undefined" && 
      (window as any).ethereum?.isMetaMask === true;
    
    console.log("🔍 MetaMask detection:", {
      metaMaskConnector: metaMaskConnector ? { id: metaMaskConnector.id, name: metaMaskConnector.name } : null,
      injectedConnector: injectedConnector ? { id: injectedConnector.id, name: injectedConnector.name } : null,
      isMetaMaskDetected,
    });
    
    const result: WalletOption[] = [];
    
    // PRIORITY 1: MetaMask connector (explicit) or injected MetaMask
    // Always show MetaMask if we have any connector that could be MetaMask
    if (metaMaskConnector) {
      console.log("✅ Using MetaMask connector:", metaMaskConnector.id);
      result.push({
        connector: metaMaskConnector,
        displayName: "MetaMask",
        icon: METAMASK_ICON,
        isDetected: isMetaMaskDetected,
      });
    } else if (injectedConnector) {
      // On mobile, always show MetaMask option if injected connector exists
      // (even if not detected, user might install it)
      const isLikelyMetaMask = isMetaMaskDetected || injectedConnector.name?.toLowerCase().includes("metamask");
      console.log("✅ Using injected connector as MetaMask:", { id: injectedConnector.id, name: injectedConnector.name, isLikelyMetaMask });
      result.push({
        connector: injectedConnector,
        displayName: "MetaMask",
        icon: METAMASK_ICON,
        isDetected: isMetaMaskDetected,
      });
    }
    
    // PRIORITY 2: WalletConnect (supports many wallets)
    if (walletConnectConnector) {
      console.log("✅ Using WalletConnect connector");
      result.push({
        connector: walletConnectConnector,
        displayName: "WalletConnect",
        icon: WALLETCONNECT_ICON,
        isDetected: false,
      });
    }
    
    console.log("📋 Final wallet options:", result.map(o => ({ name: o.displayName, id: o.connector.id })));
    
    return result;
  }, [connectors]);

  const closeDropdown = useCallback(() => {
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    setPhase("closing");
    // For mobile, delay state update until animation completes (400ms for smooth slide-down animation)
    // For desktop, use normal duration
    const isMobileDevice = isMobile;
    const closeDelay = isMobileDevice ? 400 : animateDuration; // Animation is 400ms, but we wait for it to complete
    
    // Delay calling onClose until after animation completes (matches token selector behavior)
    animationTimeoutRef.current = setTimeout(() => {
      setShouldRender(false);
      setPhase("closed");
      onClose(); // Call parent's onClose after animation completes
      animationTimeoutRef.current = null;
    }, closeDelay);
  }, [onClose, isMobile, animateDuration]);

  const handleSelect = useCallback((option: WalletOption) => {
    onSelect(option.connector);
    closeDropdown();
  }, [onSelect, closeDropdown]);

  // Desktop drag handlers (simplified from TokenSelector)
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (isScrollingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragLastRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      if (!dragLastRef.current) return;
      const dx = e.clientX - dragLastRef.current.x;
      const dy = e.clientY - dragLastRef.current.y;
      setSelectorOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      dragLastRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleEnd = () => {
      setIsDragging(false);
      dragLastRef.current = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
    };
  }, [isDragging]);

  if (!shouldRender) return null;

  if (isMobile) {
    return (
      <MobileWalletSelectorCard
        isOpen={isOpen}
        onClose={closeDropdown}
        walletOptions={walletOptions}
        onSelect={handleSelect}
        phase={phase}
        animateDuration={animateDuration}
      />
    );
  }

  // Desktop version
  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        top: swapTitleRect && cardRect
          ? swapTitleRect.top
          : "50%",
        left: swapTitleRect && cardRect
          ? Math.min(window.innerWidth - 16 - selectorSize.width, cardRect.right + 65)
          : "50%",
        transform: swapTitleRect && cardRect
          ? `translate(0, 0) translate(${selectorOffset.x}px, ${selectorOffset.y}px)`
          : `translate(-50%, -50%) translate(${selectorOffset.x}px, ${selectorOffset.y}px)`,
        height: "70vh",
      }}
    >
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
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex flex-col flex-shrink-0 relative ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={handleDragStart}
          style={{ paddingTop: "12px", paddingLeft: "24px", paddingRight: "0", paddingBottom: "24px" }}
        >
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-sm font-semibold tracking-wide text-white/60">
              Select a wallet
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeDropdown();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center rounded-full text-white/70 transition hover:bg-[#ff5f57]/15 hover:text-[#ff5f57] relative z-10"
              style={{ 
                width: "33.6px",
                height: "33.6px",
                marginTop: "-4px",
                marginRight: "10px",
                lineHeight: "0"
              }}
              aria-label="Close wallet selector"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />
        </div>
        
        <div className="flex flex-col gap-4" style={{ height: "calc(100% - 100px)", overflow: "hidden", display: "flex", padding: "24px 0 24px 24px" }}>
          <div 
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ 
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maxHeight: "100%",
              marginRight: "0"
            }}
          >
            <ul className="space-y-2 pr-6">
              {walletOptions.length > 0 ? (
                walletOptions.map((option) => {
                  const isWalletConnect = option.connector.id === "walletConnect" || option.connector.name?.toLowerCase().includes("walletconnect");
                  const isMetaMask = option.displayName === "MetaMask";
                  // MetaMask should always be clickable - connector.ready might be false but it can still connect
                  // Only disable if it's not MetaMask, not WalletConnect, and not ready
                  const disabled = !isMetaMask && !isWalletConnect && !option.connector.ready;
                  
                  return (
                    <li key={option.connector.id}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log(`🖱️ Desktop: Clicked wallet: ${option.displayName}`, {
                            disabled,
                            connectorId: option.connector.id,
                            connectorReady: option.connector.ready,
                          });
                          if (!disabled) {
                            console.log(`✅ Desktop: Selecting wallet: ${option.displayName}`);
                            handleSelect(option);
                          } else {
                            console.warn(`⚠️ Desktop: Wallet selection blocked:`, { disabled });
                          }
                        }}
                        disabled={disabled}
                        className={`flex w-full items-center gap-3 rounded-full border border-transparent px-3 py-2 text-left transition-all touch-manipulation ${
                          disabled
                            ? "border-white/10 bg-white/5 opacity-40 cursor-not-allowed"
                            : "hover:border-white/30 hover:bg-white/5"
                        }`}
                        style={{ minHeight: "48px" }}
                      >
                        <div className="relative flex-shrink-0" style={{ width: "24px", height: "24px" }}>
                          {/* Placeholder (hidden when image loads successfully) */}
                          <div 
                            className="absolute inset-0 rounded-full ring-1 ring-white/15 bg-white/10"
                            style={{ zIndex: 1 }}
                            data-placeholder
                          />
                          <img
                            src={option.icon || makePlaceholderDataUri(option.displayName)}
                            alt={option.displayName}
                            className="absolute inset-0 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                            style={{ width: "24px", height: "24px", zIndex: 2 }}
                            onLoad={(e) => {
                              // Hide placeholder when image loads successfully
                              const target = e.currentTarget;
                              const placeholder = target.parentElement?.querySelector('[data-placeholder]') as HTMLElement;
                              if (placeholder) {
                                placeholder.style.display = 'none';
                              }
                            }}
                            onError={(e) => {
                              const target = e.currentTarget;
                              const placeholder = makePlaceholderDataUri(option.displayName);
                              // Prevent infinite retry loops
                              if (target.dataset.retryAttempt === "true") {
                                target.onerror = null;
                                target.src = placeholder;
                                return;
                              }

                              if (option.displayName === "WalletConnect") {
                                const fallbackIndex = parseInt(target.dataset.fallbackIndex || "0");
                                const fallbacks = [WALLETCONNECT_ICON];
                                if (fallbackIndex < fallbacks.length) {
                                  target.dataset.fallbackIndex = String(fallbackIndex + 1);
                                  target.src = fallbacks[fallbackIndex];
                                } else {
                                  target.dataset.retryAttempt = "true";
                                  target.src = placeholder;
                                }
                              } else if (option.displayName === "MetaMask") {
                                const fallbackIndex = parseInt(target.dataset.fallbackIndex || "0");
                                const fallbacks = [METAMASK_ICON, ...METAMASK_ICON_FALLBACKS];
                                if (fallbackIndex < fallbacks.length) {
                                  target.dataset.fallbackIndex = String(fallbackIndex + 1);
                                  target.src = fallbacks[fallbackIndex];
                                } else {
                                  target.dataset.retryAttempt = "true";
                                  target.src = placeholder;
                                }
                              } else {
                                target.dataset.retryAttempt = "true";
                                target.src = placeholder;
                                // Show placeholder when all fallbacks fail
                                const placeholderEl = target.parentElement?.querySelector('[data-placeholder]') as HTMLElement;
                                if (placeholderEl) {
                                  placeholderEl.style.display = 'block';
                                }
                              }
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-white">{option.displayName}</div>
                          {option.isDetected && (
                            <div className="text-xs text-white/50">Detected</div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-3 py-4 text-center text-xs text-white/40">No wallets available</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

