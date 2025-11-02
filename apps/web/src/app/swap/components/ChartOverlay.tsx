"use client";

import { createPortal } from "react-dom";
import type { CSSProperties, MutableRefObject } from "react";
import { ChartHeader } from "./ChartHeader";

type ChartPhase = "closed" | "opening" | "open" | "closing";

type ChartOverlayProps = {
  shouldRender: boolean;
  containerStyle: CSSProperties;
  phase: ChartPhase;
  animationDuration: number;
  isChartMaximized: boolean;
  chartLabel: string;
  widgetContainerId?: string;
  widgetRootRef?: MutableRefObject<HTMLDivElement | null>;
  onHeaderMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHeaderTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export function ChartOverlay({
  shouldRender,
  containerStyle,
  phase,
  animationDuration,
  isChartMaximized,
  chartLabel,
  widgetContainerId,
  widgetRootRef,
  onHeaderMouseDown,
  onHeaderTouchStart,
  onToggleMaximize,
  onClose,
}: ChartOverlayProps) {
  if (!shouldRender || typeof window === "undefined") {
    return null;
  }

  const isActive = phase === "opening" || phase === "open";

  const overlayStyle: CSSProperties = {
    ...containerStyle,
    opacity: isActive ? 1 : 0,
    transform: `scale(${isActive ? 1 : 0.6})`,
    transformOrigin: "center center",
    transition: `opacity ${animationDuration}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${animationDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    willChange: "transform, opacity",
    pointerEvents: isActive ? "auto" : "none",
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] pointer-events-none">
      <div className="relative flex h-full w-full items-center justify-center">
        <div className="pointer-events-auto" style={overlayStyle}>
          <div
            className={`relative flex h-full w-full max-h-[520px] max-w-[720px] flex-col overflow-hidden border border-white/12 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.85)] ${
              isChartMaximized
                ? "rounded-none"
                : "rounded-[28px]"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="absolute inset-0 -z-10 bg-black/40 backdrop-blur-2xl backdrop-saturate-[180%]"
              style={{
                borderRadius: "inherit",
              }}
            />

            <ChartHeader
              label={chartLabel}
              isMaximized={isChartMaximized}
              onToggleMaximize={onToggleMaximize}
              onClose={onClose}
              onMouseDown={onHeaderMouseDown}
              onTouchStart={onHeaderTouchStart}
            />

            <div className="flex flex-1 items-center justify-center border-t border-white/10">
              <div className="rounded-3xl border border-white/12 bg-white/5 px-10 py-14 text-center text-white/65">
                <div className="text-sm font-medium uppercase tracking-[0.35em] text-white/70">Chart canvas</div>
                <p className="mt-4 text-xs text-white/55">
                  TradingView widget will be embedded here in a later step.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
