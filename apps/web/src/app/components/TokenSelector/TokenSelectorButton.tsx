"use client";

import { useRef, useState, useEffect, useCallback, MutableRefObject } from "react";
import type { Token } from "./TokenSelector";

interface TokenSelectorButtonProps {
  selected: Token;
  onClick: () => void;
  isOpen?: boolean;
}

type PointerTracker = {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  moved: boolean;
  endedAt?: number;
};

const POINTER_MOVE_THRESHOLD = 6;
const LONG_PRESS_THRESHOLD = 220;

export function TokenSelectorButton({ selected, onClick, isOpen = false }: TokenSelectorButtonProps) {
  const buttonPointerDownRef = useRef<PointerTracker | null>(null);
  const isScrollingRef = useRef(false);

  const markScrolling = useCallback((delay = 250) => {
    isScrollingRef.current = true;
    setTimeout(() => {
      isScrollingRef.current = false;
    }, delay);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const maybeUpdateTracker = (trackerRef: MutableRefObject<PointerTracker | null>, event: PointerEvent) => {
      const tracker = trackerRef.current;
      if (!tracker || tracker.pointerId !== event.pointerId || tracker.moved) {
        return;
      }

      const deltaX = Math.abs(event.clientX - tracker.x);
      const deltaY = Math.abs(event.clientY - tracker.y);
      if (deltaX > POINTER_MOVE_THRESHOLD || deltaY > POINTER_MOVE_THRESHOLD) {
        tracker.moved = true;
        markScrolling();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      maybeUpdateTracker(buttonPointerDownRef, event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (buttonPointerDownRef.current?.pointerId === event.pointerId) {
        buttonPointerDownRef.current.endedAt = Date.now();
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (buttonPointerDownRef.current?.pointerId === event.pointerId) {
        buttonPointerDownRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
    };
  }, [markScrolling]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        
        if (isScrollingRef.current) {
          e.preventDefault();
          return;
        }
        
        const pointerInfo = buttonPointerDownRef.current;
        if (pointerInfo) {
          if (pointerInfo.moved) {
            buttonPointerDownRef.current = null;
            e.preventDefault();
            return;
          }
          const duration = (pointerInfo.endedAt ?? Date.now()) - pointerInfo.time;
          if (duration > LONG_PRESS_THRESHOLD) {
            buttonPointerDownRef.current = null;
            e.preventDefault();
            return;
          }
        }
        
        buttonPointerDownRef.current = null;
        onClick();
      }}
      onPointerDown={(e) => {
        buttonPointerDownRef.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          time: Date.now(),
          moved: false,
        };
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
      }}
      onPointerCancel={(e) => {
        if (buttonPointerDownRef.current?.pointerId === e.pointerId) {
          buttonPointerDownRef.current = null;
        }
        e.stopPropagation();
      }}
      onWheel={(e) => {
        markScrolling();
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        markScrolling();
        if (buttonPointerDownRef.current) {
          buttonPointerDownRef.current.moved = true;
        }
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
      }}
      className="flex items-center gap-2 rounded-full bg-white/10 pl-3 md:pl-4 pr-2 md:pr-3 py-2 md:py-2 text-sm md:text-sm text-white hover:bg-white/15 w-fit touch-manipulation min-h-[48px] md:min-h-0"
      style={{ minHeight: "48px" }}
    >
      {selected.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selected.icon}
          alt={selected.symbol}
          className="h-5 w-5 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
          }}
        />
      ) : (
        <div className="h-5 w-5 rounded-full bg-white/20 ring-1 ring-white/15" />
      )}
      <span className="font-medium">{selected.symbol}</span>
      <div className="flex-shrink-0">
        <svg className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>
  );
}


