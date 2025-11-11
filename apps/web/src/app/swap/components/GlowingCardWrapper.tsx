"use client";

import { type ReactNode, type CSSProperties } from "react";

type Phase = "closed" | "opening" | "open" | "closing";

type GlowingCardWrapperProps = {
  phase: Phase;
  children: ReactNode;
  glowGradient?: string;
  className?: string;
  style?: CSSProperties;
};

export function GlowingCardWrapper({
  phase,
  children,
  glowGradient = "linear-gradient(90deg, #38bdf8, #6366f1, #ec4899, #f472b6, #06b6d4, #3b82f6, #8b5cf6, #38bdf8)",
  className = "",
  style = {},
}: GlowingCardWrapperProps) {
  return (
    <div className={`relative ${className}`} style={{ isolation: "isolate", ...style }}>
      {/* Animated glow shadow underneath - starts fading in after size animation completes */}
      {(phase === "opening" || phase === "open") ? (
        <div 
          className="absolute -inset-[2px] rounded-[22px]"
          style={{
            background: glowGradient,
            backgroundSize: "200% 100%",
            animation: phase === "opening" 
              ? "glowShift 8s linear infinite, glowFadeIn 2s ease-in 0.52s forwards"
              : "glowShift 8s linear infinite",
            filter: "blur(12px)",
            opacity: phase === "opening" ? 0 : 0.45,
            zIndex: -1,
            position: "absolute",
            transform: "scale(1)",
            transformOrigin: "center",
            willChange: phase === "opening" ? "opacity" : "auto",
          }}
        />
      ) : null}
      
      {children}
    </div>
  );
}

