"use client";

import type { MouseEvent, TouchEvent } from "react";

type ChartHeaderProps = {
  label: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
};

export function ChartHeader({
  label,
  isMaximized,
  onToggleMaximize,
  onClose,
  onMouseDown,
  onTouchStart,
}: ChartHeaderProps) {
  return (
    <div
      className="relative z-10 flex h-11 items-center justify-between bg-white/5 px-4 md:px-6 backdrop-blur-xl backdrop-saturate-[180%]"
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown(event);
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
        onTouchStart(event);
      }}
    >
      <div className="text-xs font-medium tracking-wide text-white/70">{label}</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleMaximize();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          <span className="text-[20px] leading-none -translate-y-[1px]">{isMaximized ? "↘" : "⤢"}</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-[#ff5f57]/15 hover:text-[#ff5f57]"
          aria-label="Close"
        >
          <span className="text-[24px] leading-none -translate-y-[0.5px]">×</span>
        </button>
      </div>
    </div>
  );
}
