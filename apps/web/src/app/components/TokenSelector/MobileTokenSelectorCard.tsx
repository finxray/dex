"use client";

import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import { createPortal } from "react-dom";
import type { Token } from "./TokenSelector";

interface MobileTokenSelectorCardProps {
  isOpen: boolean;
  onClose: () => void;
  selected: Token;
  tokens: Token[];
  onSelect: (t: Token) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredTokens: Token[];
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
const LONG_PRESS_THRESHOLD = 220;
const SWIPE_DOWN_THRESHOLD = 50; // Minimum distance to trigger swipe down

export function MobileTokenSelectorCard({
  isOpen,
  onClose,
  selected,
  tokens,
  onSelect,
  searchTerm,
  setSearchTerm,
  filteredTokens,
  phase,
  animateDuration,
}: MobileTokenSelectorCardProps) {
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const scrollableAreaRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
  const tokenPointerDownRef = useRef<PointerTracker | null>(null);
  
  // iOS-like drag gesture tracking
  const dragStartRef = useRef<{ y: number; initialTranslateY: number; startTime: number } | null>(null);
  const cardTranslateYRef = useRef(0);
  const [backdropOpacity, setBackdropOpacity] = useState(0);
  const touchPointsRef = useRef<number[]>([]); // Track last 20 touch points (y coordinates)
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const DRAG_THRESHOLD = 50; // Minimum drag distance to trigger close
  const VELOCITY_THRESHOLD = 0.3; // Velocity threshold for closing (px/ms)
  const MAX_TOUCH_POINTS = 20; // Track last 20 touch points

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

  // Update card position using requestAnimationFrame for smooth animation
  const updateCardPosition = useCallback((translateY: number) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      if (mobileCardRef.current) {
        cardTranslateYRef.current = translateY;
        // Use translate3d for GPU acceleration
        mobileCardRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
        
        // Update backdrop opacity based on card position
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

  // Handle touch start - detect if dragging header
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

  // Handle touch move - card follows finger smoothly
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

  // Handle touch end - decide to close or return to top with smooth animation
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
    
    // Use last 20 touch points to determine swipe direction
    // This handles cases where user dragged down, then up, stopped, and released
    let deltaY: number;
    if (touchPointsRef.current.length >= 2) {
      // Calculate delta from last 20 points (first to last)
      const firstPoint = touchPointsRef.current[0];
      const lastPoint = touchPointsRef.current[touchPointsRef.current.length - 1];
      deltaY = lastPoint - firstPoint;
    } else {
      // Fallback to total delta if not enough points
      deltaY = touch.clientY - dragStartRef.current.y;
    }
    
    const deltaTime = Date.now() - dragStartRef.current.startTime;
    
    // Calculate velocity (px/ms) using last 20 points delta
    const velocity = deltaTime > 0 ? Math.abs(deltaY) / deltaTime : 0;
    
    // Constants for animation calculation
    const viewportHeight = window.innerHeight;
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
    
    // Cancel any pending animation frames to prevent conflicts
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    setIsAnimating(true);
    
    if (draggedUp || (!shouldClose && currentTranslateY < DRAG_THRESHOLD)) {
      // Swiped up or near top - return to top position smoothly
      const remainingDistance = currentTranslateY; // Distance from current position to top (0)
      // Calculate proportional duration: if halfway down, takes half the time
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      if (mobileCardRef.current) {
        // Capture current position and ensure transition is set before animating
        const currentPos = currentTranslateY;
        cardTranslateYRef.current = currentPos; // Set current position first
        
        // Use requestAnimationFrame to ensure smooth transition application
        requestAnimationFrame(() => {
          if (mobileCardRef.current) {
            // Set transition first
            mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms cubic-bezier(0.32, 0.72, 0, 1)`;
            // Ensure current position is set
            mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
            // Use double RAF to ensure transition is applied before animating to target
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
      // Reset animation flag after animation completes
      setTimeout(() => {
        setIsAnimating(false);
      }, animationDurationMs);
    } else if (shouldClose) {
      // Animate to closed position - translate by card height (92vh) + small buffer to fully hide it
      const targetTranslateY = fullCloseDistance;
      const remainingDistance = targetTranslateY - currentTranslateY; // Remaining distance to travel
      // Calculate proportional duration based on remaining distance
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      if (mobileCardRef.current) {
        // Capture current position and ensure transition is set before animating
        const currentPos = currentTranslateY;
        cardTranslateYRef.current = currentPos; // Set current position first
        
        // Use requestAnimationFrame to ensure smooth transition application
        requestAnimationFrame(() => {
          if (mobileCardRef.current) {
            // Use linear for close animation
            mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms linear`;
            // Ensure current position is set
            mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
            // Use double RAF to ensure transition is applied before animating to target
            requestAnimationFrame(() => {
              if (mobileCardRef.current) {
                cardTranslateYRef.current = targetTranslateY;
                mobileCardRef.current.style.transform = `translate3d(0, ${targetTranslateY}px, 0)`;
                updateCardPosition(targetTranslateY); // Update backdrop opacity
              }
            });
          }
        });
        
        // Wait for animation to complete before calling onClose
        // This ensures card is fully hidden before state updates
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false);
          // Card is now fully hidden - call onClose to update parent state
          // This will trigger button arrow animation and mark card as closed
          onClose();
        }, animationDurationMs); // Use exact animation duration, no extra buffer
      }
    } else {
      // Small drag down but not enough - return to top
      const remainingDistance = currentTranslateY; // Distance from current position to top (0)
      const animationDurationMs = Math.max(200, (remainingDistance / fullCloseDistance) * baseAnimationDuration);
      
      if (mobileCardRef.current) {
        // Capture current position and ensure transition is set before animating
        const currentPos = currentTranslateY;
        cardTranslateYRef.current = currentPos; // Set current position first
        
        // Use requestAnimationFrame to ensure smooth transition application
        requestAnimationFrame(() => {
          if (mobileCardRef.current) {
            mobileCardRef.current.style.transition = `transform ${animationDurationMs}ms cubic-bezier(0.32, 0.72, 0, 1)`;
            // Ensure current position is set
            mobileCardRef.current.style.transform = `translate3d(0, ${currentPos}px, 0)`;
            // Use double RAF to ensure transition is applied before animating to target
            requestAnimationFrame(() => {
              if (mobileCardRef.current) {
                cardTranslateYRef.current = 0;
                mobileCardRef.current.style.transform = 'translate3d(0, 0, 0)';
                updateCardPosition(0); // Update backdrop opacity
              }
            });
          }
        });
        
        setTimeout(() => {
          setIsAnimating(false);
        }, animationDurationMs);
      } else {
        setTimeout(() => {
          setIsAnimating(false);
        }, animationDurationMs);
      }
    }
    
