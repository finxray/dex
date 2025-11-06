"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useConnectors } from "wagmi";
import { NavLink } from "../../types/navigation";
import { navLinks } from "../../data/navLinks";
import styles from "./Header.module.css";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  const lastScrollYRef = useRef(0);

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

  const currentMega = activeMenu
    ? navLinks.find((link) => link.label === activeMenu && link.mega)
    : undefined;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-2xl backdrop-saturate-[180%] transition-transform duration-300 ${
        isHeaderHidden ? "-translate-y-full" : "translate-y-0"
      }`}
      onMouseLeave={handleMenuLeave}
    >
      <div className="mx-auto flex h-11 max-w-[980px] items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center"
          aria-label="Stoix home"
          onClick={handleNavClick}
        >
          <Image
            src="/stoix full white.png"
            alt="Stoix"
            width={1873}
            height={819}
            className="hidden h-6 w-auto md:block"
            priority
          />
          <Image
            src="/stoix helmet white.png"
            alt="Stoix helmet"
            width={475}
            height={806}
            className="h-6 w-auto md:hidden"
            priority
          />
        </Link>
        <nav className="hidden items-center gap-8 text-xs font-normal text-white/80 md:flex">
          {navLinks.map((item) => (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => handleMenuEnter(item.label)}
            >
              <Link
                href={item.href}
                className="block transition-colors hover:text-white"
                style={{ color: activeMenu === item.label ? "#ffffff" : undefined }}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-6">
          {isConnected ? (
            <div className="hidden items-center gap-3 md:flex">
              <span className="text-xs text-white/60">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white"
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
              className="hidden rounded-full border border-white/20 px-3 py-1 text-xs font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed md:block"
            >
              {isConnectPending ? "Connecting..." : connectError ? "No Wallet Found" : "Connect Wallet"}
            </button>
          )}
          <Link
            href="/swap"
            className="hidden rounded-full border border-white/20 px-3 py-1 text-xs font-normal text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:text-white md:block"
          >
            Launch App
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
      
      {/* Mega Menu */}
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

      {/* Mobile Menu */}
      {isMenuOpen ? (
        <div className="border-t border-white/10 bg-black/95 px-6 py-4 md:hidden max-h-[calc(100vh-44px)] overflow-y-auto overscroll-contain">
          <nav className="flex flex-col gap-6 text-sm text-white">
            {navLinks.map((item) => (
              <div key={item.label} className="space-y-4">
                <Link
                  href={item.href}
                  className="inline-flex items-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={handleNavClick}
                >
                  {item.label}
                </Link>
                {item.mega ? (
                  <div className="space-y-4">
                    {item.mega.map((group) => (
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
                href="/swap"
                onClick={handleNavClick}
                className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
              >
                Launch App
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

