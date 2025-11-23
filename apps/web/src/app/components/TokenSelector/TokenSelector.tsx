"use client";

import { useState, useRef, useEffect, useCallback, useMemo, MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { TokenSelectorButton } from "./TokenSelectorButton";
import { MobileTokenSelectorCard } from "./MobileTokenSelectorCard";

export type Token = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  icon?: string;
};

interface TokenSelectorProps {
  selected: Token;
  tokens: Token[];
  onSelect: (t: Token) => void;
  side?: "left" | "right";
  cardRect?: DOMRect | null;
  swapTitleRect?: DOMRect | null;
  swapCardRect?: DOMRect | null;
  onOpenOverride?: () => void;
  showButton?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function TokenSelector({ 
  selected, 
  tokens, 
  onSelect, 
  side = "left", 
  cardRect = null, 
  swapTitleRect = null, 
  swapCardRect = null, 
  onOpenOverride,
  showButton = true,
  open: controlledOpen,
  onClose
}: TokenSelectorProps) {
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Use controlled open state if provided, otherwise use internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : isOpenInternal;
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const buttonPointerDownRef = useRef<PointerTracker | null>(null);
  const tokenPointerDownRef = useRef<PointerTracker | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingSelector, setIsResizingSelector] = useState(false);
  const [resizeEdgeSelector, setResizeEdgeSelector] = useState<string | null>(null);
  const [selectorOffset, setSelectorOffset] = useState({ x: 0, y: 0 });
  const [selectorSize, setSelectorSize] = useState({ width: 360, height: 0 });
  const dragLastRef = useRef<{ x: number; y: number } | null>(null);
  const resizeSelectorStartRef = useRef<{ x: number; y: number; width: number; height: number; offsetX: number; offsetY: number } | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsDesktop(window.innerWidth >= 1024);
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Prevent mobile viewport changes when keyboard appears and lock body scroll
  useEffect(() => {
    if (!isMobile || !shouldRender || !isOpen) {
      return;
    }

    // Lock body scroll when mobile card is open
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '0';
    document.body.style.width = '100%';

    // Handle visual viewport changes (keyboard appearing)
    const handleViewportChange = () => {
      if (mobileCardRef.current) {
        // Keep card centered regardless of keyboard
        mobileCardRef.current.style.transform = 'translateY(0)';
      }
    };

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      if (typeof window !== 'undefined' && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, [isMobile, shouldRender, isOpen]);

  const animateDuration = 260;
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");

  // Handle controlled open state - set shouldRender when open becomes true
  useEffect(() => {
    if (controlledOpen !== undefined) {
      if (controlledOpen) {
        setShouldRender(true);
        setPhase("closed");
        setSelectorOffset({ x: 0, y: 0 });
        const viewportHeight = window.innerHeight;
        const height70vh = viewportHeight * 0.7;
        setSelectorSize({ width: 360, height: height70vh });
        requestAnimationFrame(() => {
          setPhase("opening");
          setTimeout(() => {
            setPhase("open");
          }, 520);
        });
      } else {
        setPhase("closing");
        setTimeout(() => {
          setShouldRender(false);
          setPhase("closed");
          setSearchTerm("");
        }, animateDuration);
      }
    }
  }, [controlledOpen, animateDuration]);

  const filteredTokens = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return tokens;
    return tokens.filter((t) =>
      t.symbol.toLowerCase().includes(query) || t.name.toLowerCase().includes(query)
    );
  }, [tokens, searchTerm]);

  const tokensToDisplay = filteredTokens.length ? filteredTokens : tokens;

