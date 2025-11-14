"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./TechnologySection.module.css";

export function TechnologySection() {
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

  return (
    <section id="technology" ref={sectionRef} className="min-h-screen space-y-12 py-32">
      <div
        className={`text-center mb-20 transition-all duration-1000 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h2 className="text-5xl md:text-6xl font-semibold text-black mb-6">Technology Stack</h2>
        <p className="text-xl md:text-2xl leading-relaxed text-black/60 max-w-4xl mx-auto">
          Built on Foundry with library-first architecture and end-to-end type safety.
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-3">
        {[
          {
            title: "Smart Contracts",
            description:
              "Composable core logic with library-first design and deterministic pool ID assembly.",
            delay: 100,
          },
          {
            title: "Periphery Suite",
            description:
              "Orchestrators that connect Stoix liquidity to exchanges, bridges, and custody systems.",
            delay: 200,
          },
          {
            title: "Data Bridges",
            description:
              "Stream signed market data, mark-to-market curves, and volatility cones on-chain.",
            delay: 300,
          },
        ].map((item, idx) => (
          <div
            key={item.title}
            className={`space-y-4 rounded-3xl border border-black/10 bg-white p-6 md:p-10 transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
            style={{ transitionDelay: `${item.delay}ms` }}
          >
            <h3 className="text-2xl font-semibold text-black">{item.title}</h3>
            <p className="text-[17px] leading-relaxed text-black/60">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

