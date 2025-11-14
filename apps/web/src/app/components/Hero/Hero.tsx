"use client";

import React, { useEffect, useState } from "react";
import styles from "./Hero.module.css";

export function Hero() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="min-h-[85vh] flex flex-col items-center justify-center text-center relative px-6">
      <div
        className={`transition-all duration-1000 transform ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h1 className="text-6xl md:text-7xl font-semibold tracking-tight text-white mb-6">
          Stoix Protocol
        </h1>
        <p
          className="mx-auto max-w-3xl text-3xl md:text-4xl font-semibold leading-tight text-white/90 mb-4 transition-all duration-1000 delay-100"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          Institutional-grade liquidity coordination.
        </p>
        <p
          className="mx-auto max-w-2xl text-xl leading-relaxed text-white/60 transition-all duration-1000 delay-200"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          A modular DeFi architecture that separates pricing, execution, and risk management into composable primitives.
        </p>
      </div>

      <div
        className="mt-12 flex flex-col sm:flex-row gap-4 transition-all duration-1000 delay-400"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(20px)",
        }}
      >
        <a
          href="#architecture"
          className="px-8 py-3 md:py-3 bg-[#007AFF] hover:bg-[#0066CC] rounded-full font-normal text-[17px] text-white transition-all touch-manipulation min-h-[48px] md:min-h-0 flex items-center justify-center"
          style={{ minHeight: "48px" }}
        >
          Explore Architecture
        </a>
        <a
          href="#code"
          className="px-8 py-3 md:py-3 border border-white/30 hover:bg-white/10 hover:border-white/40 rounded-full font-normal text-[17px] text-white transition-all touch-manipulation min-h-[48px] md:min-h-0 flex items-center justify-center"
          style={{ minHeight: "48px" }}
        >
          View Code Examples
        </a>
      </div>
    </section>
  );
}
