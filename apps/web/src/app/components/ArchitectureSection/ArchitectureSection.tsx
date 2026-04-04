"use client";

import React, { useEffect, useRef, useState } from "react";
import { CodeBlock } from "../CodeBlock/CodeBlock";

/** Delay between starting each code card’s typewriter when multiple are in view (by page order). */
const CARD_TYPING_STAGGER_MS = 2000;

export function ArchitectureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const card0Ref = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const cardVisibleRef = useRef<[boolean, boolean, boolean]>([false, false, false]);
  const [typingStaggerMs, setTypingStaggerMs] = useState<[number, number, number]>([0, 0, 0]);

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

  useEffect(() => {
    const cardRefs = [card0Ref, card1Ref, card2Ref];
    const recomputeStagger = () => {
      const v = cardVisibleRef.current;
      const visibleIndices = [0, 1, 2].filter((i) => v[i]);
      const next: [number, number, number] = [0, 0, 0];
      visibleIndices.forEach((cardIdx, rank) => {
        next[cardIdx] = rank * CARD_TYPING_STAGGER_MS;
      });
      setTypingStaggerMs((prev) =>
        prev[0] === next[0] && prev[1] === next[1] && prev[2] === next[2] ? prev : next
      );
    };

    const cardObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = cardRefs.findIndex((r) => r.current === entry.target);
          if (idx === -1) continue;
          cardVisibleRef.current[idx] = entry.isIntersecting;
        }
        recomputeStagger();
      },
      { threshold: 0.15, rootMargin: "0px" }
    );

    cardRefs.forEach((r) => {
      if (r.current) cardObserver.observe(r.current);
    });

    return () => cardObserver.disconnect();
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
          className={`mb-20 transform-gpu text-center transition-[opacity,transform] duration-1000 ease-out ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
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
            ref={card0Ref}
            className={`transform-gpu transition-[opacity,transform] duration-1000 ease-out delay-100 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            <div className="mb-8 text-center">
              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-4">Create Pool</h3>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto">
                Initialize liquidity pools with custom parameters.
              </p>
            </div>
            <CodeBlock
              code={poolManagerCode}
              language="typescript"
              title="Pool Manager"
              typingDemo
              typingStartDelayMs={typingStaggerMs[0]}
            />
          </div>

          {/* Quoter */}
          <div
            ref={card1Ref}
            className={`transform-gpu transition-[opacity,transform] duration-1000 ease-out delay-200 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            <div className="mb-8 text-center">
              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-4">Get Quote</h3>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto">
                Inventory-aware pricing with the Stoicov model.
              </p>
            </div>
            <CodeBlock
              code={quoterCode}
              language="typescript"
              title="Stoicov Quoter"
              typingDemo
              typingStartDelayMs={typingStaggerMs[1]}
            />
          </div>

          {/* Risk Engine */}
          <div
            ref={card2Ref}
            className={`transform-gpu transition-[opacity,transform] duration-1000 ease-out delay-300 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            <div className="mb-8 text-center">
              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-4">Execute Swap</h3>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto">
                Trade execution with built-in risk validation.
              </p>
            </div>
            <CodeBlock
              code={riskEngineCode}
              language="typescript"
              title="Swap Execution"
              typingDemo
              typingStartDelayMs={typingStaggerMs[2]}
            />
          </div>
        </div>

      </div>
    </section>
  );
}

