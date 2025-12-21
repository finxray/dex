"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Connector } from "wagmi";

type WalletOption = {
  connector: Connector;
  displayName: string;
  icon: string;
  isDetected: boolean;
};

interface MobileWalletSelectorCardProps {
  isOpen: boolean;
  onClose: () => void;
  walletOptions: WalletOption[];
  onSelect: (option: WalletOption) => void;
  phase: "closed" | "opening" | "open" | "closing";
  animateDuration: number;
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
const SWIPE_DOWN_THRESHOLD = 50;
const DRAG_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;
const MAX_TOUCH_POINTS = 20; // Track last 20 touch points

export function MobileWalletSelectorCard({
  isOpen,
  onClose,
  walletOptions,
  onSelect,
  phase,
  animateDuration,
}: MobileWalletSelectorCardProps) {
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const scrollableAreaRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
  
  const dragStartRef = useRef<{ y: number; initialTranslateY: number; startTime: number } | null>(null);
  const cardTranslateYRef = useRef(0);
  const [backdropOpacity, setBackdropOpacity] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchPointsRef = useRef<number[]>([]);
  const DRAG_THRESHOLD = 50; // Minimum drag distance to trigger close
  const VELOCITY_THRESHOLD = 0.3; // Velocity threshold for closing (px/ms)
  const MAX_TOUCH_POINTS = 20; // Track last 20 touch points

  const paddingX = "24px"; // Match token selector

  const makePlaceholderDataUri = useCallback((label: string) => {
    const letter = (label || "?").trim().slice(0, 1).toUpperCase() || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="31" fill="url(#g)" stroke="rgba(255,255,255,0.18)" />
  <text x="32" y="38" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="28" font-weight="700" fill="rgba(255,255,255,0.65)">${letter}</text>
</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, []);

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

  // Update card position using requestAnimationFrame for smooth animation (EXACT COPY from token selector)
  const updateCardPosition = useCallback((translateY: number) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      if (mobileCardRef.current) {
        cardTranslateYRef.current = translateY;
        // Use translate3d for GPU acceleration
        mobileCardRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
        
        // Update backdrop opacity based on card position (EXACT COPY from token selector)
        // Card is 92vh tall, positioned from bottom with bottom: 0
        // When translateY = 0, card is fully up
        // Card top position = window.innerHeight - cardHeight - translateY
        // When card top is at or below 30vh from top, backdrop should be 0
        if (typeof window !== 'undefined') {
          const cardHeight = window.innerHeight * 0.92; // 92vh
          const thresholdTop = window.innerHeight * 0.3; // 30vh from top
          
          // Calculate card top position
          const cardTop = window.innerHeight - cardHeight - translateY;
          
          if (translateY <= 0) {
            setBackdropOpacity(0.6); // Fully up - 60% opacity
          } else if (cardTop <= thresholdTop) {
            setBackdropOpacity(0); // Card top at or below 30vh - 0% opacity (fully transparent)
          } else {
            // Calculate card top when fully up (translateY = 0)
            const cardTopWhenUp = window.innerHeight - cardHeight;
            // Calculate how much translateY is needed to reach threshold
            const translateYAtThreshold = cardTopWhenUp - thresholdTop;
            // Linear interpolation between 0.6 and 0
            const opacity = 0.6 * (1 - translateY / translateYAtThreshold);
            setBackdropOpacity(Math.max(0, opacity));
          }
        }
      }
    });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!mobileCardRef.current) return;
    
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    
    // Check if touching handle area or header area (always draggable, regardless of scroll position)
    const isHandleArea = target.closest('[data-handle-area]');
    const isHeaderArea = target.closest('[data-header-area]');
    const canDrag = (isHandleArea || isHeaderArea) && !target.closest('input') && !target.closest('button');
    
