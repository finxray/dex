"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./CompanySection.module.css";

export function CompanySection() {
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
    <section id="company" ref={sectionRef} className="min-h-screen space-y-12 py-32">
      <div
        className={`text-center transition-all duration-1000 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h2 className="text-5xl md:text-6xl font-semibold text-black mb-6">Built with institutions</h2>
        <p className="text-xl md:text-2xl leading-relaxed text-black/60 max-w-4xl mx-auto">
          Co-designed with liquidity providers, exchanges, and custodians that need audit-grade controls with high-frequency execution.
        </p>
      </div>
    </section>
  );
}

