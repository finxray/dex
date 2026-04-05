"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useConnectors } from "wagmi";
import { NavLink } from "../../types/navigation";
import { navLinks } from "../../data/navLinks";

/** Hide home header on fast scroll-down only (~≥0.42 px/ms ≈ 420 px/s). */
const HIDE_DOWN_VELOCITY_PX_PER_MS = 0.42;
const HOME_HIDE_AFTER_SCROLL_Y = 80;
/** Ignore tiny jitter; require meaningful step per event. */
const MIN_DY_FOR_VELOCITY_HIDE = 14;
/** Cap Δt so batched/long-interval events can still register a quick flick. */
const MAX_DT_FOR_VELOCITY_MS = 72;
/** Mega panel slide (must match Tailwind `duration-700` on grid-template-rows). */
const MEGA_PANEL_TRANSITION_MS = 700;
/** Toolbar + mega top divider appear only after scrolling past this (px). */
const TOOLBAR_DIVIDER_SCROLL_Y = 50;
/** Uniform 10% scale for marketing top bar + desktop mega (typography, padding, gaps). */
const TB = 1.1;
const barHMobile = 55.2 * TB;
const barMd = 44 * TB;
const contentMaxW = 980 * TB;
/** Mega glass when backdrop is a light page (e.g. white section). */
const MEGA_GLASS_OVER_LIGHT = "rgba(0, 0, 0, 0.86)";
/** Mega glass when backdrop is dark — translucent black, lighter than over-light but slightly deeper than before. */
const MEGA_GLASS_OVER_DARK = "rgba(0, 0, 0, 0.38)";
const MEGA_GLASS_INSET_EDGE = "inset 0 1.1px 0 rgba(255,255,255,0.08)";

