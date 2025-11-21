"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface TestScrollCardProps {
  isOpen: boolean;
  onClose: () => void;
  cardRect?: DOMRect | null;
  items?: string[];
  title?: string;
}

export function TestScrollCard({ 
  isOpen, 
  onClose, 
  cardRect = null,
  items,
  title = "Test Scroll Card"
}: TestScrollCardProps) {
  const defaultItems = Array.from({ length: 50 }, (_, i) => `Test Item ${i + 1} - This is a scrollable item for testing purposes`);
  const testItems = items || defaultItems;
  
  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragLastRef = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cardOffsetRef = useRef({ x: 0, y: 0 });
  
  // Keep ref in sync with state
  useEffect(() => {
    cardOffsetRef.current = cardOffset;
  }, [cardOffset]);

  const handleCardPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Only allow dragging from the header
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return; // Don't drag if clicking on buttons
    }
    // Don't start dragging if we're trying to scroll
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return; // Only allow left mouse button
    }
    event.preventDefault();
    event.stopPropagation();
    dragLastRef.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: PointerEvent) => {
      // Only handle move if we're actually dragging
      if (!isDragging || !dragLastRef.current) return;
      
      // Stop propagation to prevent interference from other handlers
      event.stopPropagation();
      event.preventDefault();
      
      // Ensure cardOffsetRef is initialized
      if (!cardOffsetRef.current) {
        cardOffsetRef.current = { x: 0, y: 0 };
      }
      
      const deltaX = event.clientX - dragLastRef.current.x;
      const deltaY = event.clientY - dragLastRef.current.y;
      dragLastRef.current = { x: event.clientX, y: event.clientY };
      const newOffset = {
        x: cardOffsetRef.current.x + deltaX,
        y: cardOffsetRef.current.y + deltaY,
      };
      cardOffsetRef.current = newOffset;
      setCardOffset(newOffset);
    };

    const handleUp = (event?: PointerEvent) => {
      if (event) {
        event.stopPropagation();
      }
      dragLastRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleUp, true);

    return () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleUp, true);
    };
  }, [isDragging]);

  if (!isOpen) {
    return null;
  }
  
  // If cardRect is provided, position relative to it. Otherwise center on screen.
  const finalCardRect = cardRect || (typeof window !== 'undefined' ? new DOMRect(window.innerWidth / 2 - 200, window.innerHeight / 2 - 300, 400, 600) : null);
  
  if (!finalCardRect) {
    return null;
  }

  const topPos = cardRect ? finalCardRect.top : window.innerHeight / 2 - 300;
  const leftPos = cardRect ? finalCardRect.right + 20 : window.innerWidth / 2 - 200;
  
  return createPortal(
    <div 
      data-test-scroll-card
      ref={cardRef}
      className="fixed"
      style={{ 
        zIndex: 999999,
        top: `${topPos}px`,
        left: `${leftPos}px`,
        right: "auto",
        bottom: "auto",
        pointerEvents: "auto",
      }}
    >
      <div 
        className="bg-gray-900 border border-white/20 rounded-lg shadow-2xl" 
        style={{ 
          width: "400px", 
          height: "600px", 
          display: "flex", 
          flexDirection: "column",
          transform: `translate(${cardOffset.x}px, ${cardOffset.y}px)`,
          transition: isDragging ? "none" : "transform 0.1s ease-out",
          cursor: isDragging ? "grabbing" : "default",
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          position: "relative",
          zIndex: 999999,
        }}
      >
        {/* Header - Draggable area */}
        <div 
          className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handleCardPointerDown}
        >
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div 
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px",
            minHeight: 0,
          }}
        >
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {testItems.map((item, index) => (
              <li 
                key={index}
                style={{
                  padding: "12px",
                  marginBottom: "8px",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderRadius: "8px",
                  color: "white",
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    typeof document !== 'undefined' ? document.body : null
  );
}