  const openDropdown = () => {
    if (controlledOpen !== undefined) {
      // Controlled mode - don't open internally
      return;
    }
    
    // Prevent opening if already opening/closing to avoid race conditions
    // But allow opening if phase is "closed" (card fully closed)
    if (phase === "opening" || (phase === "closing" && isOpen)) {
      return;
    }
    
    setSearchTerm("");
    setShouldRender(true);
    setPhase("closed");
    setSelectorOffset({ x: 0, y: 0 });
    const viewportHeight = window.innerHeight;
    const height70vh = viewportHeight * 0.7;
    setSelectorSize({ width: 360, height: height70vh });
    
    // For mobile, update state immediately but phase will be managed by mobile component
    // For desktop, use the existing timing
    const isMobileDevice = !isDesktop;
    setIsOpenInternal(true);
    
    if (isMobileDevice) {
      // Mobile handles its own animation timing
      requestAnimationFrame(() => {
        setPhase("opening");
        setTimeout(() => {
          setPhase("open");
        }, 600); // Match mobile animation duration
      });
    } else {
      // Desktop timing
      requestAnimationFrame(() => {
        setPhase("opening");
        setTimeout(() => {
          setPhase("open");
        }, 520);
      });
    }
  };

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragLastRef.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
  };

  const handleResizeSelectorStart = (edge: string, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    
    resizeSelectorStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: selectorSize.width,
      height: selectorSize.height,
      offsetX: selectorOffset.x,
      offsetY: selectorOffset.y,
    };
    
    setResizeEdgeSelector(edge);
    setIsResizingSelector(true);
  };

  useEffect(() => {
    if (!isDragging && !isResizingSelector) return;

    const handleMove = (event: PointerEvent) => {
      if (isDragging && dragLastRef.current) {
        const deltaX = event.clientX - dragLastRef.current.x;
        const deltaY = event.clientY - dragLastRef.current.y;
        dragLastRef.current = { x: event.clientX, y: event.clientY };
        setSelectorOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
      } else if (isResizingSelector && resizeSelectorStartRef.current && resizeEdgeSelector) {
        const deltaX = event.clientX - resizeSelectorStartRef.current.x;
        const deltaY = event.clientY - resizeSelectorStartRef.current.y;
        
        let newWidth = resizeSelectorStartRef.current.width;
        let newHeight = resizeSelectorStartRef.current.height;
        
        if (resizeEdgeSelector.includes('right')) {
          newWidth = Math.max(300, Math.min(window.innerWidth - 100, resizeSelectorStartRef.current.width + deltaX));
        }
        if (resizeEdgeSelector.includes('left')) {
          newWidth = Math.max(300, Math.min(window.innerWidth - 100, resizeSelectorStartRef.current.width - deltaX));
        }
        if (resizeEdgeSelector.includes('bottom')) {
          newHeight = Math.max(400, Math.min(window.innerHeight - 100, resizeSelectorStartRef.current.height + deltaY));
        }
        if (resizeEdgeSelector.includes('top')) {
          newHeight = Math.max(400, Math.min(window.innerHeight - 100, resizeSelectorStartRef.current.height - deltaY));
        }
        
        setSelectorSize({ width: newWidth, height: newHeight });
        
        let newOffsetX = resizeSelectorStartRef.current.offsetX;
        let newOffsetY = resizeSelectorStartRef.current.offsetY;
        
        if (resizeEdgeSelector.includes('left')) {
          const widthChange = newWidth - resizeSelectorStartRef.current.width;
          newOffsetX = resizeSelectorStartRef.current.offsetX - (widthChange / 2);
        } else if (resizeEdgeSelector.includes('right')) {
          const widthChange = newWidth - resizeSelectorStartRef.current.width;
          newOffsetX = resizeSelectorStartRef.current.offsetX + (widthChange / 2);
        }
        
        if (resizeEdgeSelector.includes('top')) {
          const heightChange = newHeight - resizeSelectorStartRef.current.height;
          newOffsetY = resizeSelectorStartRef.current.offsetY - (heightChange / 2);
        } else if (resizeEdgeSelector.includes('bottom')) {
          const heightChange = newHeight - resizeSelectorStartRef.current.height;
          newOffsetY = resizeSelectorStartRef.current.offsetY + (heightChange / 2);
        }
        
        setSelectorOffset({ x: newOffsetX, y: newOffsetY });
      }
    };

    const handleUp = () => {
      if (isDragging) {
        dragLastRef.current = null;
        setIsDragging(false);
      } else if (isResizingSelector) {
        setIsResizingSelector(false);
        setResizeEdgeSelector(null);
        resizeSelectorStartRef.current = null;
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDragging, isResizingSelector, resizeEdgeSelector]);

  const closeDropdown = () => {
    if (isScrollingRef.current) {
      return;
    }
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    if (controlledOpen !== undefined) {
      // Controlled mode - call onClose callback
      if (onClose) {
        onClose();
      }
      return;
    }
    
    setPhase("closing");
    
    // For mobile, delay state update until animation completes (600ms for smooth animation)
    // For desktop, use normal duration
    const isMobileDevice = !isDesktop;
    const closeDelay = isMobileDevice ? 600 : animateDuration;
    
    // Update internal state immediately for button, but keep rendering until animation completes
    setIsOpenInternal(false); // Update button state immediately
    
    // Clean up rendering after animation completes - use exact timing
    setTimeout(() => {
      setShouldRender(false);
      setPhase("closed"); // Set to closed immediately after animation
      setSearchTerm("");
      isScrollingRef.current = false;
      scrollPositionRef.current = null;
    }, closeDelay);
  };

  useEffect(() => {
    if (isOpen && isDesktop) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      const handleScroll = (e: Event) => {
        const target = e.target as Node;
        if (dropdownRef.current && dropdownRef.current.contains(target)) {
          return;
        }
        const testCard = document.querySelector('[data-test-scroll-card]');
        if (testCard && testCard.contains(target)) {
          return;
        }
        isScrollingRef.current = true;
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingRef.current = false;
        }, 300);
      };
      
      const handleWheel = (e: WheelEvent) => {
        const target = e.target as Node;
        if (dropdownRef.current && dropdownRef.current.contains(target)) {
          return;
        }
        const testCard = document.querySelector('[data-test-scroll-card]');
        if (testCard && testCard.contains(target)) {
          return;
        }
        isScrollingRef.current = true;
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingRef.current = false;
        }, 300);
      };
      
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('wheel', handleWheel, true);
      
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('wheel', handleWheel, true);
      };
    }
  }, [isOpen, isDesktop]);

  const markScrolling = useCallback((delay = 250) => {
    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      scrollPositionRef.current = null;
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
      maybeUpdateTracker(tokenPointerDownRef, event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (buttonPointerDownRef.current?.pointerId === event.pointerId) {
        buttonPointerDownRef.current.endedAt = Date.now();
      }
      if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
        tokenPointerDownRef.current.endedAt = Date.now();
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (buttonPointerDownRef.current?.pointerId === event.pointerId) {
        buttonPointerDownRef.current = null;
      }
      if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
        tokenPointerDownRef.current = null;
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

  const renderList = (tokenSet: Token[], isScrollableParent = false) => (
    <div className="relative w-full" style={{ minHeight: 0, height: isScrollableParent ? "100%" : "auto" }}>
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
        <span
          className={`h-0.5 rounded-full bg-white/40 transition-all duration-[${animateDuration}ms] ease-out ${
            phase === "opening" || phase === "open"
              ? "w-24 opacity-0"
              : "w-0 opacity-100"
          }`}
        />
        <span
          className={`h-2 w-2 rounded-full bg-white transition-transform duration-[${animateDuration}ms] ease-out ${
            phase === "opening" || phase === "open"
              ? "scale-0"
              : "scale-100"
          }`}
        />
        <span
          className={`h-0.5 rounded-full bg-white/40 transition-all duration-[${animateDuration}ms] ease-out ${
            phase === "opening" || phase === "open"
              ? "w-24 opacity-0"
              : "w-0 opacity-100"
          }`}
        />
      </div>
      <div
        className={`relative origin-center transition-all duration-[${animateDuration}ms] ease-out w-full ${
          phase === "opening" || phase === "open"
            ? "scale-y-100 opacity-100"
            : "scale-y-0 opacity-0"
        }`}
        style={{ minHeight: 0 }}
      >
        <ul 
          className={isScrollableParent ? "w-full pr-6" : "w-full pr-5"}
          style={isScrollableParent ? { 
            WebkitOverflowScrolling: "touch"
          } : { 
            WebkitOverflowScrolling: "touch"
          }}
          onWheel={(e) => {
            markScrolling();
            e.stopPropagation();
          }}
          onScroll={(e) => {
            markScrolling();
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            markScrolling();
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
          }}
        >
          {tokenSet.length ? (
            tokenSet.map((t) => (
              <li key={t.address}>
                <button
                  type="button"
                  onClick={(event) => {
                    if (isScrollingRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      tokenPointerDownRef.current = null;
                      return;
                    }

                    const pointerInfo = tokenPointerDownRef.current;
                    if (pointerInfo) {
                      if (pointerInfo.moved) {
                        tokenPointerDownRef.current = null;
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }

                      const duration = (pointerInfo.endedAt ?? Date.now()) - pointerInfo.time;
                      if (duration > LONG_PRESS_THRESHOLD) {
                        tokenPointerDownRef.current = null;
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                    }

                    tokenPointerDownRef.current = null;

                    onSelect(t);
                    closeDropdown();
                  }}
                  onPointerDown={(event) => {
                    tokenPointerDownRef.current = {
                      pointerId: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                      time: Date.now(),
                      moved: false,
                    };
                    event.stopPropagation();
                  }}
                  onPointerMove={(event) => {
                    event.stopPropagation();
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                  }}
                  onPointerCancel={(event) => {
                    if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
                      tokenPointerDownRef.current = null;
                    }
                    event.stopPropagation();
                  }}
                  onWheel={(e) => {
                    markScrolling();
                    e.stopPropagation();
                  }}
                  className={`flex w-full items-center gap-3 rounded-full border border-transparent px-3 md:px-3 py-2 md:py-2 text-left transition-all touch-manipulation min-h-[48px] md:min-h-0 ${
                    selected.address === t.address
                      ? "bg-white/10 hover:border-white/30"
                      : "hover:border-white/30 hover:bg-white/5"
                  }`}
                  style={{ minHeight: "48px" }}
                >
                  {t.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.icon}
                      alt={t.symbol}
                      className="h-6 w-6 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
                      }}
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-white/20 ring-1 ring-white/15" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm text-white">{t.symbol}</div>
                    <div className="text-xs text-white/50">{t.name}</div>
                  </div>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-4 text-center text-xs text-white/40">No tokens found</li>
          )}
        </ul>
      </div>
    </div>
  );

  // Render button if showButton is true, otherwise just render the modal
  return (
    <>
      {showButton && (
        <TokenSelectorButton
          selected={selected}
          onClick={() => {
            // Prevent rapid clicking that causes desync
            if (phase === "opening" || phase === "closing") {
              return;
            }
            
            if (onOpenOverride) {
              onOpenOverride();
            } else if (controlledOpen === undefined) {
              if (isOpen) {
                closeDropdown();
              } else {
                openDropdown();
              }
            }
            // If controlledOpen is defined but no onOpenOverride, parent controls opening via open prop
          }}
          isOpen={isOpen && phase !== "closing"}
        />
      )}
      {shouldRender && isDesktop
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-none"
              style={{
                top: swapTitleRect && cardRect
                  ? swapTitleRect.top
                  : "50%",
                left: swapTitleRect && cardRect
                  ? (side === "left" 
                      ? Math.max(16, cardRect.left - 65 - selectorSize.width)
                      : Math.min(window.innerWidth - 16 - selectorSize.width, cardRect.right + 65))
                  : "50%",
                transform: swapTitleRect && cardRect
                  ? `translate(0, 0) translate(${selectorOffset.x}px, ${selectorOffset.y}px)`
                  : `translate(-50%, -50%) translate(${selectorOffset.x}px, ${selectorOffset.y}px)`,
                height: "70vh",
              }}
            >
              <div
                ref={dropdownRef}
                className={`pointer-events-auto relative overflow-hidden rounded-[20px] border border-white/15 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)] transition-all flex flex-col ${
                  isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                style={{
                  width: `${selectorSize.width}px`,
                  height: "70vh",
                  maxHeight: "70vh",
                  backgroundColor: "rgba(12, 14, 22, 0.3)",
                  backdropFilter: "blur(40px) saturate(180%)",
                  WebkitBackdropFilter: "blur(40px) saturate(180%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
                  transition: isResizingSelector ? "none" : "opacity 0.3s ease",
                  animation: phase === "opening" ? "chartRectangleAppear 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards" : phase === "closing" ? "chartRectangleDisappear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
                  zIndex: 0,
                  position: "relative",
                }}
                onWheel={(e) => {
                  const scrollableArea = e.currentTarget.querySelector('.overflow-y-auto') as HTMLElement;
                  if (scrollableArea && scrollableArea.contains(e.target as Node)) {
                    isScrollingRef.current = true;
                    if (scrollTimeoutRef.current) {
                      clearTimeout(scrollTimeoutRef.current);
                    }
                    scrollTimeoutRef.current = setTimeout(() => {
                      isScrollingRef.current = false;
                    }, 500);
                    return;
                  }
                  e.stopPropagation();
                }}
                onTouchMove={(e) => {
                  isScrollingRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                  }
                  scrollTimeoutRef.current = setTimeout(() => {
                    isScrollingRef.current = false;
                  }, 500);
                }}
                onScroll={(e) => {
                  isScrollingRef.current = true;
                  e.stopPropagation();
                  if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                  }
                  scrollTimeoutRef.current = setTimeout(() => {
                    isScrollingRef.current = false;
                  }, 150);
                }}
                onTouchStart={(e) => {
                  isScrollingRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                  }
                  scrollTimeoutRef.current = setTimeout(() => {
                    isScrollingRef.current = false;
                  }, 500);
                }}
                onMouseDown={(e) => {
                  if (isScrollingRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onClick={(e) => {
                  if (isScrollingRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  e.stopPropagation();
                }}
              >
                <div
                  className={`flex flex-col flex-shrink-0 relative ${
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  onPointerDown={handleDragStart}
                  style={{ paddingTop: "12px", paddingLeft: "24px", paddingRight: "0", paddingBottom: "24px" }}
                >
                  <div 
                    className="absolute inset-0" 
                    style={{ 
                      backgroundColor: "rgba(12, 14, 22, 0)",
                      backdropFilter: "none"
                    }}
                  />
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <span 
                      className="text-sm font-semibold tracking-wide text-white/60"
                    >
                      Select a token
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeDropdown();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center justify-center rounded-full text-white/70 transition hover:bg-[#ff5f57]/15 hover:text-[#ff5f57] relative z-10"
                      style={{ 
                        width: "33.6px",
                        height: "33.6px",
                        marginTop: "-4px",
                        marginRight: "10px",
                        lineHeight: "0"
                      }}
                      aria-label="Close token selector"
                    >
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative z-10 pr-6">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search token"
                      className="w-full flex-shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                    />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />
                </div>
                
                <div className="flex flex-col gap-4" style={{ height: "calc(100% - 100px)", overflow: "hidden", display: "flex", padding: "24px 0 24px 24px" }}>
                  <div 
                    className="flex-1 min-h-0 overflow-y-auto"
                    style={{ 
                      overflowY: "auto",
                      WebkitOverflowScrolling: "touch",
                      maxHeight: "100%",
                      marginRight: "0"
                    }}
                    onWheel={(e) => {
                      isScrollingRef.current = true;
                      if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                      }
                      scrollTimeoutRef.current = setTimeout(() => {
                        isScrollingRef.current = false;
                      }, 500);
                    }}
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const currentScrollTop = target.scrollTop;
                      const now = Date.now();
                      
                      if (scrollPositionRef.current) {
                        const scrollDelta = Math.abs(currentScrollTop - scrollPositionRef.current.top);
                        if (scrollDelta > 1) {
                          isScrollingRef.current = true;
                        }
                      }
                      
                      scrollPositionRef.current = {
                        top: currentScrollTop,
                        timestamp: now
                      };
                      
                      e.stopPropagation();
                      
                      if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                      }
                      
                      scrollTimeoutRef.current = setTimeout(() => {
                        isScrollingRef.current = false;
                        scrollPositionRef.current = null;
                      }, 150);
                    }}
                    onTouchMove={(e) => {
                      isScrollingRef.current = true;
                      e.preventDefault();
                      e.stopPropagation();
                      if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                      }
                      scrollTimeoutRef.current = setTimeout(() => {
                        isScrollingRef.current = false;
                      }, 500);
                    }}
                    onTouchStart={(e) => {
                      isScrollingRef.current = true;
                      e.preventDefault();
                      e.stopPropagation();
                      if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                      }
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                      }
                      scrollTimeoutRef.current = setTimeout(() => {
                        isScrollingRef.current = false;
                      }, 500);
                    }}
                    onMouseDown={(e) => {
                      if (isScrollingRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onClick={(e) => {
                      if (isScrollingRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      e.stopPropagation();
                    }}
                  >
                    {renderList(tokensToDisplay, true)}
                  </div>
                </div>
                
                <>
                  <div className="absolute top-0 left-4 right-4 h-1 cursor-ns-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('top', e)} />
                  <div className="absolute bottom-0 left-4 right-4 h-1 cursor-ns-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('bottom', e)} />
                  <div className="absolute top-4 bottom-4 left-0 w-1 cursor-ew-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('left', e)} />
                  <div className="absolute top-4 bottom-4 right-0 w-1 cursor-ew-resize z-50" onPointerDown={(e) => handleResizeSelectorStart('right', e)} />
                  <div className="absolute top-0 left-0 h-4 w-4 cursor-nwse-resize z-50 rounded-tl-[20px]" onPointerDown={(e) => handleResizeSelectorStart('top-left', e)} />
                  <div className="absolute top-0 right-0 h-4 w-4 cursor-nesw-resize z-50 rounded-tr-[20px]" onPointerDown={(e) => handleResizeSelectorStart('top-right', e)} />
                  <div className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize z-50 rounded-bl-[20px]" onPointerDown={(e) => handleResizeSelectorStart('bottom-left', e)} />
                  <div className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize z-50 rounded-br-[20px]" onPointerDown={(e) => handleResizeSelectorStart('bottom-right', e)} />
                </>
              </div>
            </div>,
            document.body
          )
        :
        shouldRender && (
          <MobileTokenSelectorCard
            isOpen={isOpen}
            onClose={closeDropdown}
            selected={selected}
            tokens={tokens}
            onSelect={onSelect}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredTokens={tokensToDisplay}
            phase={phase}
            animateDuration={animateDuration}
          />
        )}
    </>
  );
}


