"use client";

import React, { useEffect, useRef, useState } from "react";
import { CodeBlock } from "../CodeBlock/CodeBlock";

export function ArchitectureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const poolManagerCode = `// Create a new ETH/USDC pool
const poolId = await poolManager.createPool(
  ETH_ADDRESS,
  USDC_ADDRESS,
  3000,  // 0.3% fee
  60     // tick spacing
);`;

  const quoterCode = `// Get inventory-aware quote
const quote = await stoicovQuoter.quoteSwap(
  poolId,
  ethers.utils.parseEther("1.0"),
  true  // ETH -> USDC
);`;

  const riskEngineCode = `// Execute swap with risk validation
const tx = await poolManager.swap(
  poolId,
  true,
  ethers.utils.parseEther("1.0"),
  "0x"  // hook data
);`;

  return (
    <section
      id="architecture"
      ref={sectionRef}
      className="min-h-screen py-32 relative"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div
          className={`mb-20 text-center transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-5xl md:text-6xl font-semibold text-white mb-6">
            Modular Architecture
          </h2>
          <p className="text-xl md:text-2xl text-white/60 max-w-4xl mx-auto leading-relaxed">
            Stoix separates liquidity operations into independent, composable contracts.
            Each module handles a specific concern.
          </p>
        </div>

        <div className="grid gap-16">
          {/* Pool Manager */}
          <div
            className={`transition-all duration-1000 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
          >
            <div className="mb-8 text-center">
              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-4">Create Pool</h3>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto">
                Initialize liquidity pools with custom parameters.
              </p>
            </div>
            <CodeBlock code={poolManagerCode} language="typescript" title="Pool Manager" typingDemo />
          </div>

          {/* Quoter */}
          <div
            className={`transition-all duration-1000 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
          >
            <div className="mb-8 text-center">
              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-4">Get Quote</h3>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto">
                Inventory-aware pricing with the Stoicov model.
              </p>
            </div>
            <CodeBlock code={quoterCode} language="typescript" title="Stoicov Quoter" typingDemo />
          </div>

          {/* Risk Engine */}
          <div
            className={`transition-all duration-1000 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
          >
            <div className="mb-8 text-center">
              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-4">Execute Swap</h3>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto">
                Trade execution with built-in risk validation.
              </p>
            </div>
            <CodeBlock code={riskEngineCode} language="typescript" title="Swap Execution" typingDemo />
          </div>
        </div>

      </div>
    </section>
  );
}

