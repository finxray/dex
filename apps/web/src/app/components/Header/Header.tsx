"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useConnectors } from "wagmi";
import { NavLink } from "../../types/navigation";
import { navLinks } from "../../data/navLinks";
import styles from "./Header.module.css";

export function Header() {
  const pathname = usePathname();
  const isSwapPage = pathname === "/swap";
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [showBorder, setShowBorder] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [logoPosition, setLogoPosition] = useState({ x: 24, y: 12.424, width: 52.5, height: 19.152 });
  const [headerSize, setHeaderSize] = useState({ width: 980, height: 44 });

  const lastScrollYRef = useRef(0);
  
  // Menu items for swap page
  const swapNavLinks = [
    { label: "Swap", href: "/swap" },
    { label: "Liquidity", href: "/liquidity" },
    { label: "Pools", href: "/pools" },
    { label: "Positions", href: "/positions" },
    { label: "Analytics", href: "/analytics" },
  ];
  
  // Use swap menu items when on swap page, otherwise use regular navLinks
  const currentNavLinks = isSwapPage ? swapNavLinks : navLinks;

  const { address, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending: isConnectPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  // Safely check if connectors are available
  const hasConnector = connectors && connectors.length > 0;

  useEffect(() => {
    const handleScroll = () => {
      if (isMenuOpen) {
        setIsHeaderHidden(false);
        lastScrollYRef.current = window.scrollY;
        return;
      }

      const currentY = window.scrollY;
      const lastY = lastScrollYRef.current;
      const isScrollingDown = currentY > lastY;

      if (isScrollingDown && currentY > 80) {
        setIsHeaderHidden(true);
      } else {
        setIsHeaderHidden(false);
      }

      // Show border when scrolled more than 100px
      setShowBorder(currentY > 100);

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isMenuOpen]);

  const handleNavClick = () => setIsMenuOpen(false);
  const toggleMenu = () => setIsMenuOpen((prev) => !prev);

  const handleMenuEnter = (label: string) => {
    setActiveMenu(label);
  };

  const handleMenuLeave = () => {
    setActiveMenu(null);
  };

  const currentMega = activeMenu && !isSwapPage
    ? navLinks.find((link) => link.label === activeMenu && link.mega)
    : undefined;

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
        const logoImg = logoRef.current.querySelector('img');
        const logoWidth = logoImg ? logoImg.offsetWidth : 52.5;
        const logoHeight = logoImg ? logoImg.offsetHeight : 19.152;
        
        // Calculate position relative to header
        const relativeX = logoRect.left - headerRect.left;
        const relativeY = logoRect.top - headerRect.top;
        
        setLogoPosition({ 
          x: relativeX, 
          y: relativeY,
          width: logoWidth,
          height: logoHeight
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
        className={`fixed inset-x-0 top-0 z-50 backdrop-blur-2xl backdrop-saturate-[180%] transition-transform duration-300 ${
          isHeaderHidden ? "-translate-y-full" : "translate-y-0"
        } ${showBorder ? "border-b border-white/10" : ""}`}
        style={showBorder ? { borderBottomWidth: "0.5px" } : {}}
        onMouseLeave={handleMenuLeave}
      >
        {/* SVG mask definition */}
        <svg 
          width="100%" 
          height="100%" 
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
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
        {/* Shimmer effect positioned at logo location - between logo and toolbar */}
        <div
          className="absolute overflow-hidden"
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
              background: "linear-gradient(70deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.6) 20%, rgba(255, 255, 255, 1) 50%, rgba(255, 255, 255, 0.6) 80%, rgba(255, 255, 255, 0.3) 100%)",
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
        {/* Toolbar background with mask cutout */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "rgba(0, 0, 0, 1)",
            mask: "url(#toolbarCutoutMask)",
            WebkitMask: "url(#toolbarCutoutMask)",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div className="mx-auto flex h-11 max-w-[980px] items-center justify-between px-6 relative z-10">
          <div ref={logoRef}>
            <Link
              href="/"
              className="flex items-center flex-shrink-0 relative"
              aria-label="Stoix home"
              onClick={handleNavClick}
            >
            {/* Desktop logo - hidden so green background shows through cutout */}
            <span className="hidden md:block relative inline-block h-[19.152px]">
              <img
                src="/stoix full white smaller.svg"
                alt="Stoix"
                className="h-[19.152px] w-auto relative z-10"
                style={{ display: "block", opacity: 0 }}
              />
            </span>
            {/* Mobile logo - hidden so green background shows through cutout */}
            <span className="block md:hidden relative inline-block h-[22.8px]">
              <img
                src="/stoix helmet white.png"
                alt="Stoix helmet"
                className="h-[22.8px] w-auto relative z-10"
                style={{ display: "block", opacity: 0 }}
              />
            </span>
          </Link>
          </div>
        <nav className="hidden items-center gap-8 text-xs font-normal text-white/80 md:flex flex-1 justify-center">
          {currentNavLinks.map((item) => (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => !isSwapPage && handleMenuEnter(item.label)}
            >
              <Link
                href={item.href}
                className="block transition-colors hover:text-white whitespace-nowrap"
                style={{ color: activeMenu === item.label ? "#ffffff" : undefined }}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-6 flex-shrink-0">
          {isConnected ? (
            <div className="hidden items-center gap-3 md:flex flex-shrink-0">
              <span className="text-xs text-white/60 whitespace-nowrap">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white whitespace-nowrap"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                try {
                  if (hasConnector && connectors[0]) {
                    connect({ connector: connectors[0] });
                  }
                } catch (error) {
                  console.error("Failed to connect wallet:", error);
                }
              }}
              disabled={isConnectPending || !hasConnector}
              className="hidden rounded-full border border-white/20 px-3 py-1 text-xs font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed md:flex items-center justify-center whitespace-nowrap"
            >
              {isConnectPending ? "Connecting..." : connectError ? "No Wallet Found" : "Connect Wallet"}
            </button>
          )}
          <Link
            href={isSwapPage ? "/" : "/swap"}
            className="hidden rounded-full border border-white/20 px-3 py-1 text-xs font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white md:flex items-center justify-center whitespace-nowrap min-w-[110px] flex-shrink-0"
          >
            {isSwapPage ? "About Protocol" : "Launch App"}
          </Link>
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={isMenuOpen}
            onClick={toggleMenu}
            className="group flex h-11 w-11 items-center justify-center text-white/80 transition-colors hover:text-white md:hidden"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 16 16"
            >
              {isMenuOpen ? (
                <>
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </>
              ) : (
                <>
                  <line x1="2" y1="6" x2="14" y2="6" className="transition-transform duration-200" />
                  <line x1="3" y1="10" x2="14" y2="10" className="transition-transform duration-200 group-hover:translate-x-[-1px]" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>
      
      {/* Mega Menu - only show on non-swap pages */}
      {!isSwapPage && (
        <div
          className={`hidden border-t border-white/10 bg-white/5 backdrop-blur-2xl backdrop-saturate-[180%] transition-all duration-300 md:block ${
            currentMega?.mega ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
          onMouseEnter={() => currentMega && handleMenuEnter(currentMega.label)}
        >
        <div className="mx-auto grid max-w-[980px] grid-cols-3 gap-x-20 px-6 py-10">
          {currentMega?.mega?.map((group) => (
            <div key={group.heading} className="space-y-4 px-3">
              <h3 className="pl-3 text-xs font-medium text-white/60">
                {group.heading}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.title}>
                    <Link
                      href={item.href}
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-normal text-white/75 transition-all hover:bg-white/5 hover:text-white hover:ring-1 hover:ring-inset hover:ring-white/25"
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
      )}

      {/* Mobile Menu */}
      {isMenuOpen ? (
        <div className="border-t border-white/10 bg-black/95 px-6 py-4 md:hidden max-h-[calc(100vh-44px)] overflow-y-auto overscroll-contain">
          <nav className="flex flex-col gap-6 text-sm text-white">
            {currentNavLinks.map((item) => (
              <div key={item.label} className="space-y-4">
                <Link
                  href={item.href}
                  className="inline-flex items-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={handleNavClick}
                >
                  {item.label}
                </Link>
                {!isSwapPage && (item as NavLink).mega ? (
                  <div className="space-y-4">
                    {(item as NavLink).mega?.map((group) => (
                      <div key={group.heading} className="space-y-2 pl-3">
                        <h3 className="text-xs font-medium text-white/60">
                          {group.heading}
                        </h3>
                        <ul className="space-y-1">
                          {group.items.map((subItem) => (
                            <li key={subItem.title}>
                              <Link
                                href={subItem.href}
                                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-normal text-white/75 transition-all hover:bg-white/5 hover:text-white hover:ring-1 hover:ring-inset hover:ring-white/25"
                                onClick={handleNavClick}
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
                    className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    try {
                      if (hasConnector && connectors[0]) {
                        connect({ connector: connectors[0] });
                      }
                    } catch (error) {
                      console.error("Failed to connect wallet:", error);
                    }
                    handleNavClick();
                  }}
                  disabled={isConnectPending || !hasConnector}
                  className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnectPending ? "Connecting..." : connectError ? "No Wallet Found" : "Connect Wallet"}
                </button>
              )}
              <Link
                href={isSwapPage ? "/" : "/swap"}
                onClick={handleNavClick}
                className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
              >
                {isSwapPage ? "About Protocol" : "Launch App"}
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
      </header>
    </>
  );
}

