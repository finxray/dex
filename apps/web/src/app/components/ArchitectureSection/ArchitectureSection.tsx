"use client";

import React, { useEffect, useRef, useState } from "react";
import { CodeBlock, type TypingSequencePhase } from "../CodeBlock/CodeBlock";

const CARD_COUNT = 3;

export function ArchitectureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const firstCodeCardRef = useRef<HTMLDivElement>(null);
  /** Latched: first code card has intersected — sequence runs in order without resetting on scroll-away. */
  const [typingChainReady, setTypingChainReady] = useState(false);
  /** Number of cards finished typing (0…3). Next card index equals this while it types. */
  const [completedTypingCards, setCompletedTypingCards] = useState(0);

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
    const el = firstCodeCardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setTypingChainReady(true);
      },
      { threshold: 0.15, rootMargin: "0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const phaseForCard = (index: number): TypingSequencePhase => {
    if (!typingChainReady) return "queued";
    if (index < completedTypingCards) return "done";
    if (index === completedTypingCards && completedTypingCards < CARD_COUNT) return "typing";
    return "queued";
  };

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
            ref={firstCodeCardRef}
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
              typingSequencePhase={phaseForCard(0)}
              onTypingSequenceComplete={() =>
                setCompletedTypingCards((c) => Math.min(c + 1, CARD_COUNT))
              }
            />
          </div>

          {/* Quoter */}
          <div
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
              typingSequencePhase={phaseForCard(1)}
              onTypingSequenceComplete={() =>
                setCompletedTypingCards((c) => Math.min(c + 1, CARD_COUNT))
              }
            />
          </div>

          {/* Risk Engine */}
          <div
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
              typingSequencePhase={phaseForCard(2)}
              onTypingSequenceComplete={() =>
                setCompletedTypingCards((c) => Math.min(c + 1, CARD_COUNT))
              }
            />
          </div>
        </div>

      </div>
    </section>
  );
}