    if (canDrag && !isScrollingRef.current) {
      // Disable transition during drag
      if (mobileCardRef.current) {
        mobileCardRef.current.style.transition = 'none';
      }
      
      dragStartRef.current = {
        y: touch.clientY,
        initialTranslateY: cardTranslateYRef.current,
        startTime: Date.now(),
      };
      // Initialize touch points tracking
      touchPointsRef.current = [touch.clientY];
      setIsDragging(true);
      e.stopPropagation();
    } else {
      // Don't mark as scrolling if touching a button or input
      const isButtonOrInput = target.closest('button') || target.closest('input');
      if (!isButtonOrInput) {
        // Normal scrolling (only for non-button/input touches)
        isScrollingRef.current = true;
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      }
    }
  }, []);

  // Handle touch move - card follows finger smoothly (EXACT COPY from token selector)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!mobileCardRef.current || !dragStartRef.current) {
      // Don't mark as scrolling if touching a button or input
      const target = e.target as HTMLElement;
      const isButtonOrInput = target.closest('button') || target.closest('input');
      
      if (!isButtonOrInput) {
        // Normal scroll handling (only for non-button/input touches)
        isScrollingRef.current = true;
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingRef.current = false;
        }, 500);
      }
      return;
    }

    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartRef.current.y;
    const newTranslateY = dragStartRef.current.initialTranslateY + deltaY;
    
    // Track touch points (keep only last 20)
    touchPointsRef.current.push(touch.clientY);
    if (touchPointsRef.current.length > MAX_TOUCH_POINTS) {
      touchPointsRef.current.shift(); // Remove oldest point
    }
    
    // Prevent card from going above top (negative values)
    // Allow dragging down beyond 92vh for better UX
    const translateY = Math.max(0, newTranslateY);
    cardTranslateYRef.current = translateY;
    
    e.preventDefault(); // Prevent scrolling while dragging
    
    // Use requestAnimationFrame for smooth updates
    updateCardPosition(translateY);
  }, [updateCardPosition]);

  // Handle touch end - decide to close or return to top with smooth animation (EXACT COPY from token selector)
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragStartRef.current) {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 500);
      return;
    }

    const touch = e.changedTouches[0];
    const currentTranslateY = cardTranslateYRef.current;
    
    // Use last touch points to determine swipe direction
    // This handles cases where user dragged down, then up, stopped, and released
    let deltaY: number;
    if (touchPointsRef.current.length >= 2) {
      // Calculate delta from last points (first to last)
      const firstPoint = touchPointsRef.current[0];
      const lastPoint = touchPointsRef.current[touchPointsRef.current.length - 1];
      deltaY = lastPoint - firstPoint;
    } else {
      // Fallback to total delta if not enough points
      deltaY = touch.clientY - dragStartRef.current.y;
    }
    
    const deltaTime = Date.now() - dragStartRef.current.startTime;
    const velocity = deltaTime > 0 ? Math.abs(deltaY) / deltaTime : 0;
    
    // Constants for animation calculation
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const cardHeight = viewportHeight * 0.92; // 92vh
    const fullCloseDistance = cardHeight + 10; // Full distance to close
    const baseAnimationDuration = 400; // Base duration for full distance (400ms)
    
    // Determine action based on drag distance, position, and velocity
    // If dragged UP (negative deltaY), always return to top
    // If dragged DOWN significantly, close the card
    const draggedUp = deltaY < 0;
    const draggedDownSignificantly = deltaY > DRAG_THRESHOLD && currentTranslateY > DRAG_THRESHOLD;
    const fastDownwardSwipe = deltaY > 0 && velocity > VELOCITY_THRESHOLD && currentTranslateY > DRAG_THRESHOLD;
    const shouldClose = draggedDownSignificantly || fastDownwardSwipe;
    
    // Clear touch points after use
    touchPointsRef.current = [];
    
    // Cancel any pending animation frames
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    setIsAnimating(true);
    
    if (draggedUp || (!shouldClose && currentTranslateY < DRAG_THRESHOLD)) {
      // Swiped up or near top - return to top position smoothly
      const remainingDistance = currentTranslateY;
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      if (mobileCardRef.current) {
        const currentPos = currentTranslateY;
        cardTranslateYRef.current = currentPos;
        
        requestAnimationFrame(() => {
          if (mobileCardRef.current) {
            mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms cubic-bezier(0.32, 0.72, 0, 1)`;
            mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
            requestAnimationFrame(() => {
              if (mobileCardRef.current) {
                cardTranslateYRef.current = 0;
                mobileCardRef.current.style.transform = 'translate3d(0, 0, 0)';
                updateCardPosition(0); // Update backdrop opacity
              }
            });
          }
        });
      }
      setTimeout(() => {
        setIsAnimating(false);
      }, animationDurationMs);
    } else if (shouldClose) {
      // Animate to closed position
      const targetTranslateY = fullCloseDistance;
      const remainingDistance = targetTranslateY - currentTranslateY;
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      if (mobileCardRef.current) {
        const currentPos = currentTranslateY;
        cardTranslateYRef.current = currentPos;
        
        requestAnimationFrame(() => {
          if (mobileCardRef.current) {
            mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms linear`;
            mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
            requestAnimationFrame(() => {
              if (mobileCardRef.current) {
                cardTranslateYRef.current = targetTranslateY;
                mobileCardRef.current.style.transform = `translate3d(0, ${targetTranslateY}px, 0)`;
                updateCardPosition(targetTranslateY); // Update backdrop opacity
              }
            });
          }
        });
        
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false);
          onClose();
        }, animationDurationMs);
      }
    } else {
      // Small drag down but not enough - return to top
      const remainingDistance = currentTranslateY;
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      if (mobileCardRef.current) {
        const currentPos = currentTranslateY;
        cardTranslateYRef.current = currentPos;
        
        requestAnimationFrame(() => {
          if (mobileCardRef.current) {
            mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms cubic-bezier(0.32, 0.72, 0, 1)`;
            mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
            requestAnimationFrame(() => {
              if (mobileCardRef.current) {
                cardTranslateYRef.current = 0;
                mobileCardRef.current.style.transform = 'translate3d(0, 0, 0)';
                updateCardPosition(0); // Update backdrop opacity
              }
            });
          }
        });
      }
      setTimeout(() => {
        setIsAnimating(false);
      }, animationDurationMs);
    }
    
    dragStartRef.current = null;
    e.stopPropagation();
  }, [isDragging, onClose, updateCardPosition]);

  // Handle phase changes - trigger close animation when phase is "closing" (EXACT COPY from token selector)
  useEffect(() => {
    if (phase === "closing" && mobileCardRef.current && !isAnimating && !isDragging) {
      const viewportHeight = window.innerHeight;
      const cardHeight = viewportHeight * 0.92; // 92vh
      const fullCloseDistance = cardHeight + 10; // Full distance to close
      const currentTranslateY = cardTranslateYRef.current;
      const remainingDistance = fullCloseDistance - currentTranslateY;
      const baseAnimationDuration = 400; // 400ms base duration
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      setIsAnimating(true);
      
      // Cancel any pending animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Capture current position and animate to closed position
      const currentPos = currentTranslateY;
      cardTranslateYRef.current = currentPos;
      
      requestAnimationFrame(() => {
        if (mobileCardRef.current) {
          // Use linear for close animation
          mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms linear`;
          // Ensure current position is set
          mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
          // Use double RAF to ensure transition is applied before animating to target
          requestAnimationFrame(() => {
            if (mobileCardRef.current) {
              cardTranslateYRef.current = fullCloseDistance;
              mobileCardRef.current.style.transform = `translate3d(0, ${fullCloseDistance}px, 0)`;
            }
          });
        }
      });
      
      // Reset animation flag after animation completes
      setTimeout(() => {
        setIsAnimating(false);
        setBackdropOpacity(0); // Reset backdrop when closed
      }, animationDurationMs);
    }
  }, [phase, isAnimating, isDragging]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '0';
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
    };
  }, [isOpen]);

  // Reset transform when card opens/closes (EXACT COPY from token selector)
  useEffect(() => {
    if (mobileCardRef.current) {
      if (!isOpen) {
        // Card closed - ensure it's fully hidden off-screen
        const viewportHeight = window.innerHeight;
        const cardHeight = viewportHeight * 0.92; // 92vh
        const translateDistance = cardHeight + 10; // Add small buffer to ensure fully hidden
        mobileCardRef.current.style.transform = `translate3d(0, ${translateDistance}px, 0)`;
        mobileCardRef.current.style.transition = `transform 400ms linear`; // Linear for close
        cardTranslateYRef.current = translateDistance;
        setIsDragging(false);
        setIsAnimating(false);
        dragStartRef.current = null;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      } else {
        // Card opened - start from current position (or bottom if first open)
        const startPosition = cardTranslateYRef.current || window.innerHeight;
        cardTranslateYRef.current = startPosition;
        
        // Set initial position immediately (no transition)
        mobileCardRef.current.style.transition = 'none';
        mobileCardRef.current.style.transform = `translate3d(0, ${startPosition}px, 0)`;
        mobileCardRef.current.style.opacity = '1'; // Always 100% opacity
        
        // Force a reflow to ensure initial position is rendered
        mobileCardRef.current.offsetHeight;
        
        // Add a small delay (40ms) to ensure browser has rendered initial state before starting transition
        // This prevents lagging/janky transitions on first open
        setTimeout(() => {
          requestAnimationFrame(() => {
            if (mobileCardRef.current) {
              setIsAnimating(true);
              const animationDurationMs = 400; // 400ms for open - matches token selector
              mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms cubic-bezier(0.32, 0.72, 0, 1)`; // Ease-out for open
              cardTranslateYRef.current = 0;
              mobileCardRef.current.style.transform = 'translate3d(0, 0, 0)';
              updateCardPosition(0); // Update backdrop opacity
              
              // Mark animation complete after it finishes
              setTimeout(() => {
                setIsAnimating(false);
              }, animationDurationMs);
            }
          });
        }, 40); // 40ms delay to allow initial render
      }
    }
  }, [isOpen, animateDuration, updateCardPosition]);

  if (!isOpen && phase === "closed") return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-end"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        pointerEvents: isOpen ? 'auto' : 'none',
        backgroundColor: 'transparent', // No backdrop/curtain
      }}
      onClick={(e) => {
        if (!isScrollingRef.current && mobileCardRef.current && !mobileCardRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      {/* Backdrop layer - adjusts opacity based on card position (EXACT COPY from token selector) */}
      {isOpen && backdropOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 1.0)',
            opacity: backdropOpacity,
            zIndex: 0,
          }}
        />
      )}
      <div
        ref={mobileCardRef}
        className="w-full rounded-t-[35px] border-t border-l border-r border-white/15"
        style={{
          zIndex: 1, 
          height: "92vh",
          minHeight: "92vh",
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          willChange: 'transform',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: "rgba(12, 14, 22, 0.04)",
          backdropFilter: "blur(20px) saturate(120%)",
          WebkitBackdropFilter: "blur(20px) saturate(120%)",
          boxShadow: "0 -20px 60px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
            transform: isOpen ? "translate3d(0, 0, 0)" : `translate3d(0, ${typeof window !== 'undefined' ? window.innerHeight * 0.92 : 0}px, 0)`,
            transition: isDragging ? "none" : `transform 600ms cubic-bezier(0.32, 0.72, 0, 1)`, // 600ms animation (ease-out for open) - matches token selector
            // Card always has 100% opacity from start (no fade-in)
            opacity: 1,
            scale: 1,
            // GPU acceleration optimizations
            backfaceVisibility: 'hidden',
            perspective: 1000,
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div 
          data-handle-area
          className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
        >
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>
        
        {/* Cross button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          className="absolute flex items-center justify-center rounded-full text-white transition hover:bg-white/10 hover:text-white active:bg-white/10 z-50 touch-manipulation"
          style={{ 
            width: "47.04px",
            height: "47.04px",
            top: "15px",
            right: "15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            margin: 0,
          }}
          aria-label="Close wallet selector"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              display: "block",
              flexShrink: 0,
            }}
          >
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>

        {/* Header area - draggable */}
        <div 
          data-header-area
          className="relative flex flex-col flex-shrink-0" 
          style={{ 
            paddingTop: "12px", 
            paddingLeft: paddingX, 
            paddingRight: paddingX, 
            paddingBottom: "24px",
            touchAction: "none",
            backgroundColor: "rgba(12, 14, 22, 0.012)",
          }}
        >
          <div className="mb-4 relative z-10 flex items-center" style={{ height: "47.04px", marginTop: "3px" }}>
            <span className="text-xl font-semibold tracking-wide text-white/60" style={{ lineHeight: "1" }}>
              Select a wallet
            </span>
          </div>
          <div 
            className="absolute bottom-0 h-px bg-white/10" 
            style={{ 
              left: paddingX, 
              right: paddingX 
            }} 
          />
        </div>
        
        {/* Wallet list */}
        <div 
          ref={scrollableAreaRef}
          className="flex-1 min-h-0 overflow-y-auto flex-shrink"
          style={{ 
            paddingTop: "16px",
            paddingLeft: paddingX,
            paddingRight: paddingX,
            paddingBottom: paddingX,
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
          }}
          onTouchStart={(e) => {
            const target = e.target as HTMLElement;
            const isButton = target.closest('button');
            if (!isButton) {
              e.stopPropagation();
            }
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
          onClick={(e) => {
            if (isScrollingRef.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            e.stopPropagation();
          }}
        >
          <ul className="space-y-2">
            {walletOptions.length > 0 ? (
              walletOptions.map((option) => {
                const isWalletConnect = option.connector.id === "walletConnect" || option.connector.name?.toLowerCase().includes("walletconnect");
                const isMetaMask = option.displayName === "MetaMask";
                // MetaMask should always be clickable - connector.ready might be false on mobile but it can still connect
                // Only disable if it's not MetaMask, not WalletConnect, and not ready
                const disabled = !isMetaMask && !isWalletConnect && !option.connector.ready;
                
                return (
                  <li key={option.connector.id}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`🖱️ Clicked wallet: ${option.displayName}`, {
                          disabled,
                          isScrolling: isScrollingRef.current,
                          connectorId: option.connector.id,
                          connectorReady: option.connector.ready,
                        });
                        if (!disabled && !isScrollingRef.current) {
                          console.log(`✅ Selecting wallet: ${option.displayName}`);
                          onSelect(option);
                        } else {
                          console.warn(`⚠️ Wallet selection blocked:`, {
                            disabled,
                            isScrolling: isScrollingRef.current,
                          });
                        }
                      }}
                      disabled={disabled}
                      className={`flex w-full items-center gap-3 rounded-full border border-transparent px-3 py-2 text-left transition-all touch-manipulation ${
                        disabled
                          ? "border-white/10 bg-white/5 opacity-40 cursor-not-allowed"
                          : "hover:border-white/30 hover:bg-white/5 active:bg-white/10"
                      }`}
                      style={{ minHeight: "57.6px" }}
                    >
                      <div
                        className="relative flex-shrink-0"
                        style={{ width: "28.8px", height: "28.8px" }}
                      >
                        {/* Placeholder (hidden when image loads successfully) */}
                        <div
                          className="absolute inset-0 rounded-full ring-1 ring-white/15 bg-white/10"
                          style={{ zIndex: 1 }}
                          data-placeholder
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={option.icon || makePlaceholderDataUri(option.displayName)}
                          alt={option.displayName}
                          className="absolute inset-0 rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                          style={{ width: "28.8px", height: "28.8px", zIndex: 2 }}
                          onLoad={(e) => {
                            // Hide placeholder when image loads successfully
                            const target = e.currentTarget;
                            const placeholder = target.parentElement?.querySelector('[data-placeholder]') as HTMLElement;
                            if (placeholder) {
                              placeholder.style.display = 'none';
                            }
                          }}
                          onError={(e) => {
                            const target = e.currentTarget;
                            const placeholder = makePlaceholderDataUri(option.displayName);
                            // Prevent infinite retry loops
                            if (target.dataset.retryAttempt === "true") {
                              target.onerror = null;
                              target.src = placeholder;
                              return;
                            }

                            // Try fallback URLs for each wallet type
                            if (option.displayName === "WalletConnect") {
                              const fallbackIndex = parseInt(target.dataset.fallbackIndex || "0");
                              const fallbacks = [
                                "https://cdn.jsdelivr.net/gh/WalletConnect/walletconnect-assets@master/Logo/Blue%20(Default)/Logo.svg",
                              ];
                              if (fallbackIndex < fallbacks.length) {
                                target.dataset.fallbackIndex = String(fallbackIndex + 1);
                                target.src = fallbacks[fallbackIndex];
                              } else {
                                target.dataset.retryAttempt = "true";
                                target.src = placeholder;
                              }
                            } else if (option.displayName === "MetaMask") {
                              const fallbackIndex = parseInt(target.dataset.fallbackIndex || "0");
                              const fallbacks = [
                                "https://cdn.jsdelivr.net/gh/MetaMask/metamask-extension@master/app/images/icon-128.png",
                                "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
                              ];
                              if (fallbackIndex < fallbacks.length) {
                                target.dataset.fallbackIndex = String(fallbackIndex + 1);
                                target.src = fallbacks[fallbackIndex];
                              } else {
                                target.dataset.retryAttempt = "true";
                                target.src = placeholder;
                              }
                            } else {
                              target.dataset.retryAttempt = "true";
                              target.src = placeholder;
                              // Show placeholder when all fallbacks fail
                              const placeholderEl = target.parentElement?.querySelector('[data-placeholder]') as HTMLElement;
                              if (placeholderEl) {
                                placeholderEl.style.display = 'block';
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-white" style={{ fontSize: "16.8px", lineHeight: "1.2" }}>{option.displayName}</div>
                        {option.isDetected && (
                          <div className="text-white/50" style={{ fontSize: "14.4px", lineHeight: "1.2" }}>Detected</div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-xs text-white/40">No wallets available</li>
            )}
          </ul>
        </div>
      </div>
    </div>,
    document.body
  );
}

