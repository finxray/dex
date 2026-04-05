"use client";

import React, { useEffect, useState } from "react";

export function Hero() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="min-h-[85vh] flex flex-col items-center justify-center text-center relative px-6">
      <div
        className={`transform-gpu transition-[opacity,transform] duration-1000 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h1 className="text-6xl md:text-7xl font-semibold tracking-tight text-white mb-6">
          Stoix Protocol
        </h1>
        <p
          className="mx-auto max-w-3xl text-3xl md:text-4xl font-semibold leading-tight text-white/90 mb-4 transform-gpu transition-[opacity,transform] duration-1000 delay-100 ease-out"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          Institutional-grade liquidity coordination.
        </p>
        <p
          className="mx-auto max-w-2xl text-xl leading-relaxed text-white/60 transform-gpu transition-[opacity,transform] duration-1000 delay-200 ease-out"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          A modular DeFi architecture that separates pricing, execution, and risk management into composable primitives.
        </p>
      </div>

      <div
        className="mt-12 flex transform-gpu flex-col gap-4 transition-[opacity,transform] duration-1000 delay-400 ease-out sm:flex-row md:gap-[0.8rem]"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(20px)",
        }}
      >
        <a
          href="#architecture"
          className="flex min-h-[48px] touch-manipulation items-center justify-center rounded-full bg-[#007AFF] px-8 py-3 font-normal text-[17px] text-white transition-all hover:bg-[#0066CC] md:min-h-[38.4px] md:px-[1.6rem] md:py-[0.6rem] md:text-[13.6px]"
        >
          Explore Architecture
        </a>
        <a
          href="#code"
          className="flex min-h-[48px] touch-manipulation items-center justify-center rounded-full border border-white/30 px-8 py-3 font-normal text-[17px] text-white transition-all hover:border-white/40 hover:bg-white/10 md:min-h-[38.4px] md:px-[1.6rem] md:py-[0.6rem] md:text-[13.6px]"
        >
          View Code Examples
        </a>
      </div>
    </section>
  );
}
