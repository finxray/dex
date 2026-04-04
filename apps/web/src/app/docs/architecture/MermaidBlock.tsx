"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import mermaid from "mermaid";

let mermaidInit = false;

function initMermaidOnce() {
  if (mermaidInit) return;
  mermaidInit = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "strict",
    themeVariables: {
      darkMode: false,
      background: "transparent",
      fontSize: "17px",
      fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",

      primaryColor: "#4f46e5",
      primaryTextColor: "#f5f3ff",
      primaryBorderColor: "#818cf8",

      secondaryColor: "#0f766e",
      secondaryTextColor: "#ccfbf1",
      secondaryBorderColor: "#2dd4bf",

      tertiaryColor: "#1e293b",
      tertiaryTextColor: "#e2e8f0",
      tertiaryBorderColor: "#64748b",

      lineColor: "rgba(56, 189, 248, 0.85)",
      textColor: "#e4e4e7",
      mainBkg: "#1e1b4b",
      nodeBorder: "rgba(129, 140, 248, 0.5)",
      clusterBkg: "rgba(30, 27, 75, 0.55)",
      clusterBorder: "rgba(129, 140, 248, 0.35)",
      titleColor: "#f8fafc",
      edgeLabelBackground: "rgba(15, 23, 42, 0.92)",

      primaryBorderRadius: "14px",
      secondaryBorderRadius: "14px",

      actorBkg: "#312e81",
      actorBorder: "#818cf8",
      actorTextColor: "#eef2ff",
      actorLineColor: "#6366f1",
      signalColor: "#38bdf8",
      signalTextColor: "#e0f2fe",
      labelBoxBkgColor: "#1e293b",
      labelBoxBorderColor: "#475569",
      labelTextColor: "#f1f5f9",
      loopTextColor: "#94a3b8",
      activationBorderColor: "#38bdf8",
      activationBkgColor: "#334155",
      sequenceNumberColor: "#f8fafc",
    },
    flowchart: {
      curve: "basis",
      padding: 18,
      useMaxWidth: true,
      htmlLabels: true,
    },
    sequence: {
      actorMargin: 62,
      mirrorActors: true,
      messageMargin: 42,
      boxMargin: 12,
      boxTextMargin: 6,
      noteMargin: 12,
    },
    themeCSS: `
      .node rect,
      .node polygon,
      .node circle {
        stroke-width: 2px !important;
      }
      .node rect {
        rx: 14px !important;
        ry: 14px !important;
      }
      .cluster rect {
        rx: 18px !important;
        ry: 18px !important;
        stroke-width: 1.5px !important;
        fill: rgba(30, 27, 75, 0.45) !important;
      }
      .edgePath .path {
        stroke-width: 2px !important;
      }
      .nodeLabel {
        font-size: 15px !important;
        font-weight: 500 !important;
      }
      .edgeLabel {
        font-size: 13px !important;
      }
      .edgeLabel rect {
        rx: 8px !important;
        ry: 8px !important;
      }
      text.actor {
        font-size: 15px !important;
        font-weight: 600 !important;
      }
      .messageText {
        font-size: 14px !important;
      }
    `,
  });
}

const diagramWrap: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.06)",
  marginLeft: "-1rem",
  marginRight: "-1rem",
  marginBottom: "-1rem",
  padding: "1rem 1rem 1.25rem",
};

export function MermaidBlock({ id, chart }: { id: string; chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      initMermaidOnce();
      const el = containerRef.current;
      if (!el) return;
      el.innerHTML = "";
      try {
        const { svg } = await mermaid.render(`${id}-${Math.random().toString(36).slice(2)}`, chart);
        if (!cancelled) el.innerHTML = svg;
      } catch {
        if (!cancelled) el.innerHTML = `<p class="text-base text-red-400">Diagram render error.</p>`;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [id, chart]);

  return (
    <div className="architecture-mermaid -mx-4 overflow-x-auto md:-mx-6" style={diagramWrap} aria-label={`Diagram: ${id}`}>
      <div ref={containerRef} className="min-h-[100px] [&_svg]:max-w-none" />
    </div>
  );
}
