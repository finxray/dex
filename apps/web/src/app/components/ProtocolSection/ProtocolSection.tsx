"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./ProtocolSection.module.css";

export function ProtocolSection() {
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
    <section
      id="protocol"
      ref={sectionRef}
      className="min-h-screen space-y-12 py-24"
    >
      <div
        className={`text-center mb-20 transition-all duration-1000 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h2 className="text-5xl md:text-6xl font-semibold text-white mb-6">
          Built for institutions
        </h2>
        <p className="text-xl md:text-2xl leading-relaxed text-white/60 max-w-4xl mx-auto">
          Inventory-aware pricing, circuit breakers, and verifiable risk telemetry.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {[
          {
            title: "Liquidity Coordination",
            description:
              "Route inventory across AMMs, RFQs, and RFMMs with deterministic guardrails.",
            icon: (
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            ),
            delay: 100,
          },
          {
            title: "Risk Management",
            description:
              "Automatic circuit breakers and position limits triggered by volatility sensors.",
            icon: (
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            ),
            delay: 200,
          },
          {
            title: "Guardian Network",
            description:
              "Decentralized governance with signed attestations for compliance and auditing.",
            icon: (
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ),
            delay: 300,
          },
        ].map((feature, idx) => (
          <div
            key={feature.title}
            className={`space-y-4 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 md:p-10 transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
            style={{ transitionDelay: `${feature.delay}ms` }}
          >
            <div className="inline-flex p-3 rounded-xl bg-white/10 text-white">
              {feature.icon}
            </div>
            <h3 className="text-2xl font-semibold text-white">{feature.title}</h3>
            <p className="text-[17px] leading-relaxed text-white/60">{feature.description}</p>
          </div>
        ))}
      </div>

    </section>
  );
}