    dragStartRef.current = null;
    setIsDragging(false);
  }, [onClose, animateDuration, updateCardPosition]);

  // Lock body scroll when card is open
  useEffect(() => {
    if (isOpen) {
      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalTop = document.body.style.top;
      const originalWidth = document.body.style.width;
      const scrollY = window.scrollY;
      
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      return () => {
        // Unlock body scroll when card closes
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.width = originalWidth;
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Cleanup animation frame and timeouts on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Handle phase changes - trigger close animation when phase is "closing"
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

  // Reset transform when card opens/closes
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
              const animationDurationMs = 400; // 400ms for open
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
  }, [isOpen, animateDuration]);

  const renderList = (tokenSet: Token[]) => (
    <div className="relative w-full">
      <ul className="w-full">
        {tokenSet.length ? (
          tokenSet.map((t) => (
            <li key={t.address}>
              <button
                type="button"
                onClick={(event) => {
                  // Prevent action if actively scrolling
                  if (isScrollingRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    tokenPointerDownRef.current = null;
                    return;
                  }

                  // Check if pointer moved significantly (scroll vs tap)
                  const pointerInfo = tokenPointerDownRef.current;
                  if (pointerInfo?.moved) {
                    tokenPointerDownRef.current = null;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }

                  // Check for long press (only if pointer info exists)
                  if (pointerInfo) {
                    const duration = (pointerInfo.endedAt ?? Date.now()) - pointerInfo.time;
                    if (duration > LONG_PRESS_THRESHOLD) {
                      tokenPointerDownRef.current = null;
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                  }

                  // Select token and close card (works even if pointer tracking failed)
                  tokenPointerDownRef.current = null;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(t);
                  onClose();
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
                  if (tokenPointerDownRef.current && tokenPointerDownRef.current.pointerId === event.pointerId) {
                    const deltaX = Math.abs(event.clientX - tokenPointerDownRef.current.x);
                    const deltaY = Math.abs(event.clientY - tokenPointerDownRef.current.y);
                    if (deltaX > POINTER_MOVE_THRESHOLD || deltaY > POINTER_MOVE_THRESHOLD) {
                      tokenPointerDownRef.current.moved = true;
                      markScrolling();
                    }
                  }
                  event.stopPropagation();
                }}
                onPointerUp={(event) => {
                  if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
                    tokenPointerDownRef.current.endedAt = Date.now();
                    
                    // If pointer didn't move significantly, trigger selection immediately
                    if (!tokenPointerDownRef.current.moved && !isScrollingRef.current) {
                      const duration = Date.now() - tokenPointerDownRef.current.time;
                      if (duration <= LONG_PRESS_THRESHOLD) {
                        event.preventDefault();
                        event.stopPropagation();
                        tokenPointerDownRef.current = null;
                        onSelect(t);
                        onClose();
                        return;
                      }
                    }
                  }
                  event.stopPropagation();
                }}
                onPointerCancel={(event) => {
                  if (tokenPointerDownRef.current?.pointerId === event.pointerId) {
                    tokenPointerDownRef.current = null;
                  }
                  event.stopPropagation();
                }}
                onTouchEnd={(event) => {
                  // Fallback for touch devices - ensure selection works
                  if (!isScrollingRef.current && tokenPointerDownRef.current) {
                    const pointerInfo = tokenPointerDownRef.current;
                    if (!pointerInfo.moved) {
                      const duration = Date.now() - pointerInfo.time;
                      if (duration <= LONG_PRESS_THRESHOLD) {
                        event.preventDefault();
                        event.stopPropagation();
                        tokenPointerDownRef.current = null;
                        onSelect(t);
                        onClose();
                        return;
                      }
                    }
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-full border border-transparent px-3 py-2 text-left transition-all touch-manipulation ${
                  selected.address === t.address
                    ? "bg-white/10 hover:border-white/30"
                    : "hover:border-white/30 hover:bg-white/5"
                }`}
                style={{ 
                  minHeight: "57.6px", // 20% bigger than 48px
                }}
              >
                {t.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.icon}
                    alt={t.symbol}
                    className="rounded-full ring-1 ring-white/15 bg-white/5 object-cover"
                    style={{ width: "28.8px", height: "28.8px" }} // 20% bigger than 24px
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
                    }}
                  />
                ) : (
                  <div 
                    className="rounded-full bg-white/20 ring-1 ring-white/15" 
                    style={{ width: "28.8px", height: "28.8px" }}
                  />
                )}
                <div className="flex-1">
                  <div className="text-white" style={{ fontSize: "16.8px", lineHeight: "1.2" }}>{t.symbol}</div>
                  <div className="text-white/50" style={{ fontSize: "14.4px", lineHeight: "1.2" }}>{t.name}</div>
                </div>
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-4 text-center text-xs text-white/40">No tokens found</li>
        )}
      </ul>
    </div>
  );

  const paddingX = "24px";

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
        {/* Backdrop layer - adjusts opacity based on card position */}
        {isOpen && backdropOpacity > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 1.0)',
              opacity: backdropOpacity,
              zIndex: 0,
              pointerEvents: 'none',
              transition: 'opacity 0.1s ease-out',
            }}
          />
        )}
        <div
          ref={mobileCardRef}
          className="w-full rounded-t-[35px] border-t border-l border-r border-white/15"
          style={{
            zIndex: 1, 
            height: "92vh",
            minHeight: "92vh", // Prevent shrinking
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            willChange: 'transform',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: "rgba(12, 14, 22, 0.04)", // Even more transparent
            backdropFilter: "blur(20px) saturate(120%)",
            WebkitBackdropFilter: "blur(20px) saturate(120%)",
            boxShadow: "0 -20px 60px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
            transform: isOpen ? "translate3d(0, 0, 0)" : `translate3d(0, ${typeof window !== 'undefined' ? window.innerHeight * 0.92 : 0}px, 0)`,
            transition: isDragging ? "none" : `transform 600ms cubic-bezier(0.32, 0.72, 0, 1)`, // 600ms animation (ease-out for open)
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
        {/* Handle at the top - swipe down area */}
        <div 
          data-handle-area
          className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
        >
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>
        
        {/* Cross button - positioned independently */}
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
          className="absolute flex items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/40 active:bg-white/10 z-50 touch-manipulation"
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
          aria-label="Close token selector"
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
            backgroundColor: "rgba(12, 14, 22, 0.012)", // 70% more transparent than card (0.04 * 0.3 = 0.012)
          }}
        >
          <div className="mb-4 relative z-10 flex items-center" style={{ height: "47.04px", marginTop: "3px" }}>
            <span className="text-xl font-semibold tracking-wide text-white/60" style={{ lineHeight: "1" }}>
              Select a token
            </span>
          </div>
          <div className="relative z-10">
            <input
              type="text"
              inputMode="search"
              value={searchTerm}
              onChange={(event) => {
                event.stopPropagation();
                setSearchTerm(event.target.value);
              }}
              onFocus={(e) => {
                e.stopPropagation();
                // Prevent zoom on iOS
                e.target.style.fontSize = '17.6px'; // 10% bigger than 16px
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              placeholder="Search token"
              className="w-full rounded-full border border-white/15 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
              style={{ fontSize: '17.6px', paddingTop: '11px', paddingBottom: '11px' }} // 10% bigger
            />
          </div>
          <div 
            className="absolute bottom-0 h-px bg-white/10" 
            style={{ 
              left: paddingX, 
              right: paddingX 
            }} 
          />
        </div>
        
        <div 
          ref={scrollableAreaRef}
          className="flex-1 min-h-0 overflow-y-auto flex-shrink"
          style={{ 
            paddingTop: "16px",
            paddingLeft: paddingX,
            paddingRight: paddingX,
            paddingBottom: paddingX, // Same as left/right
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y", // Allow vertical scrolling only
          }}
          onTouchStart={(e) => {
            // Prevent card dragging when touching scrollable area (unless it's a button/input)
            const target = e.target as HTMLElement;
            const isButtonOrInput = target.closest('button') || target.closest('input');
            if (!isButtonOrInput) {
              e.stopPropagation(); // Prevent header drag when scrolling content
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
          {renderList(filteredTokens)}
        </div>
      </div>
    </div>,
    document.body
  );
}

