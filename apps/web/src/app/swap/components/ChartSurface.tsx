"use client";

import type { MutableRefObject } from "react";

type ChartSurfaceProps = {
  isMaximized: boolean;
  widgetContainerId: string;
  widgetRootRef: MutableRefObject<HTMLDivElement | null>;
};

export function ChartSurface({ isMaximized, widgetContainerId, widgetRootRef }: ChartSurfaceProps) {
  return (
    <div
      className={`relative flex-1 overflow-hidden ${
        isMaximized ? "rounded-none" : "rounded-b-[28px]"
      }`}
      style={{
        backgroundColor: "rgba(18,18,21,0.7)",
        backdropFilter: "blur(48px)",
        WebkitBackdropFilter: "blur(48px)",
        marginTop: "-1px",
        paddingTop: "1px",
      }}
    >
      <div
        ref={widgetRootRef}
        id={widgetContainerId}
        className="absolute inset-0"
        style={{
          top: "-1px",
          bottom: "-2px",
          left: "-2px",
          right: "-2px",
        }}
      />
    </div>
  );
}
