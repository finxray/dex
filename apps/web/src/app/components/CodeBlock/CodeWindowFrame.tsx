"use client";

import type { ReactNode } from "react";

export type CodeWindowFrameProps = {
  /** Top-left caption (e.g. Pool Manager) */
  title?: string;
  /** Top-right caption, uppercase (e.g. TYPESCRIPT) */
  label?: string;
  children: ReactNode;
  className?: string;
  /** Anchor id for in-page navigation */
  sectionId?: string;
  /** Added to inner content wrapper (after traffic-light header) */
  contentClassName?: string;
};

/**
 * macOS-style glass window chrome — matches landing "Explore Architecture" / CodeBlock.
 */
export function CodeWindowFrame({
  title,
  label,
  children,
  className = "",
  sectionId,
  contentClassName = "",
}: CodeWindowFrameProps) {
  return (
    <div id={sectionId} className={`${className} ${sectionId ? "scroll-mt-28 md:scroll-mt-32" : ""}`}>
      {(title !== undefined || label !== undefined) && (
        <div className="mb-3 flex min-h-[1.25rem] items-center justify-between px-1">
          {title ? (
            <span className="text-sm font-medium text-white/50">{title}</span>
          ) : (
            <span aria-hidden className="inline-block w-0" />
          )}
          {label ? (
            <span className="text-xs font-medium uppercase tracking-wider text-white/30">{label}</span>
          ) : (
            <span aria-hidden className="inline-block w-0" />
          )}
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3">
          <div className="flex gap-2">
            <div className="size-3 shrink-0 rounded-full bg-[#FF5F57]" aria-hidden />
            <div className="size-3 shrink-0 rounded-full bg-[#FEBC2E]" aria-hidden />
            <div className="size-3 shrink-0 rounded-full bg-[#28C840]" aria-hidden />
          </div>
        </div>
        <div className="relative bg-black/20">
          <div className={`p-4 md:p-6 ${contentClassName}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