export function Header() {
  const pathname = usePathname();
  const isSwapPage = pathname === "/swap";
  const isConnectingRef = useRef(false); // Track connection attempts to prevent duplicates
  
  // App pages that should show the app toolbar
  const appPages = ["/swap", "/liquidity", "/pools", "/positions", "/analytics"];
  const isAppPage = appPages.includes(pathname);
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  /** When false, grid animates 1fr→0fr while `activeMenu` stays set until the transition finishes (so content does not vanish instantly). */
  const [megaPanelExpanded, setMegaPanelExpanded] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [showBorder, setShowBorder] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOverWhiteSection, setIsOverWhiteSection] = useState(false);
  /** True when fixed header (incl. open mega) intersects a `.bg-white` block — use darker glass. */
  const [megaGlassOverLightSection, setMegaGlassOverLightSection] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [logoPosition, setLogoPosition] = useState({
    x: 24 * TB,
    y: 12.424 * TB,
    width: 52.5 * TB,
    height: 19.152 * TB,
  });
  const [headerSize, setHeaderSize] = useState({ width: contentMaxW, height: barMd });

  const lastScrollYRef = useRef(0);
  /** `performance.now()` of last scroll sample — used for downward velocity (px/ms). */
  const lastScrollTimeRef = useRef(0);
  /** Delay closing mega menu so pointer can move from nav link into the panel without losing hover. */
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Clears `activeMenu` after collapse animation so the reverse slide can run. */
  const megaAfterCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  // Menu items for app pages (Swap, Liquidity, Pools, Positions, Analytics)
  const appNavLinks = [
    { label: "Swap", href: "/swap" },
    { label: "Liquidity", href: "/liquidity" },
    { label: "Pools", href: "/pools" },
    { label: "Positions", href: "/positions" },
    { label: "Analytics", href: "/analytics" },
  ];
  
  // Use app menu items when on app pages, otherwise use regular navLinks
  const currentNavLinks = isAppPage ? appNavLinks : navLinks;

  const { address, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending: isConnectPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  // Safely check if connectors are available
  const hasConnector = connectors && connectors.length > 0;

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const now = performance.now();

      /** At scroll top the toolbar bottom border stays hidden unless mega / mobile sheet is open; once scrolled it always shows. */
      const toolbarBorderVisible =
        currentY > TOOLBAR_DIVIDER_SCROLL_Y || isMenuOpen || activeMenu !== null;

      if (isMenuOpen || activeMenu) {
        setIsHeaderHidden(false);
        lastScrollYRef.current = currentY;
        lastScrollTimeRef.current = now;
        setShowBorder(toolbarBorderVisible);
        return;
      }

      // Keep header visible on app pages (like Analytics, Swap, etc.)
      const isHomePage = pathname === "/";
      if (!isHomePage) {
        setIsHeaderHidden(false);
        setShowBorder(toolbarBorderVisible);
        lastScrollYRef.current = currentY;
        lastScrollTimeRef.current = now;
        return;
      }

      const lastY = lastScrollYRef.current;
      const lastT = lastScrollTimeRef.current;
      const dy = currentY - lastY;
      const rawDt = lastT > 0 ? now - lastT : 16;
      const dt = Math.max(8, Math.min(rawDt, MAX_DT_FOR_VELOCITY_MS));
      const isScrollingDown = dy > 0;
      const isScrollingUp = dy < 0;

      if (isScrollingUp) {
        setIsHeaderHidden(false);
      } else if (
        isScrollingDown &&
        dy >= MIN_DY_FOR_VELOCITY_HIDE &&
        currentY > HOME_HIDE_AFTER_SCROLL_Y
      ) {
        const velocity = dy / dt;
        if (velocity >= HIDE_DOWN_VELOCITY_PX_PER_MS) {
          setIsHeaderHidden(true);
        }
      }

      setShowBorder(toolbarBorderVisible);

      if (isMobile) {
        const whiteSectionElement = document.querySelector(".bg-white");
        if (whiteSectionElement) {
          const whiteSectionTop = whiteSectionElement.getBoundingClientRect().top + window.scrollY;
          const headerBottom =
            currentY + (headerRef.current?.offsetHeight || (isMobile ? barHMobile : barMd));
          setIsOverWhiteSection(headerBottom >= whiteSectionTop - 100);
        }
      }

      lastScrollYRef.current = currentY;
      lastScrollTimeRef.current = now;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isMenuOpen, activeMenu, isMobile, pathname]);

  useLayoutEffect(() => {
    const y = typeof window !== "undefined" ? window.scrollY : 0;
    setShowBorder(y > TOOLBAR_DIVIDER_SCROLL_Y || isMenuOpen || activeMenu !== null);
  }, [pathname, isMenuOpen, activeMenu]);

  useEffect(() => {
    return () => {
      if (menuCloseTimerRef.current) {
        clearTimeout(menuCloseTimerRef.current);
      }
      if (megaAfterCollapseTimerRef.current) {
        clearTimeout(megaAfterCollapseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSwapPage) return;
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    if (megaAfterCollapseTimerRef.current) {
      clearTimeout(megaAfterCollapseTimerRef.current);
      megaAfterCollapseTimerRef.current = null;
    }
    setMegaPanelExpanded(false);
    setActiveMenu(null);
  }, [isSwapPage]);

  useEffect(() => {
    if (isSwapPage) {
      setMegaGlassOverLightSection(false);
      return;
    }
    const syncMegaGlass = () => {
      requestAnimationFrame(() => {
        const headerEl = headerRef.current;
        if (!headerEl) return;
        const hr = headerEl.getBoundingClientRect();
        const lightBlocks = document.querySelectorAll(".bg-white");
        let hitsLight = false;
        lightBlocks.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          if (r.left < hr.right && r.right > hr.left && r.top < hr.bottom && r.bottom > hr.top) {
            hitsLight = true;
          }
        });
        setMegaGlassOverLightSection(hitsLight);
      });
    };
    syncMegaGlass();
    window.addEventListener("scroll", syncMegaGlass, { passive: true });
    window.addEventListener("resize", syncMegaGlass);
    const headerEl = headerRef.current;
    const ro =
      headerEl && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncMegaGlass())
        : null;
    if (headerEl && ro) ro.observe(headerEl);
    return () => {
      window.removeEventListener("scroll", syncMegaGlass);
      window.removeEventListener("resize", syncMegaGlass);
      ro?.disconnect();
    };
  }, [isSwapPage, pathname, megaPanelExpanded, isHeaderHidden, activeMenu]);

  const handleNavClick = () => setIsMenuOpen(false);
  const toggleMenu = () => setIsMenuOpen((prev) => !prev);

  const cancelMegaMenuClose = () => {
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    if (megaAfterCollapseTimerRef.current) {
      clearTimeout(megaAfterCollapseTimerRef.current);
      megaAfterCollapseTimerRef.current = null;
    }
  };

  const handleMenuEnter = (label: string) => {
    cancelMegaMenuClose();
    setMegaPanelExpanded(true);
    setActiveMenu(label);
  };

  /** Desktop: defer close so hover path link → dropdown does not drop the menu; then collapse over MEGA_PANEL_TRANSITION_MS before clearing labels. */
  const scheduleMegaMenuClose = () => {
    cancelMegaMenuClose();
    menuCloseTimerRef.current = setTimeout(() => {
      setMegaPanelExpanded(false);
      menuCloseTimerRef.current = null;
      megaAfterCollapseTimerRef.current = setTimeout(() => {
        setActiveMenu(null);
        megaAfterCollapseTimerRef.current = null;
      }, MEGA_PANEL_TRANSITION_MS);
    }, 220);
  };

  const currentMega = activeMenu && !isSwapPage
    ? navLinks.find((link) => link.label === activeMenu && link.mega)
    : undefined;

  const megaColumnCount = currentMega?.mega?.length ?? 0;
  const megaGridClass =
    megaColumnCount >= 4
      ? "grid-cols-2 gap-x-[35.2px] gap-y-[35.2px] lg:grid-cols-4 lg:gap-x-[26.4px]"
      : "grid-cols-2 gap-x-[44px] gap-y-[26.4px] sm:grid-cols-3 sm:gap-x-[52.8px]";

  const megaGlassFullBg = megaGlassOverLightSection
    ? MEGA_GLASS_OVER_LIGHT
    : MEGA_GLASS_OVER_DARK;

  // Update document title when a menu is active
  useEffect(() => {
    if (activeMenu) {
      document.title = `${activeMenu} - Stoix`;
    } else {
      // Reset to default when menu closes (only if not on swap page)
      if (typeof window !== "undefined" && !window.location.pathname.includes("/swap")) {
        document.title = "Stoix App - Stoix";
      }
    }
  }, [activeMenu]);

  // Update logo position for mask
  useEffect(() => {
    const updateLogoPosition = () => {
      if (logoRef.current && headerRef.current) {
        const logoRect = logoRef.current.getBoundingClientRect();
        const headerRect = headerRef.current.getBoundingClientRect();
        const isMobileWidth = window.innerWidth < 768;
        const logoImgs = logoRef.current.querySelectorAll("img");
        const logoImg = isMobileWidth ? logoImgs[0] : logoImgs[1] || logoImgs[0];
        const logoWidth = logoImg && logoImg.offsetWidth > 0 ? logoImg.offsetWidth : 52.5 * TB;
        const logoHeight = logoImg && logoImg.offsetHeight > 0 ? logoImg.offsetHeight : 19.152 * TB;
        const relativeX = logoRect.left - headerRect.left;
        const relativeY = logoRect.top - headerRect.top;
        setLogoPosition({
          x: relativeX,
          y: relativeY,
          width: logoWidth,
          height: logoHeight,
        });
        setHeaderSize({ width: headerRect.width, height: headerRect.height });
      }
    };

    updateLogoPosition();
    window.addEventListener("resize", updateLogoPosition);
    window.addEventListener("scroll", updateLogoPosition);
    return () => {
      window.removeEventListener("resize", updateLogoPosition);
      window.removeEventListener("scroll", updateLogoPosition);
    };
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 w-full ${
          isHeaderHidden ? "-translate-y-full" : "translate-y-0"
        } ${isMobile && !isSwapPage ? "backdrop-blur-2xl backdrop-saturate-[180%]" : "md:backdrop-blur-none"}`}
        style={{
          /* Desktop: stay transparent below the top bar so mega menu backdrop-filter sees page content,
             not an opaque black layer (the old md:absolute inset-0 mask covered the whole header). */
          backgroundColor: isSwapPage
            ? "transparent"
            : isMobile
              ? "rgba(0, 0, 0, 0.2)"
              : "transparent",
          backdropFilter: isSwapPage ? "none" : isMobile ? "blur(22px) saturate(180%)" : "none",
          WebkitBackdropFilter: isSwapPage ? "none" : isMobile ? "blur(22px) saturate(180%)" : "none",
          width: "100vw",
        }}
        onMouseLeave={scheduleMegaMenuClose}
      >
        {/* Top bar shell only: mask + glass live here so mega menu is not painted over by solid black */}
        <div
          className={`relative isolate h-[60.72px] w-full shrink-0 overflow-visible md:h-[48.4px] ${
            !isSwapPage && !isMobile
              ? "md:bg-[rgba(0,0,0,0.4)] md:backdrop-blur-[26.4px] md:backdrop-saturate-[180%]"
              : ""
          } ${
            showBorder && !isMobile && !isSwapPage ? "md:border-b md:border-solid md:border-white/10" : ""
          }`}
          style={
            !isSwapPage && !isMobile
              ? { WebkitBackdropFilter: "blur(26.4px) saturate(180%)" }
              : undefined
          }
        >
        {/* SVG mask definition */}
        <svg 
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <mask id="toolbarCutoutMask" maskUnits="userSpaceOnUse">
              <rect width="100%" height="100%" fill="white" />
              <g transform={`translate(${logoPosition.x}, ${logoPosition.y})`}>
                <image
                  href="/stoix full white smaller.svg"
                  width={logoPosition.width}
                  height={logoPosition.height}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ filter: "brightness(0)" }}
                />
              </g>
            </mask>
          </defs>
        </svg>
        {/* Shimmer effect positioned at logo location - between logo and toolbar - hidden on mobile */}
        <div
          className="hidden md:block absolute overflow-hidden"
          style={{
            left: `${logoPosition.x}px`,
            top: `${logoPosition.y}px`,
            width: `${logoPosition.width}px`,
            height: `${logoPosition.height}px`,
            pointerEvents: "none",
            zIndex: -1,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(70deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.6) 20%, rgba(255, 255, 255, 1) 50%, rgba(255, 255, 255, 0.6) 80%, rgba(255, 255, 255, 0.3) 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 3s infinite",
              maskImage: "url(/stoix full white smaller.svg)",
              WebkitMaskImage: "url(/stoix full white smaller.svg)",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
            }}
          />
        </div>
        {/* Masked strip: height = this wrapper only (never covers mega menu) */}
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden md:block"
          style={{
            backgroundColor: "rgba(0, 0, 0, 1)",
            mask:         "url(#toolbarCutoutMask)",
            WebkitMask:   "url(#toolbarCutoutMask)",
            maskRepeat:   "no-repeat",
            WebkitMaskRepeat: "no-repeat",
          }}
        />
        <div className="relative z-10 mx-auto flex h-full min-h-[60.72px] max-w-[1078px] w-full items-center justify-between px-[16.5px] md:min-h-0 md:px-[26.4px]">
          <div ref={logoRef}>
            <Link
              href="/"
              className="flex items-center flex-shrink-0 relative"
              aria-label="Stoix home"
              onClick={handleNavClick}
            >
            {/* Logo - visible on mobile, hidden on desktop (desktop uses mask cutout) - 25% bigger on mobile */}
            <img
              src="/stoix full white smaller.svg"
              alt="Stoix"
              className="h-[26.334px] w-auto relative z-10 block md:hidden"
              style={{ 
                height: "26.334px",
                filter: isMobile && isOverWhiteSection ? "invert(1)" : "none",
                transition: "filter 0.3s ease"
              }}
            />
            {/* Desktop logo - hidden so green background shows through cutout */}
            <img
              src="/stoix full white smaller.svg"
              alt="Stoix"
              className="h-[21.0672px] w-auto relative z-10 hidden md:block opacity-0"
            />
          </Link>
          </div>
        <nav className="hidden items-center gap-[35.2px] text-[0.825rem] font-normal text-white/80 md:flex md:flex-1 md:justify-center md:origin-top md:scale-95">
          {currentNavLinks.map((item) => (
            <div
              key={item.label}
              className="relative py-[4.4px]"
              onMouseEnter={() => !isSwapPage && handleMenuEnter(item.label)}
            >
              <Link
                href={item.href}
                className="block transition-colors hover:text-white whitespace-nowrap"
                style={{ color: activeMenu === item.label ? "#ffffff" : undefined }}
                onMouseEnter={() => !isSwapPage && handleMenuEnter(item.label)}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="flex origin-top scale-95 items-center gap-[8.8px] md:gap-[26.4px] flex-shrink-0">
          {isConnected ? (
            <>
              <div className="hidden items-center gap-[13.2px] md:flex flex-shrink-0">
                <span className="text-[0.825rem] text-white/60 whitespace-nowrap">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="rounded-full border border-white/20 px-[13.2px] py-[4.4px] text-[0.825rem] font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white whitespace-nowrap"
                >
                  Disconnect
                </button>
              </div>
              <div className="flex items-center gap-[17.6px] md:hidden">
                <span 
                  className="text-[0.825rem] whitespace-nowrap"
                  style={{
                    color: isMobile && isOverWhiteSection ? "rgba(0, 0, 0, 0.6)" : "rgba(255, 255, 255, 0.6)",
                    transition: "color 0.3s ease"
                  }}
                >
                  {address?.slice(0, 4)}...{address?.slice(-3)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="md:hidden rounded-full border border-white/15 px-[13.2px] py-[8.8px] text-[0.825rem] font-normal transition-all touch-manipulation flex items-center justify-center whitespace-nowrap"
                  style={{
                    backgroundColor: "rgba(12, 14, 22, 0.3)",
                    backdropFilter: "blur(22px) saturate(180%)",
                    WebkitBackdropFilter: "blur(22px) saturate(180%)",
                    boxShadow:
                      "inset 0 1.1px 0 rgba(255,255,255,0.1), 0 0 0 4.4px rgba(0, 0, 0, 0.2), 0 0 0 8.8px rgba(0, 0, 0, 0.1), 0 0 0 13.2px rgba(0, 0, 0, 0.05), 0 6.6px 24.2px rgba(0, 0, 0, 0.15)",
                    color: "#ffffff",
                    opacity: 1,
                    minWidth: "110px",
                    width: "110px",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(12, 14, 22, 0.5)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    e.currentTarget.style.color = "#ffffff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(12, 14, 22, 0.3)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                    e.currentTarget.style.color = "#ffffff";
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={async () => {
                  try {
                    // Prevent duplicate connection attempts
                    if (isConnectingRef.current || isConnectPending || !hasConnector || !connectors[0]) {
                      return;
                    }
                    isConnectingRef.current = true;
                    try {
                      await connect({ connector: connectors[0] });
                    } catch (error) {
                      console.error("Failed to connect wallet:", error);
                    } finally {
                      setTimeout(() => {
                        isConnectingRef.current = false;
                      }, 1000);
                    }
                  } catch (error) {
                    console.error("Failed to connect wallet:", error);
                    isConnectingRef.current = false;
                  }
                }}
                disabled={isConnectPending || !hasConnector || isConnectingRef.current}
                className="hidden rounded-full border border-white/20 px-[13.2px] py-[4.4px] text-[0.825rem] font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed md:flex items-center justify-center whitespace-nowrap"
              >
                {isConnectPending ? "Connecting..." : connectError ? "No Wallet Found" : "Connect Wallet"}
              </button>
              <button
                onClick={async () => {
                  try {
                    // Prevent duplicate connection attempts
                    if (isConnectingRef.current || isConnectPending || !hasConnector || !connectors[0]) {
                      return;
                    }
                    isConnectingRef.current = true;
                    try {
                      await connect({ connector: connectors[0] });
                    } catch (error) {
                      console.error("Failed to connect wallet:", error);
                    } finally {
                      setTimeout(() => {
                        isConnectingRef.current = false;
                      }, 1000);
                    }
                  } catch (error) {
                    console.error("Failed to connect wallet:", error);
                    isConnectingRef.current = false;
                  }
                }}
                disabled={isConnectPending || !hasConnector || isConnectingRef.current}
                className="md:hidden rounded-full border border-white/15 px-[13.2px] py-[8.8px] text-[0.825rem] font-normal transition-all touch-manipulation flex items-center justify-center whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: "rgba(12, 14, 22, 0.3)",
                  backdropFilter: "blur(22px) saturate(180%)",
                  WebkitBackdropFilter: "blur(22px) saturate(180%)",
                  boxShadow:
                    "inset 0 1.1px 0 rgba(255,255,255,0.1), 0 0 0 4.4px rgba(0, 0, 0, 0.2), 0 0 0 8.8px rgba(0, 0, 0, 0.1), 0 0 0 13.2px rgba(0, 0, 0, 0.05), 0 6.6px 24.2px rgba(0, 0, 0, 0.15)",
                  color: "#ffffff",
                  opacity: 1,
                  minWidth: "110px",
                  width: "110px",
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = "rgba(12, 14, 22, 0.5)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    e.currentTarget.style.color = "#ffffff";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(12, 14, 22, 0.3)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                  e.currentTarget.style.color = "#ffffff";
                  e.currentTarget.style.opacity = "1";
                }}
              >
                {isConnectPending ? "Connecting..." : connectError ? "No Wallet" : "Connect"}
              </button>
            </>
          )}
          <Link
            href={isSwapPage ? "/" : "/swap"}
            className={
              isSwapPage
                ? "hidden rounded-full border border-white/20 px-[13.2px] py-[4.4px] text-[0.825rem] font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white md:flex items-center justify-center whitespace-nowrap min-w-[121px] flex-shrink-0"
                : "hidden rounded-full border border-white/20 bg-white/80 px-[13.2px] py-[4.4px] text-[0.825rem] font-normal !text-black transition-all hover:border-white/30 hover:bg-white hover:!text-black md:flex min-w-[121px] flex-shrink-0 items-center justify-center whitespace-nowrap"
            }
          >
            {isSwapPage ? "About Protocol" : "Launch App"}
          </Link>
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={isMenuOpen}
            onClick={toggleMenu}
            className="group flex h-[58.08px] w-[58.08px] items-center justify-center transition-colors md:hidden touch-manipulation relative"
            style={{ 
              minWidth: "58.08px", 
              minHeight: "58.08px",
              marginLeft: "auto",
              color: isMobile && isOverWhiteSection ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)",
              transition: "color 0.3s ease"
            }}
            onMouseEnter={(e) => {
              if (!isMobile || !isOverWhiteSection) {
                e.currentTarget.style.color = "#ffffff";
              } else {
                e.currentTarget.style.color = "#000000";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "";
            }}
          >
            <div className="relative w-[29.04px] h-[19.36px] flex flex-col justify-center items-center">
              <span
                className="block h-[2.42px] w-full bg-current transition-all duration-300 ease-in-out absolute rounded-full"
                style={{
                  transform: isMenuOpen 
                    ? "rotate(45deg) translateY(0)" 
                    : "rotate(0deg) translateY(-4.84px)",
                  transformOrigin: "center",
                }}
              />
              <span
                className="block h-[2.42px] w-full bg-current transition-all duration-300 ease-in-out absolute rounded-full"
                style={{
                  transform: isMenuOpen 
                    ? "rotate(-45deg) translateY(0)" 
                    : "rotate(0deg) translateY(4.84px)",
                  transformOrigin: "center",
                }}
              />
            </div>
          </button>
        </div>
      </div>
        </div>
        {/* end top bar shell */}
      
      {/* Mega Menu - only show on non-swap pages. Slide: grid 0fr→1fr (efficient); no opacity/backdrop animation to avoid jank. */}
      {!isSwapPage && (
        <div
          className={`-mt-px relative z-[100] hidden border-t border-solid transition-[border-color] duration-200 md:block ${
            showBorder ? "border-white/15" : "border-transparent"
          } ${megaPanelExpanded && currentMega?.mega ? "" : "pointer-events-none"}`}
          onMouseEnter={() => {
            if (currentMega) {
              handleMenuEnter(currentMega.label);
            }
          }}
        >
          <div
            className={`grid motion-reduce:transition-none ${
              megaPanelExpanded && currentMega?.mega ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            } transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:duration-0`}
          >
            <div className="min-h-0 overflow-x-hidden overflow-y-hidden">
              <div className="relative max-h-[min(70vh,704px)] border-b border-solid border-white/10">
                {/* Glass layer: static styles only; animating backdrop/opacity causes lag. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-0"
                  style={
                    currentMega?.mega
                      ? {
                          backgroundColor: megaGlassFullBg,
                          backdropFilter: "blur(44px) saturate(180%)",
                          WebkitBackdropFilter: "blur(44px) saturate(180%)",
                          boxShadow: showBorder ? MEGA_GLASS_INSET_EDGE : "none",
                        }
                      : undefined
                  }
                />
                <div
                  className={`relative z-10 mx-auto grid min-h-0 max-h-[min(70vh,704px)] max-w-[1078px] origin-top scale-95 overflow-y-auto overscroll-contain px-[26.4px] pb-[52.8px] pt-[35.2px] [scrollbar-gutter:stable] ${megaGridClass}`}
                >
                  {currentMega?.mega?.map((group) => (
                    <div key={group.heading} className="min-w-0 space-y-[13.2px]">
                      <h3 className="pl-[13.2px] text-[0.825rem] font-medium text-white/60">
                        {group.heading}
                      </h3>
                      <ul className="flex flex-col gap-[4.4px]">
                        {group.items.map((item) => (
                          <li key={item.title} className="min-w-0">
                            <Link
                              href={item.href}
                              className="inline-flex max-w-full items-center rounded-full border border-transparent px-[13.2px] py-[4.4px] text-left text-[0.825rem] font-normal leading-snug text-white/80 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
                            >
                              {item.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      {isMenuOpen ? (
        <div className="border-t border-white/10 bg-black/95 px-4 pb-12 pt-4 md:hidden max-h-[calc(100vh-60.72px)] overflow-y-auto overscroll-contain">
          <nav className="flex origin-top scale-95 flex-col gap-4 text-base text-white">
            {currentNavLinks.map((item) => (
              <div key={item.label} className="space-y-3">
                <Link
                  href={item.href}
                  className="inline-flex items-center rounded-full px-4 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white touch-manipulation min-h-[48px]"
                  onClick={handleNavClick}
                  style={{ minHeight: "48px" }}
                >
                  {item.label}
                </Link>
                {!isSwapPage && (item as NavLink).mega ? (
                  <div className="space-y-4">
                    {(item as NavLink).mega?.map((group) => (
                      <div key={group.heading} className="space-y-2 pl-3">
                        <h3 className="pl-3 text-xs font-medium text-white/60">
                          {group.heading}
                        </h3>
                        <ul className="space-y-1">
                          {group.items.map((subItem) => (
                            <li key={subItem.title}>
                              <Link
                                href={subItem.href}
                                className="block w-full rounded-xl px-3 py-2.5 text-sm font-normal leading-snug text-white/80 transition-colors hover:bg-white/8 hover:text-white touch-manipulation min-h-[44px]"
                                onClick={handleNavClick}
                                style={{ minHeight: "44px" }}
                              >
                                {subItem.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="space-y-4">
              {isConnected ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-white/60 px-3">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </div>
                  <button
                    onClick={() => {
                      disconnect();
                      handleNavClick();
                    }}
                    className="inline-flex items-center justify-center rounded-full px-4 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white touch-manipulation min-h-[48px]"
                    style={{ minHeight: "48px" }}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      // Prevent duplicate connection attempts
                      if (isConnectingRef.current || isConnectPending || !hasConnector || !connectors[0]) {
                        return;
                      }
                      isConnectingRef.current = true;
                      try {
                        await connect({ connector: connectors[0] });
                      } catch (error) {
                        console.error("Failed to connect wallet:", error);
                      } finally {
                        setTimeout(() => {
                          isConnectingRef.current = false;
                        }, 1000);
                      }
                    } catch (error) {
                      console.error("Failed to connect wallet:", error);
                      isConnectingRef.current = false;
                    }
                    handleNavClick();
                  }}
                  disabled={isConnectPending || !hasConnector || isConnectingRef.current}
                  className="inline-flex items-center justify-center rounded-full px-4 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px]"
                  style={{ minHeight: "48px" }}
                >
                  {isConnectPending ? "Connecting..." : connectError ? "No Wallet Found" : "Connect Wallet"}
                </button>
              )}
              <Link
                href={isSwapPage ? "/" : "/swap"}
                onClick={handleNavClick}
                className={
                  isSwapPage
                    ? "inline-flex min-h-[48px] touch-manipulation items-center justify-center rounded-full px-4 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                    : "inline-flex min-h-[48px] touch-manipulation items-center justify-center rounded-full border border-white/20 bg-white/80 px-4 py-3 text-base font-medium !text-black transition-colors hover:border-white/30 hover:bg-white hover:!text-black"
                }
                style={{ minHeight: "48px" }}
              >
                {isSwapPage ? "About Protocol" : "Launch App"}
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
      </header>
      {/* Gradient blend from header into colorful background - only on swap page, desktop only */}
      {isSwapPage && !isMobile && (
        <div
          className="fixed top-0 left-0 right-0 pointer-events-none z-40"
          style={{
            height: "165px",
            background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 15%, rgba(0, 0, 0, 0.25) 30%, rgba(0, 0, 0, 0.15) 50%, rgba(0, 0, 0, 0.08) 70%, rgba(0, 0, 0, 0.03) 85%, transparent 100%)",
            marginTop: "48.4px",
          }}
        />
      )}
    </>
  );
}

