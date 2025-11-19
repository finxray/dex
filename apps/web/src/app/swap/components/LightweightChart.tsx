"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, AreaSeries } from "lightweight-charts";

interface ChartData {
  time: number;
  value: number;
}

interface LightweightChartProps {
  data: ChartData[];
  pulseColor?: string;
  showPulse?: boolean;
  permanentDotColor?: string | null;
  onSeriesReady?: (series: any, chart: any, updatePositions: () => void) => void;
  onCrosshairChange?: (isActive: boolean) => void;
}

export default function LightweightChart({ data, pulseColor, showPulse, permanentDotColor, onSeriesReady, onCrosshairChange }: LightweightChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [crosshairData, setCrosshairData] = useState<{ price: number | null; time: number | null; point: { x: number; y: number } | null }>({ price: null, time: null, point: null });
  const [isMobile, setIsMobile] = useState(false);
  const dotPositionRef = useRef<{ x: number; y: number } | null>(null);
  const caretPositionRef = useRef<{ x: number; y: number; width: number } | null>(null);
  const lastDataPointRef = useRef<ChartData | null>(null);
  
  // Cache for chart view state to preserve user's zoom/pan position
  const chartViewCacheRef = useRef<{
    timeRange: { from: number; to: number } | null;
    priceRange: { from: number; to: number } | null;
    autoScale: boolean | null;
    isInitialized: boolean;
    lastUpdateTime: number;
  }>({
    timeRange: null,
    priceRange: null,
    autoScale: null,
    isInitialized: false,
    lastUpdateTime: 0
  });
  
  // Ref to store override function that will restore cached position
  const positionOverrideRef = useRef<(() => void) | null>(null);
  
  // Shared position for the entire last price group (dot + ripple) - ensures perfect alignment
  const lastPriceGroupPositionRef = useRef<{ x: number; y: number } | null>(null);
  
  // Centralized cache for all last price positions - updated synchronously before chart updates
  const lastPricePositionsCacheRef = useRef<{
    dot: { x: number; y: number } | null;
    caret: { x: number; y: number; width: number } | null;
    dataPoint: ChartData | null;
    timestamp: number;
  }>({
    dot: null,
    caret: null,
    dataPoint: null,
    timestamp: 0
  });
  
  // Ref to store ripple position update callback - called whenever dot position updates
  const ripplePositionUpdateRef = useRef<(() => void) | null>(null);
  
  // Function to cache current chart view state (time range, price scale, etc.)
  const cacheChartViewState = useCallback(() => {
    if (!chartRef.current) return;
    
    try {
      const chart = chartRef.current;
      const timeScale = chart.timeScale();
      const priceScale = chart.priceScale('right');
      
      // Cache time range
      const currentTimeRange = timeScale.getVisibleRange();
      if (currentTimeRange && typeof currentTimeRange.from === 'number' && typeof currentTimeRange.to === 'number') {
        chartViewCacheRef.current.timeRange = {
          from: currentTimeRange.from as number,
          to: currentTimeRange.to as number
        };
      }
      
      // Cache price scale state
      if (priceScale) {
        try {
          const priceScaleOptions = priceScale.options();
          if (priceScaleOptions) {
            chartViewCacheRef.current.autoScale = priceScaleOptions.autoScale !== false;
          }
        } catch (e) {
          // Ignore errors
        }
      }
      
      chartViewCacheRef.current.isInitialized = true;
      chartViewCacheRef.current.lastUpdateTime = Date.now();
    } catch (e) {
      console.log("  ⚠️ Error caching chart view state:", e);
    }
  }, []);
  
  // Function to restore cached chart view state and override any library changes
  const restoreCachedViewState = useCallback(() => {
    if (!chartRef.current || !chartViewCacheRef.current.isInitialized) return;
    
    try {
      const chart = chartRef.current;
      const timeScale = chart.timeScale();
      const priceScale = chart.priceScale('right');
      
      // Restore time range
      if (chartViewCacheRef.current.timeRange) {
        timeScale.setVisibleRange(chartViewCacheRef.current.timeRange as any);
      }
      
      // Restore price scale state
      if (priceScale && chartViewCacheRef.current.autoScale !== null) {
        priceScale.applyOptions({ autoScale: chartViewCacheRef.current.autoScale });
      }
    } catch (e) {
      console.log("  ⚠️ Error restoring cached view state:", e);
    }
  }, []);
  
  // Centralized function to update position cache - called BEFORE chart updates
  const updatePositionCache = useCallback((lastPoint: ChartData, forceUpdate: boolean = false) => {
    if (!chartRef.current || !seriesRef.current) return false;
    
    try {
      const coordinate = seriesRef.current.priceToCoordinate(lastPoint.value);
      const timeCoordinate = chartRef.current.timeScale().timeToCoordinate(lastPoint.time);
      
      if (coordinate !== null && timeCoordinate !== null) {
        const containerWidth = chartRef.current.options().width;
        let caretPos: { x: number; y: number; width: number } | null = null;
        let chartPaneWidth = timeCoordinate; // Default to time coordinate if container width not available
        
        if (containerWidth) {
          let priceScaleWidth = 60;
          try {
            const priceScale = chartRef.current.priceScale('right');
            if (priceScale && typeof priceScale.width === 'function') {
              priceScaleWidth = priceScale.width() || 60;
            }
          } catch (e) {}
          chartPaneWidth = containerWidth - priceScaleWidth;
          const desiredWidth = priceScaleWidth - 1;
          const currentTotalWidth = 84;
          const newTotalWidth = currentTotalWidth + desiredWidth;
          
          caretPos = {
            x: chartPaneWidth,
            y: coordinate,
            width: newTotalWidth
          };
        }
        
        // Use timeCoordinate for dot x coordinate - this is the actual last price point position on the chart
        // The dot should be at the last price point, not at the caret position
        const dotPos = { x: timeCoordinate, y: coordinate };
        
        // Update shared position for the entire last price group (dot + ripple)
        // This ensures perfect alignment between all elements
        lastPriceGroupPositionRef.current = dotPos;
        
        // Update centralized cache synchronously
        lastPricePositionsCacheRef.current = {
          dot: dotPos,
          caret: caretPos,
          dataPoint: { ...lastPoint },
          timestamp: Date.now()
        };
        
        // Also update legacy refs for backward compatibility
        dotPositionRef.current = dotPos;
        if (caretPos) {
          caretPositionRef.current = caretPos;
        }
        lastDataPointRef.current = { ...lastPoint };
        
        return true;
      }
    } catch (e) {
      console.error("Error updating position cache:", e);
    }
    return false;
  }, []);

  // Centralized function to recalculate positions - used by all chart events
  const recalculatePositions = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || !lastDataPointRef.current) return;
    
    try {
      const lastPoint = lastDataPointRef.current;
      const coordinate = seriesRef.current.priceToCoordinate(lastPoint.value);
      const timeCoordinate = chartRef.current.timeScale().timeToCoordinate(lastPoint.time);
      
      if (coordinate !== null && timeCoordinate !== null) {
        const containerWidth = chartRef.current.options().width;
        let chartPaneWidth = timeCoordinate; // Default fallback if container width not available
        
        if (containerWidth) {
          let priceScaleWidth = 60;
          try {
            const priceScale = chartRef.current.priceScale('right');
            if (priceScale && typeof priceScale.width === 'function') {
              priceScaleWidth = priceScale.width() || 60;
            }
          } catch (e) {}
          chartPaneWidth = containerWidth - priceScaleWidth;
          const desiredWidth = priceScaleWidth - 1;
          const currentTotalWidth = 84;
          const newTotalWidth = currentTotalWidth + desiredWidth;
          
          caretPositionRef.current = {
            x: chartPaneWidth,
            y: coordinate,
            width: newTotalWidth
          };
        }
        
        // CRITICAL: Use timeCoordinate for dot x coordinate - this is the actual last price point position on the chart
        // The dot should be at the last price point, not at the caret position (chartPaneWidth)
        dotPositionRef.current = { x: timeCoordinate, y: coordinate };
      }
    } catch (e) {
      console.error("Error recalculating positions:", e);
    }
  }, []);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Update price line color when permanent dot color changes
  useEffect(() => {
    if (seriesRef.current && permanentDotColor) {
      const colorName = permanentDotColor === "#10b981" ? "GREEN" : permanentDotColor === "#ef4444" ? "RED" : permanentDotColor === "#3b82f6" ? "BLUE" : "UNKNOWN";
      
      // Convert hex to rgba with specified opacity
      const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      };
      
      // Use 0.7 opacity for the last price line
      const colorWithOpacity = permanentDotColor ? hexToRgba(permanentDotColor, 0.7) : "rgba(37, 99, 235, 0.7)";
      
      console.log("🎨 Updating Y-axis price line color:");
      console.log("  New color:", colorName, "→", permanentDotColor);
      console.log("  With 0.7 opacity (70% transparent)");
      console.log("  The horizontal line on Y-axis now matches the dot!");
      
      seriesRef.current.applyOptions({
        priceLineColor: colorWithOpacity, // 0.7 opacity for last price line
        priceLineWidth: 1, // Same thickness as crosshair lines (width: 1)
        priceLineStyle: 2, // Dashed line
        lastValueVisible: false, // Hide default marker - we use custom unified shape
      });
    }
  }, [permanentDotColor]);

  // Separate effect for chart initialization - only runs once or when isMobile changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // If chart already exists, don't reinitialize
    if (chartRef.current && seriesRef.current) {
      return;
    }

    const initChart = () => {
      // Ensure container has valid dimensions before initializing
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        console.log("  ⏳ Waiting for container dimensions...");
        requestAnimationFrame(initChart);
        return;
      }

      // Additional safety check for mobile devices with device pixel ratio issues
      const computedStyle = window.getComputedStyle(container);
      const actualWidth = parseFloat(computedStyle.width) || container.clientWidth;
      const actualHeight = parseFloat(computedStyle.height) || container.clientHeight;
      
      if (actualWidth === 0 || actualHeight === 0 || isNaN(actualWidth) || isNaN(actualHeight)) {
        console.log("  ⏳ Waiting for valid container dimensions...", { actualWidth, actualHeight });
        requestAnimationFrame(initChart);
        return;
      }

      console.log("  ✅ Initializing chart with container:", {
        width: container.clientWidth,
        height: container.clientHeight,
        actualWidth,
        actualHeight
      });

      try {
        // Clean up existing chart if any
        if (chartRef.current) {
          console.log("  🧹 Cleaning up existing chart instance");
          chartRef.current.remove();
          chartRef.current = null;
        }

        console.log("  🎨 Creating new chart instance");
        // Use actual computed dimensions to avoid device pixel ratio issues
        const chartWidth = Math.max(container.clientWidth, actualWidth);
        const chartHeight = Math.max(container.clientHeight, actualHeight);
        
        const chart = createChart(container, {
          width: chartWidth,
          height: chartHeight,
          layout: {
            background: { color: "rgba(0,0,0,0)" },
            textColor: "rgba(255,255,255,0.6)",
          },
          localization: {
            priceFormatter: (price: number) => {
              // Format with 2 decimal places (1/100 precision) for y-axis reference values - same as last price
              const parts = price.toFixed(2).split('.');
              parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              return parts.join('.');
            },
          },
          grid: {
            vertLines: { 
              color: "rgba(255,255,255,0.05)",
              style: 1,
              visible: true,
            },
            horzLines: { 
              color: "rgba(255,255,255,0.05)",
              style: 1,
              visible: true,
            },
          },
          rightPriceScale: {
            visible: true,
            borderVisible: false,
            scaleMargins: {
              // Adjusted margins: mobile top (0.07), desktop top (0.05), bottom (0.175) for both
              // The programmatic limiting will ensure max 10 reference levels
              top: typeof window !== 'undefined' && window.innerWidth < 768 ? 0.07 : 0.05,
              bottom: 0.175,
            },
            alignLabels: true,
            borderColor: "rgba(255,255,255,0.1)",
            // Limit number of reference levels: max 10 (enforced programmatically)
            ticksVisible: true,
            entireTextOnly: false,
            autoScale: true,
          },
          leftPriceScale: {
            visible: false,
          },
          timeScale: {
            visible: true,
            borderVisible: false,
            timeVisible: true,
            secondsVisible: false,
            barSpacing: typeof window !== 'undefined' && window.innerWidth < 768 ? 4 : 6,
            minBarSpacing: typeof window !== 'undefined' && window.innerWidth < 768 ? 2 : 3,
            shiftVisibleRangeOnNewBar: false, // Prevent chart from auto-scrolling when new data is added
            rightBarStaysOnScroll: false, // Allow rightmost bar to scroll off screen
            // Custom time formatter for consistent formatting (HH:MM)
            // Formats times as-is without rounding - allows zoom level to determine granularity
            // When zoomed out: shows hours (e.g., "20:00", "21:00")
            // When zoomed in: shows minutes (e.g., "07:05", "07:10")
            tickMarkFormatter: (time: number, tickMarkType: any, locale: string) => {
              const date = new Date(time * 1000);
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              // Always return HH:MM format for consistency
              return `${hours}:${minutes}`;
            },
            // On mobile, show bottom time scale (like desktop)
            // Crosshair x-axis label will still appear at top on mobile
            ...(typeof window !== 'undefined' && window.innerWidth < 768 ? {
              visible: true, // Show bottom time scale on mobile
              fixLeftEdge: false,
            } : {}),
          },
          crosshair: {
            vertLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1, // Same thickness as last price line
              style: 2, // Dashed
              labelBackgroundColor: "transparent",
              // On mobile, hide the default x-axis label at bottom
              ...(typeof window !== 'undefined' && window.innerWidth < 768 ? {
                labelVisible: false,
              } : {}),
            },
            horzLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1, // Same thickness as last price line
              style: 2, // Dashed
              labelBackgroundColor: "transparent",
              // On mobile, hide the default y-axis label
              ...(typeof window !== 'undefined' && window.innerWidth < 768 ? {
                labelVisible: false,
              } : {}),
            },
            mode: 1, // Normal crosshair mode - lines will align with chart data
          },
        });

        chartRef.current = chart;

        // Use area series with line (includes gradient area below)
        // In v5.0+, use addSeries with AreaSeries type instead of addAreaSeries
        const series = chart.addSeries(AreaSeries, {
          lineColor: "#2563eb",
          lineWidth: 1,
          topColor: "rgba(37, 99, 235, 0.4)",
          bottomColor: "rgba(37, 99, 235, 0)", // Fully transparent at bottom
          lineStyle: 0, // Solid line (no smoothing)
          priceLineVisible: true,
          priceLineColor: permanentDotColor ? (() => {
            // Convert hex to rgba with 0.7 opacity for the last price line
            const hexToRgba = (hex: string, opacity: number) => {
              const r = parseInt(hex.slice(1, 3), 16);
              const g = parseInt(hex.slice(3, 5), 16);
              const b = parseInt(hex.slice(5, 7), 16);
              return `rgba(${r}, ${g}, ${b}, ${opacity})`;
            };
            return hexToRgba(permanentDotColor, 0.7);
          })() : "rgba(37, 99, 235, 0.7)",
          priceLineWidth: 1, // Same thickness as crosshair lines (width: 1)
          priceLineStyle: 2, // Dashed line
          lastValueVisible: false, // Hide default marker - we use custom unified arrow-rectangle shape
          crosshairMarkerVisible: false, // Hide default crosshair marker - we'll create custom one
          crosshairMarkerRadius: 4,
          priceFormat: {
            type: 'price',
            precision: 2, // 2 decimal places for last price (1/100 precision)
            minMove: 0.01,
          },
        });

        // Use original setData without wrapping
        seriesRef.current = series;

        // Set up MutationObserver to watch for DOM changes

        if (data && data.length > 0) {
          console.log("  📊 Setting data on chart series:", data.length, "points");
          console.log("  📊 First point being set:", data[0]);
          console.log("  📊 Last point being set:", data[data.length - 1]);
          
          // CRITICAL: Calculate positions BEFORE updating chart - this ensures synchronous updates
          const lastPoint = data[data.length - 1];
          const calculatePositions = () => {
            try {
              const coordinate = series.priceToCoordinate(lastPoint.value);
              const timeCoordinate = chart.timeScale().timeToCoordinate(lastPoint.time as any);
              
              if (coordinate !== null && timeCoordinate !== null) {
                const containerWidth = chart.options().width;
                let chartPaneWidth: number = typeof timeCoordinate === 'number' ? timeCoordinate : 0; // Default fallback if container width not available
                
                if (containerWidth) {
                  let priceScaleWidth = 60;
                  try {
                    const priceScale = chart.priceScale('right');
                    if (priceScale && typeof priceScale.width === 'function') {
                      priceScaleWidth = priceScale.width() || 60;
                    }
                  } catch (e) {}
                  chartPaneWidth = containerWidth - priceScaleWidth;
                  const desiredWidth = priceScaleWidth - 1;
                  const currentTotalWidth = 84;
                  const newTotalWidth = currentTotalWidth + desiredWidth;
                  
                  caretPositionRef.current = {
                    x: chartPaneWidth,
                    y: coordinate,
                    width: newTotalWidth
                  };
                }
                
                // CRITICAL: Use timeCoordinate for dot x coordinate - this is the actual last price point position on the chart
                // The dot should be at the last price point, not at the caret position (chartPaneWidth)
                dotPositionRef.current = { x: timeCoordinate, y: coordinate };
                lastDataPointRef.current = { ...lastPoint };
                return true;
              }
            } catch (e) {
              console.error("Error calculating positions:", e);
            }
            return false;
          };
          
          // Calculate positions BEFORE chart update
          calculatePositions();
          
          // CRITICAL: For first load, set initial visible range BEFORE setData to prevent auto-scroll
          const timeScale = chart.timeScale();
          const priceScale = chart.priceScale('right');
          const isFirstLoad = !chartViewCacheRef.current.isInitialized;
          
          if (isFirstLoad && data.length > 0) {
            // Set auto-scale for price scale
            if (priceScale) {
              priceScale.applyOptions({ autoScale: true });
            }
            
            chartViewCacheRef.current.isInitialized = true;
            chartViewCacheRef.current.lastUpdateTime = Date.now();
          }
          
          // Now update chart data using wrapped setData
          // The wrapped version handles caching, disabling auto-scroll, and restoring position
          // Set data
          series.setData(data as any);
          
          // For first load, create initial gap by scrolling programmatically
          if (isFirstLoad && data.length > 0) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                try {
                  const timeScale = chart.timeScale();
                  
                  // Calculate scroll amount: desktop 2x smaller (10px), mobile 4x smaller (5px)
                  const scrollPixels = typeof window !== 'undefined' && window.innerWidth < 768 ? 5 : 10;
                  
                  // Use scrollToPosition to pan the chart (like dragging does)
                  // This creates a gap on the right side and preserves zoom level
                  timeScale.scrollToPosition(scrollPixels, false);
                } catch (e) {
                  console.warn("  ⚠️ Error creating initial gap:", e);
                }
              });
            });
          }
          
          // For first load, cache the view state after data is set
          if (isFirstLoad) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                cacheChartViewState();
              });
            });
          }
          
          // Note: Price scale changes are tracked via manual checks in the time scale subscription
          // The price scale doesn't have a direct subscription method, so we handle it through
          // the time scale subscription and manual cache updates
          
          // Note: Price scale changes are tracked via the existing subscriptions in PermanentDot/YAxisArrowShape
          // We check autoScale state before each data update to preserve manual adjustments
          
          // CRITICAL: Wait for chart to fully update its coordinate system after view restoration
          // Use requestAnimationFrame to ensure chart has finished updating before calculating positions
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Update position cache after chart has fully updated
              // This ensures dots, ripple, and caret all update with correct coordinates
              updatePositionCache(lastPoint, true);
            });
          });
          
          // Initial call to limit y-axis labels will happen after limitYAxisLabels function is defined below
          
          console.log("  ✅ Chart data applied and fitted!");
        } else {
          console.log("  ⚠️ No data to set on chart series!");
        }

        // CRITICAL: Create position update function to expose to parent
        // This allows parent to trigger position updates when series.update() is called
        const updateAllPositions = () => {
          if (chartRef.current && seriesRef.current && lastDataPointRef.current) {
            updatePositionCache(lastDataPointRef.current, true);
          }
        };
        
        // Notify parent that series is ready, and expose position update function
        if (onSeriesReady) {
          console.log("  📢 Calling onSeriesReady callback");
          onSeriesReady(series, chart, updateAllPositions);
        }

        // Function to limit y-axis reference levels to max 10
        const limitYAxisLabels = () => {
          try {
            const chartContainer = container;
            if (!chartContainer) return;
            
            // Find all SVG elements in the container
            const svgs = chartContainer.querySelectorAll('svg');
            if (svgs.length === 0) return;
            
            // Get all text elements from all SVGs
            const allTextElements: SVGTextElement[] = [];
            svgs.forEach((svg) => {
              const texts = Array.from(svg.querySelectorAll('text')) as SVGTextElement[];
              allTextElements.push(...texts);
            });
            
            if (allTextElements.length === 0) return;
            
            // Filter to only price scale labels - be more aggressive in finding them
            const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;
            
            const priceLabels = allTextElements.filter((textElement) => {
              // Get position relative to container
              const rect = textElement.getBoundingClientRect();
              const containerRect = chartContainer.getBoundingClientRect();
              
              // Check if it's a price scale label:
              // 1. Has text-anchor="end" (right-aligned)
              // 2. Positioned on the right side of the chart
              // 3. Has numeric content (price value with optional commas and decimals)
              const textAnchor = textElement.getAttribute('text-anchor');
              const textContent = (textElement.textContent || '').trim();
              const isRightAligned = textAnchor === 'end';
              
              // Adjust threshold for mobile
              const threshold = isMobileView ? 0.5 : 0.55;
              const relativeLeft = rect.left - containerRect.left;
              const isOnRightSide = relativeLeft > (containerRect.width * threshold);
              
              // More flexible regex to match price values (numbers with commas and decimals)
              const hasPriceValue = /^[\d,]+\.?\d{0,2}$/.test(textContent.replace(/,/g, '')) && 
                                    textContent.length > 0 &&
                                    !isNaN(parseFloat(textContent.replace(/,/g, '')));
              
              return isRightAligned && isOnRightSide && hasPriceValue;
            });
            
            const minLabels = 4;
            const maxLabels = 10;
            
            if (priceLabels.length === 0) {
              return; // No labels found yet
            }
            
            // Sort by vertical position (top to bottom)
            const sortedLabels = priceLabels.sort((a, b) => {
              const aY = a.getBoundingClientRect().top;
              const bY = b.getBoundingClientRect().top;
              return aY - bY;
            });
            
            console.log(`  📊 Found ${sortedLabels.length} y-axis labels, limiting to max ${maxLabels}`);
            
            // Apply visibility based on count - always enforce max limit
            sortedLabels.forEach((textElement, index) => {
              // Always enforce max limit strictly
              if (index >= maxLabels) {
                // Hide excess labels beyond max
                textElement.style.display = 'none';
                textElement.style.visibility = 'hidden';
                textElement.style.opacity = '0';
                textElement.setAttribute('data-hidden', 'true');
                // Also hide parent group if it exists
                const parent = textElement.parentElement;
                if (parent && parent.tagName === 'g') {
                  parent.style.display = 'none';
                }
              } else {
                // Show labels within limit
                textElement.style.display = '';
                textElement.style.visibility = 'visible';
                textElement.style.opacity = '1';
                textElement.removeAttribute('data-hidden');
                // Show parent group if it exists
                const parent = textElement.parentElement;
                if (parent && parent.tagName === 'g') {
                  parent.style.display = '';
                }
              }
            });
          } catch (error) {
            console.warn("  ⚠️ Could not limit y-axis labels:", error);
          }
        };

        // Track crosshair position for custom labels
        // Use exact same calculation as desktop - no mobile-specific adjustments
        chart.subscribeCrosshairMove((param: any) => {
          if (param.point) {
            const price = param.seriesData?.get(series)?.value;
            const time = param.time;
            const point = param.point;
            setCrosshairData({ 
              price: price ?? null, 
              time: time ?? null,
              point: point ? { x: point.x, y: point.y } : null
            });
            onCrosshairChange?.(true);
          } else {
            // Crosshair moved outside chart - clear it
            setCrosshairData({ price: null, time: null, point: null });
            onCrosshairChange?.(false);
          }
        });

        // Subscribe to time scale changes to re-apply label limit and recalculate positions
        const timeScale = chart.timeScale();
        // Note: subscribeVisibleTimeRangeChange returns void, not an unsubscribe function
        // We'll track subscription state differently if needed
        timeScale.subscribeVisibleTimeRangeChange(() => {
          setTimeout(limitYAxisLabels, 50);
          // CRITICAL: Recalculate positions AND update cache when time range changes (user drags/scales)
          // This ensures cached coordinates are updated when chart is rescaled/dragged/stretched
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              recalculatePositions();
              // Also update centralized cache to ensure all components have latest coordinates
              if (lastDataPointRef.current) {
                updatePositionCache(lastDataPointRef.current, false);
              }
            });
          });
        });

        // Subscribe to price scale changes to re-apply label limit
        const priceScale = chart.priceScale('right');
        if (priceScale) {
          // Use a MutationObserver to watch for DOM changes in the price scale
          const observer = new MutationObserver((mutations) => {
            // Only trigger if there are actual changes to text elements
            const hasTextChanges = mutations.some((mutation) => {
              if (mutation.type === 'childList') {
                return Array.from(mutation.addedNodes).some((node) => 
                  node.nodeType === 1 && (node as Element).querySelector('text')
                );
              }
              return false;
            });
            
            if (hasTextChanges) {
              // Use multiple attempts to catch labels that render at different times
              setTimeout(limitYAxisLabels, 50);
              setTimeout(limitYAxisLabels, 150);
              setTimeout(limitYAxisLabels, 300);
              // CRITICAL: Recalculate positions AND update cache when price scale changes (user zooms/scales vertically)
              // This ensures cached coordinates are updated when chart is rescaled
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  recalculatePositions();
                  // Also update centralized cache to ensure all components have latest coordinates
                  if (lastDataPointRef.current) {
                    updatePositionCache(lastDataPointRef.current, false);
                  }
                });
              });
            }
          });
          
          // Observe the chart container for changes
          if (container) {
            observer.observe(container, {
              childList: true,
              subtree: true,
              attributes: false,
              characterData: false,
            });
          }
          
          // Store observer for cleanup
          (chartRef.current as any).__labelLimitObserver = observer;
        }

        // Initial call to limit labels after chart is set up - use multiple attempts with increasing delays
        const limitAttempts = [50, 100, 200, 400, 700, 1000, 1500, 2000];
        limitAttempts.forEach((delay) => {
          setTimeout(limitYAxisLabels, delay);
        });
        
        // Also run on every animation frame for a short period to catch late-rendering labels
        let frameCount = 0;
        const maxFrames = 60; // Run for ~1 second at 60fps
        const frameInterval = setInterval(() => {
          limitYAxisLabels();
          frameCount++;
          if (frameCount >= maxFrames) {
            clearInterval(frameInterval);
            (chartRef.current as any).__labelLimitInterval = null;
          }
        }, 16); // ~60fps
        // Store interval for cleanup
        (chartRef.current as any).__labelLimitInterval = frameInterval;

        const resizeObserver = new ResizeObserver(() => {
          // Re-apply label limit on resize
          setTimeout(limitYAxisLabels, 50);
          try {
            if (container.clientWidth > 0 && container.clientHeight > 0 && chartRef.current) {
              // Use requestAnimationFrame to ensure DOM is ready before resizing
              requestAnimationFrame(() => {
                try {
                  if (chartRef.current && container.clientWidth > 0 && container.clientHeight > 0) {
                    chartRef.current.applyOptions({
                      width: container.clientWidth,
                      height: container.clientHeight,
                    });
                    // CRITICAL: Recalculate positions AND update cache after resize
                    // This ensures cached coordinates are updated when chart is resized
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        recalculatePositions();
                        // Also update centralized cache to ensure all components have latest coordinates
                        if (lastDataPointRef.current) {
                          updatePositionCache(lastDataPointRef.current, false);
                        }
                      });
                    });
                  }
                } catch (resizeError) {
                  console.warn("Chart resize error (non-critical):", resizeError);
                }
              });
            }
          } catch (observerError) {
            console.warn("ResizeObserver error (non-critical):", observerError);
          }
        });

        resizeObserver.observe(container);

        // Update time scale position for mobile after chart is created
        const updateTimeScalePosition = () => {
          if (chartRef.current && typeof window !== 'undefined') {
            const isMobileView = window.innerWidth < 768;
            // Note: Lightweight Charts doesn't directly support top time scale
            // We'll handle this via CSS transform
          }
        };
        updateTimeScalePosition();
        window.addEventListener("resize", updateTimeScalePosition);


        return () => {
          console.log("  🧹 Cleanup: removing chart and observer");
          window.removeEventListener("resize", updateTimeScalePosition);
          resizeObserver.disconnect();
          
          // Note: subscribeVisibleTimeRangeChange doesn't return an unsubscribe function
          // The subscription will be cleaned up when the chart is removed
          // Clear the frame interval if it exists
          if ((chartRef.current as any).__labelLimitInterval) {
            clearInterval((chartRef.current as any).__labelLimitInterval);
          }
          if (chartRef.current) {
            // Disconnect label limit observer if it exists
            const observer = (chartRef.current as any).__labelLimitObserver;
            if (observer) {
              observer.disconnect();
            }
            chartRef.current.remove();
            chartRef.current = null;
          }
        };
      } catch (error) {
        console.error("❌ Chart initialization error:", error);
      }
    };

    initChart();
  }, [isMobile]); // Only reinitialize if mobile state changes, not on data changes

  // Track previous data to detect if only last point changed
  const previousDataRef = useRef<ChartData[] | null>(null);
  


  // Separate effect for data updates - only updates data, never recreates chart
  // This effect runs whenever data changes, but only if chart is already initialized
  useEffect(() => {
    // Only update data if chart is already initialized and data exists
    if (!chartRef.current || !seriesRef.current || !data || data.length === 0) {
      return;
    }

    // Skip if chart was just initialized (let initChart handle initial data setup)
    // We check this by seeing if chartViewCacheRef is not initialized yet
    // If it's not initialized, initChart is still setting up, so skip this update
    if (!chartViewCacheRef.current.isInitialized) {
      previousDataRef.current = [...data]; // Store initial data
      return;
    }

    // CRITICAL: Check if only last point changed (price update)
    // If so, use series.update() instead of setData() to avoid position changes
    if (previousDataRef.current && previousDataRef.current.length > 0) {
      const prevData = previousDataRef.current;
      const newData = data;
      
      // Check if only last point changed
      const dataLengthSame = prevData.length === newData.length;
      const lastTimeSame = prevData[prevData.length - 1]?.time === newData[newData.length - 1]?.time;
      const lastPriceChanged = prevData[prevData.length - 1]?.value !== newData[newData.length - 1]?.value;
      
      // Check if all previous points are identical
      let allPreviousPointsIdentical = true;
      if (dataLengthSame && prevData.length > 1) {
        for (let i = 0; i < prevData.length - 1; i++) {
          if (prevData[i]?.time !== newData[i]?.time || prevData[i]?.value !== newData[i]?.value) {
            allPreviousPointsIdentical = false;
            break;
          }
        }
      }
      
      // If only last price changed, use update() instead of setData()
      if (dataLengthSame && lastTimeSame && lastPriceChanged && allPreviousPointsIdentical) {
        const lastPoint = newData[newData.length - 1];
        console.log("  🔄 Price-only update detected - using series.update()");
        
        try {
          // Update the real last point
          seriesRef.current.update(lastPoint as any);
          
          // CRITICAL: Update position cache immediately after series.update()
          // This ensures dots, ripple, and caret update synchronously
          requestAnimationFrame(() => {
            updatePositionCache(lastPoint, true);
          });
          
          previousDataRef.current = [...newData];
          if (lastDataPointRef.current) {
            lastDataPointRef.current = lastPoint;
          }
          return;
        } catch (error) {
          console.error("  ❌ Error updating chart point:", error);
          // Fall through to setData if update fails
        }
      }
      
      // Check if new point was added
      const newPointAdded = newData.length === prevData.length + 1;
      if (newPointAdded) {
        let allPreviousPointsIdenticalForNewPoint = true;
        for (let i = 0; i < prevData.length; i++) {
          if (prevData[i]?.time !== newData[i]?.time || prevData[i]?.value !== newData[i]?.value) {
            allPreviousPointsIdenticalForNewPoint = false;
            break;
          }
        }
        
        if (allPreviousPointsIdenticalForNewPoint) {
          const lastPoint = newData[newData.length - 1];
          console.log("  🔄 New point added - using series.update()");
          
          try {
            // Add the new point
            seriesRef.current.update(lastPoint as any);
            
            // CRITICAL: Update position cache immediately after series.update()
            // This ensures dots, ripple, and caret update synchronously
            requestAnimationFrame(() => {
              updatePositionCache(lastPoint, true);
            });
            
            previousDataRef.current = [...newData];
            if (lastDataPointRef.current) {
              lastDataPointRef.current = lastPoint;
            }
            return;
          } catch (error) {
            console.error("  ❌ Error adding chart point:", error);
            // Fall through to setData if update fails
          }
        }
      }
    }

    // Full data update
    if (typeof seriesRef.current.setData === 'function') {
      console.log("  🔄 Full data update - using setData():", data.length, "points");
      try {
        seriesRef.current.setData(data as any);
        previousDataRef.current = [...data];
      } catch (error) {
        console.error("  ❌ Error updating chart data:", error);
      }
    }
  }, [data]); // Only depends on data, not on chart initialization


  return (
    <div className="relative h-full w-full lightweight-chart-container">
      <div 
        ref={containerRef} 
        className="h-full w-full crosshair-custom"
        style={{
          // Move chart closer to y-axis (shift right) - handled via CSS for mobile
          // Desktop: 0.05vw
          ...(!isMobile && {
            transform: 'translateX(0.05vw)',
          }),
        }}
      />
      
      {/* Hide default crosshair labels and TradingView logo/watermark */}
      <style jsx global>{`
        .crosshair-custom div[style*="background-color: rgb(255, 255, 255)"] {
          display: none !important;
        }
        .crosshair-custom div[style*="background-color: rgb(0, 0, 0)"] {
          display: none !important;
        }
        /* Hide any crosshair labels that might be showing */
        .crosshair-custom > div[style*="position: absolute"] {
          display: none !important;
        }
        /* Hide default x-axis crosshair label at bottom on mobile only */
        @media (max-width: 767px) {
          .lightweight-chart-container > div[style*="position: absolute"][style*="bottom"]:not([class*="custom"]):not([id*="custom"]),
          .crosshair-custom > div[style*="position: absolute"][style*="bottom"]:not([class*="custom"]):not([id*="custom"]) {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
        }
        /* Hide TradingView logo/watermark if present - comprehensive selectors */
        .lightweight-chart-container a[href*="tradingview"],
        .lightweight-chart-container img[src*="tradingview"],
        .lightweight-chart-container div[class*="watermark"],
        .lightweight-chart-container div[class*="logo"],
        .lightweight-chart-container svg[class*="logo"],
        .lightweight-chart-container [data-watermark],
        .lightweight-chart-container [data-logo],
        .crosshair-custom a[href*="tradingview"],
        .crosshair-custom img[src*="tradingview"],
        .crosshair-custom div[class*="watermark"],
        .crosshair-custom div[class*="logo"],
        .crosshair-custom svg[class*="logo"],
        .crosshair-custom [data-watermark],
        .crosshair-custom [data-logo] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        /* Ensure y-axis labels are visible on mobile and desktop */
        .lightweight-chart-container svg text[text-anchor="end"],
        .crosshair-custom svg text[text-anchor="end"] {
          visibility: visible !important;
          opacity: 1 !important;
        }
        /* Hide labels marked as hidden by our limiting function */
        .lightweight-chart-container svg text[data-hidden="true"],
        .crosshair-custom svg text[data-hidden="true"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
        @media (max-width: 767px) {
          /* Ensure y-axis labels are visible on mobile - override any hiding */
          .lightweight-chart-container svg text[text-anchor="end"]:not([data-hidden="true"]),
          .crosshair-custom svg text[text-anchor="end"]:not([data-hidden="true"]) {
            visibility: visible !important;
            opacity: 1 !important;
            display: block !important;
            fill: rgba(255, 255, 255, 0.6) !important;
          }
          /* Hide labels marked as hidden on mobile */
          .lightweight-chart-container svg text[data-hidden="true"],
          .crosshair-custom svg text[data-hidden="true"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
          /* Ensure price scale container is visible on mobile */
          .lightweight-chart-container,
          .crosshair-custom {
            overflow: visible !important;
          }
          /* Increase x-axis (time scale) touch area height on mobile for easier finger interaction */
          /* Target the time scale SVG container - increase height and add padding for better touch target */
          .lightweight-chart-container svg:has(text[text-anchor="middle"]),
          .crosshair-custom svg:has(text[text-anchor="middle"]) {
            min-height: 60px !important;
            padding-bottom: 25px !important;
            padding-top: 5px !important;
          }
          /* Alternative: target time scale by its position at bottom */
          .lightweight-chart-container > svg[style*="bottom"],
          .crosshair-custom > svg[style*="bottom"] {
            min-height: 60px !important;
            padding-bottom: 25px !important;
            padding-top: 5px !important;
          }
          /* Increase touch area for time scale text labels */
          .lightweight-chart-container svg text[text-anchor="middle"],
          .crosshair-custom svg text[text-anchor="middle"] {
            pointer-events: auto !important;
          }
          /* Chart pane positioning handled via JavaScript to exclude y-axis labels */
        }
        /* Set existing crosshair marker opacity to 0.5 */
        /* Target circles in the chart - use both opacity and fill-opacity for SVG elements */
        .lightweight-chart-container svg circle,
        .crosshair-custom svg circle {
          opacity: 0.5 !important;
          fill-opacity: 0.5 !important;
        }
        /* More specific: target circles with radius around 4px (crosshair marker) */
        .lightweight-chart-container svg circle[r="4"],
        .crosshair-custom svg circle[r="4"],
        .lightweight-chart-container svg circle[r="3.5"],
        .crosshair-custom svg circle[r="3.5"],
        .lightweight-chart-container svg circle[r="4.5"],
        .crosshair-custom svg circle[r="4.5"] {
          opacity: 0.5 !important;
          fill-opacity: 0.5 !important;
        }
      `}</style>
      
      
      {/* Permanent dot at last data point - always visible */}
      {/* Use stable key to prevent unmounting - only change when chart/series changes */}
      {permanentDotColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <PermanentDot
          key="permanent-dot"
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={permanentDotColor}
          preCalculatedPosition={lastPricePositionsCacheRef.current.dot || lastPriceGroupPositionRef.current || dotPositionRef.current}
          cachedPosition={lastPricePositionsCacheRef.current.dot || lastPriceGroupPositionRef.current}
          cacheTimestamp={lastPricePositionsCacheRef.current.timestamp}
          sharedGroupPosition={lastPriceGroupPositionRef.current}
          onPositionUpdate={() => {
            // Trigger ripple position update whenever dot position updates
            if (ripplePositionUpdateRef.current) {
              ripplePositionUpdateRef.current();
            }
          }}
        />
      )}
      
      {/* Ripple animation when new data arrives - stable key prevents unmounting, position prop triggers animation */}
      {showPulse && pulseColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <PulseMarker 
          key="pulse-marker"
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={pulseColor}
          sharedGroupPosition={lastPriceGroupPositionRef.current || lastPricePositionsCacheRef.current.dot}
          triggerAnimation={data[data.length - 1].time}
          onPositionUpdateReady={(updateFn) => {
            ripplePositionUpdateRef.current = updateFn;
          }}
        />
      )}
      
      {/* Custom crosshair dot - double dot structure matching last price dot */}
      {crosshairData.price !== null && crosshairData.time !== null && crosshairData.point && chartRef.current && seriesRef.current && (
        <CrosshairDot
          chart={chartRef.current}
          series={seriesRef.current}
          time={crosshairData.time}
          price={crosshairData.price}
        />
      )}
      
      {/* Custom crosshair labels */}
      {crosshairData.price !== null && crosshairData.time !== null && crosshairData.point && chartRef.current && seriesRef.current && (
        <>
          <CrosshairYAxisLabel
            chart={chartRef.current}
            series={seriesRef.current}
            price={crosshairData.price}
            point={crosshairData.point}
          />
          <CrosshairXAxisLabel
            chart={chartRef.current}
            time={crosshairData.time}
            point={crosshairData.point}
          />
        </>
      )}
      
      {/* Unified arrow-rectangle shape on Y-axis - visible on all devices */}
      {/* Use stable key to prevent unmounting - only change when chart/series changes */}
      {permanentDotColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <YAxisArrowShape
          key="y-axis-arrow"
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={permanentDotColor}
          preCalculatedPosition={lastPricePositionsCacheRef.current.caret || caretPositionRef.current}
          cachedPosition={lastPricePositionsCacheRef.current.caret}
          cacheTimestamp={lastPricePositionsCacheRef.current.timestamp}
        />
      )}
    </div>
  );
}

// Permanent dot component - stays visible at last data point
function PermanentDot({ chart, series, lastDataPoint, color, preCalculatedPosition, cachedPosition, cacheTimestamp, sharedGroupPosition, onPositionUpdate }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
  preCalculatedPosition?: { x: number; y: number } | null;
  cachedPosition?: { x: number; y: number } | null;
  cacheTimestamp?: number;
  sharedGroupPosition?: { x: number; y: number } | null;
  onPositionUpdate?: () => void; // Callback to trigger ripple position update
}) {
  const dotRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const cachedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastDataPointRef = useRef<ChartData | null>(null);
  const lastUpdateTimeRef = useRef<number>(0); // Track when data was last updated

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    // Check if lastDataPoint actually changed (data update)
    const dataChanged = lastDataPointRef.current === null || 
                        lastDataPointRef.current.time !== lastDataPoint.time ||
                        lastDataPointRef.current.value !== lastDataPoint.value;
    
    const updatePosition = (forceSync = false) => {
      if (!dotRef.current || !chart || !series) return;

      try {
        // Always recalculate position dynamically based on current chart state
        // This ensures the dot adjusts when chart is dragged or rescaled
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);

        if (coordinate !== null && timeCoordinate !== null) {
          // CRITICAL: Use timeCoordinate for dot x coordinate - this is the actual last price point position on the chart
          // The dot should be at the last price point, not at the caret position (chartPaneWidth)
          const dotPos = { x: timeCoordinate, y: coordinate };
          cachedPositionRef.current = dotPos;
          lastDataPointRef.current = { ...lastDataPoint };
          if (forceSync) {
            lastUpdateTimeRef.current = Date.now(); // Track when data was updated
          }
          dotRef.current.style.left = `${timeCoordinate}px`;
          dotRef.current.style.top = `${coordinate}px`;
          
          // CRITICAL: Trigger ripple position update whenever dot position updates
          // This ensures ripple stays aligned with dot at all times
          if (onPositionUpdate) {
            onPositionUpdate();
          }
        } else {
          // Fallback: use pre-calculated position if dynamic calculation fails
          if (preCalculatedPosition) {
            cachedPositionRef.current = preCalculatedPosition;
            lastDataPointRef.current = { ...lastDataPoint };
            dotRef.current.style.left = `${preCalculatedPosition.x}px`;
            dotRef.current.style.top = `${preCalculatedPosition.y}px`;
            
            // Trigger ripple update even for fallback position
            if (onPositionUpdate) {
              onPositionUpdate();
            }
          }
        }
      } catch (error) {
        console.error("Error positioning permanent dot:", error);
        // If calculation fails, use cached position if available, otherwise pre-calculated
        if (cachedPositionRef.current && dotRef.current) {
          dotRef.current.style.left = `${cachedPositionRef.current.x}px`;
          dotRef.current.style.top = `${cachedPositionRef.current.y}px`;
          if (onPositionUpdate) {
            onPositionUpdate();
          }
        } else if (preCalculatedPosition && dotRef.current) {
          dotRef.current.style.left = `${preCalculatedPosition.x}px`;
          dotRef.current.style.top = `${preCalculatedPosition.y}px`;
          if (onPositionUpdate) {
            onPositionUpdate();
          }
        }
      }
    };

    // When data changes, update immediately and synchronously (no delays)
    if (dataChanged) {
      // CRITICAL: Always recalculate position on data change to ensure correct timeCoordinate
      // Don't use cached positions as they might have wrong x coordinate
      // Use requestAnimationFrame to ensure chart has updated its internal state after rescaling
      requestAnimationFrame(() => {
        updatePosition(true);
        // Also do a second update after another frame to catch any delayed chart updates
        requestAnimationFrame(() => {
          updatePosition(true);
        });
      });
    } else {
      // For other updates (like chart drag/rescale), use normal flow
      updatePosition();
    }
    
    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    if (dotRef.current?.parentElement) {
      resizeObserver.observe(dotRef.current.parentElement);
    }

    // Subscribe to time scale changes (when chart is scrolled/dragged)
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      // CRITICAL: Update position immediately when chart is dragged
      // This ensures the dot stays anchored to the last price point at all times
      updatePosition();
      // Also do a delayed update to catch any chart internal state changes
      requestAnimationFrame(() => {
        updatePosition();
      });
    });

    // Subscribe to price scale changes (when chart is rescaled/zoomed)
    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        // Check if this is a data update (recent data change) vs user interaction
        const recentDataChange = Date.now() - lastUpdateTimeRef.current < 100;
        
        if (recentDataChange) {
          // For data updates, update synchronously without delays
          updatePosition(true);
        } else {
          // For user interactions (drag/rescale), use RAF delays
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              updatePosition();
            });
          });
        }
      });
    }

    // Also listen to chart resize events (handles container resize)
    const handleChartResize = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updatePosition();
        });
      });
    };
    
    // Subscribe to window resize as well
    window.addEventListener('resize', handleChartResize);

    // Add mouse/touch move listeners on the chart container to catch dragging and rescaling gestures
    // This ensures position updates continuously during user interactions
    let isDragging = false;
    let isRescaling = false;
    let dragCheckInterval: number | null = null;
    let rescaleCheckInterval: number | null = null;
    
    const startDragCheck = () => {
      if (dragCheckInterval !== null) return;
      isDragging = true;
      dragCheckInterval = window.setInterval(() => {
        if (isDragging) {
          // Update position continuously during dragging to keep dot anchored to last price
          updatePosition();
        }
      }, 16); // ~60fps check during dragging
    };
    
    const stopDragCheck = () => {
      isDragging = false;
      if (dragCheckInterval !== null) {
        clearInterval(dragCheckInterval);
        dragCheckInterval = null;
        // Final update after dragging stops
        requestAnimationFrame(() => {
          updatePosition();
        });
      }
    };
    
    const startRescaleCheck = () => {
      if (rescaleCheckInterval !== null) return;
      isRescaling = true;
      rescaleCheckInterval = window.setInterval(() => {
        if (isRescaling) {
          updatePosition();
        }
      }, 16); // ~60fps check during rescaling
    };
    
    const stopRescaleCheck = () => {
      isRescaling = false;
      if (rescaleCheckInterval !== null) {
        clearInterval(rescaleCheckInterval);
        rescaleCheckInterval = null;
        // Final update after rescaling stops
        requestAnimationFrame(() => {
          updatePosition();
        });
      }
    };

    // Listen for pointer events on the chart container to detect dragging and rescaling
    const container = dotRef.current?.parentElement;
    if (container) {
      const handlePointerDown = (e: PointerEvent) => {
        // Don't interfere with chart's native scaling/panning
        // Only handle position updates for our custom elements
        // Check if pointer is near the price scale (right edge) or time scale (bottom edge)
        const rect = container.getBoundingClientRect();
        const isNearRightEdge = e.clientX > rect.right - 50; // Within 50px of right edge
        const isNearBottomEdge = e.clientY > rect.bottom - 30; // Within 30px of bottom edge
        
        if (isNearRightEdge || isNearBottomEdge) {
          startRescaleCheck();
        } else {
          // Start drag check for any other pointer down (chart dragging)
          startDragCheck();
        }
        // Don't prevent default - let chart handle scaling/panning
      };
      
      const handlePointerMove = (e: PointerEvent) => {
        // Update position during pointer move (dragging)
        // But don't prevent default to allow chart's native scaling
        if (isDragging || isRescaling) {
          updatePosition();
        }
        // Don't prevent default - let chart handle scaling/panning
      };
      
      const handlePointerUp = () => {
        stopDragCheck();
        stopRescaleCheck();
      };
      
      container.addEventListener('pointerdown', handlePointerDown);
      container.addEventListener('pointermove', handlePointerMove);
      container.addEventListener('pointerup', handlePointerUp);
      container.addEventListener('pointercancel', handlePointerUp);
      
      // Cleanup
      const cleanupPointerListeners = () => {
        container.removeEventListener('pointerdown', handlePointerDown);
        container.removeEventListener('pointermove', handlePointerMove);
        container.removeEventListener('pointerup', handlePointerUp);
        container.removeEventListener('pointercancel', handlePointerUp);
        stopDragCheck();
        stopRescaleCheck();
      };
      
      // Store cleanup function
      (container as any).__permanentDotCleanup = cleanupPointerListeners;
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleChartResize);
      stopDragCheck();
      stopRescaleCheck();
      
      // Cleanup pointer listeners
      const container = dotRef.current?.parentElement;
      if (container && (container as any).__permanentDotCleanup) {
        (container as any).__permanentDotCleanup();
        delete (container as any).__permanentDotCleanup;
      }
      
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
      if (unsubscribePriceScaleChange) {
        unsubscribePriceScaleChange();
      }
    };
  }, [chart, series, lastDataPoint, color, preCalculatedPosition]);

  return (
    <div 
      ref={dotRef}
      className="absolute pointer-events-none"
      style={{
        zIndex: 9998,
      }}
    >
      {/* Permanent center dot - larger dot */}
      <div 
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          width: "8px",
          height: "8px",
          marginLeft: "-4px",
          marginTop: "-4px",
          borderRadius: "50%",
          backgroundColor: color,
          opacity: 0.5, // 50% transparent
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`,
          transition: "background-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out, opacity 0.3s ease-in-out",
        }}
      />
      {/* Small dot on top - 0.5 width (4px), opacity 0.85, perfectly centered */}
      <div 
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          width: "4px",
          height: "4px",
          marginLeft: "-2px",
          marginTop: "-2px",
          borderRadius: "50%",
          backgroundColor: color,
          opacity: 0.85,
          transition: "background-color 0.3s ease-in-out, opacity 0.3s ease-in-out",
        }}
      />
    </div>
  );
}

// Crosshair dot component - double dot structure matching last price dot
function CrosshairDot({ chart, series, time, price }: { 
  chart: any;
  series: any;
  time: number;
  price: number;
}) {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (!dotRef.current || !chart || !series || time == null || price == null) return;

      try {
        // Calculate intersection point of crosshair lines
        // X coordinate: where vertical crosshair line intersects the chart (time coordinate)
        // Y coordinate: where horizontal crosshair line intersects the chart (price coordinate)
        const timeScale = chart.timeScale();
        const timeCoordinate = timeScale.timeToCoordinate(time);
        const priceCoordinate = series.priceToCoordinate(price);
        
        if (timeCoordinate !== null && priceCoordinate !== null) {
          // Position parent div exactly at intersection point
          // Child dots have negative margins (-4px for big, -2px for small) which center them
          // Adjust X coordinate by +1px to center the dot horizontally on the crosshair intersection
          dotRef.current.style.left = `${timeCoordinate + 1}px`;
          dotRef.current.style.top = `${priceCoordinate}px`;
        }
      } catch (error) {
        console.error("Error positioning crosshair dot:", error);
      }
    };

    updatePosition();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    if (dotRef.current?.parentElement) {
      resizeObserver.observe(dotRef.current.parentElement);
    }

    // Subscribe to price scale changes
    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        updatePosition();
      });
    }

    // Subscribe to time scale changes
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      updatePosition();
    });

    return () => {
      resizeObserver.disconnect();
      if (unsubscribePriceScaleChange) {
        unsubscribePriceScaleChange();
      }
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
    };
  }, [chart, series, time, price]);

  const crosshairColor = "#ffffff"; // White - default crosshair marker color

  return (
    <div 
      ref={dotRef}
      className="absolute pointer-events-none"
      style={{
        zIndex: 9998,
      }}
    >
      {/* Big dot - same as last price dot */}
      <div 
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          width: "8px",
          height: "8px",
          marginLeft: "-4px",
          marginTop: "-4px",
          borderRadius: "50%",
          backgroundColor: crosshairColor,
          opacity: 0.5, // 50% transparent
          boxShadow: `0 0 8px ${crosshairColor}, 0 0 16px ${crosshairColor}60`,
          transition: "background-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out, opacity 0.3s ease-in-out",
        }}
      />
      {/* Small dot on top - same as last price dot */}
      <div 
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          width: "4px",
          height: "4px",
          marginLeft: "-2px",
          marginTop: "-2px",
          borderRadius: "50%",
          backgroundColor: crosshairColor,
          opacity: 0.85,
          transition: "background-color 0.3s ease-in-out, opacity 0.3s ease-in-out",
        }}
      />
    </div>
  );
}

// Pulse marker component that positions at exact chart coordinates
function PulseMarker({ chart, series, lastDataPoint, color, sharedGroupPosition, triggerAnimation, onPositionUpdateReady }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
  sharedGroupPosition?: { x: number; y: number } | null;
  triggerAnimation?: number; // Time value to trigger animation restart
  onPositionUpdateReady?: (updateFn: () => void) => void; // Callback to expose position update function
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const rippleContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const lastAnimationTriggerRef = useRef<number | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  console.log("🎨🎨🎨 PulseMarker Component Rendering:");
  console.log("  Color received:", color);
  console.log("  Last data point:", lastDataPoint);

  // Trigger animation restart when triggerAnimation changes (new price update)
  useEffect(() => {
    if (triggerAnimation !== undefined && triggerAnimation !== null && triggerAnimation !== lastAnimationTriggerRef.current) {
      lastAnimationTriggerRef.current = triggerAnimation;
      
      // Silent check - don't log warnings during normal operations
      // This can happen temporarily during chart updates or when component is unmounting
      if (!markerRef.current || !chart || !series) {
        return;
      }
      
      // CRITICAL: Use requestAnimationFrame to ensure chart coordinate system is fully updated
      // This is especially important when chart is rescaled/stretched - coordinates need time to update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Double-check refs are still valid
          // Silent check - don't log warnings during normal operations
          if (!markerRef.current || !chart || !series) {
            return;
          }
          
          // CRITICAL: Use the EXACT same position calculation as PermanentDot
          // This ensures ripple is at the exact same location as the last price dot
          let coordinate: number | null = null;
          let timeCoordinate: number | null = null;
          
          try {
            // Use EXACT same calculation as PermanentDot.updatePosition() uses
            // This ensures perfect alignment with the dot
            coordinate = series.priceToCoordinate(lastDataPoint.value);
            timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);
          } catch (e) {
            console.error("❌ Error calculating ripple position:", e);
            // Fallback to sharedGroupPosition if calculation fails (same as dot fallback)
            if (sharedGroupPosition && markerRef.current) {
              markerRef.current.style.left = `${sharedGroupPosition.x}px`;
              markerRef.current.style.top = `${sharedGroupPosition.y}px`;
              void markerRef.current.offsetHeight;
            }
            return; // Don't trigger animation if position calculation fails
          }
          
          // CRITICAL: Update position with EXACT same coordinates as PermanentDot uses
          // MUST use timeCoordinate for x - this is the actual last price point position on the chart
          if (coordinate !== null && timeCoordinate !== null && markerRef.current) {
            // Use EXACT same position as dot: timeCoordinate for x, coordinate for y
            const expectedLeft = `${timeCoordinate}px`;
            const expectedTop = `${coordinate}px`;
            
            // Update position with latest chart coordinates (same as dot)
            markerRef.current.style.left = expectedLeft;
            markerRef.current.style.top = expectedTop;
            
            // Force reflow to ensure position is applied (same as dot does)
            void markerRef.current.offsetHeight;
            
            // Verify position was set correctly
            // Note: Position mismatch can occur during chart restoration/updates - this is expected
            const computedLeft = markerRef.current.style.left;
            const computedTop = markerRef.current.style.top;
            
            if (computedLeft !== expectedLeft || computedTop !== expectedTop) {
              // Silently force update again - this is normal during chart position restoration
              markerRef.current.style.left = expectedLeft;
              markerRef.current.style.top = expectedTop;
              void markerRef.current.offsetHeight;
            }
            
            // Wait multiple frames to ensure position is fully stable after chart restoration
            // This gives our position restoration logic time to complete
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  // Final check that position is still correct
                  if (!markerRef.current) return;
                  
                  const finalLeft = markerRef.current.style.left;
                  const finalTop = markerRef.current.style.top;
                  
                  // Only start animation if position matches expected (same as dot position)
                  // Allow small tolerance for floating point differences
                  const leftMatch = finalLeft === expectedLeft || 
                    (finalLeft && expectedLeft && Math.abs(parseFloat(finalLeft) - parseFloat(expectedLeft)) < 0.1);
                  const topMatch = finalTop === expectedTop || 
                    (finalTop && expectedTop && Math.abs(parseFloat(finalTop) - parseFloat(expectedTop)) < 0.1);
                  
                  if (leftMatch && topMatch) {
                    // Now trigger animation AFTER position is guaranteed to match dot position
                    if (rippleContainerRef.current) {
                      const ripples = rippleContainerRef.current.querySelectorAll('div');
                      ripples.forEach((ripple: HTMLDivElement, index: number) => {
                        // Remove animation
                        ripple.style.animation = 'none';
                        // Force reflow to ensure the removal is applied
                        void ripple.offsetHeight;
                        // Restart animation with proper timing
                        if (index === 0) {
                          ripple.style.animation = 'tradingViewRipple 2s ease-out forwards';
                        } else if (index === 1) {
                          ripple.style.animation = 'tradingViewRipple 2s ease-out 0.5s forwards';
                        } else if (index === 2) {
                          ripple.style.animation = 'tradingViewRipple 2s ease-out 1s forwards';
                        }
                      });
                    }
                  } else {
                    // Position still doesn't match - this can happen if chart is being restored
                    // Try one more time after a short delay
                    setTimeout(() => {
                      if (!markerRef.current) return;
                      const retryLeft = markerRef.current.style.left;
                      const retryTop = markerRef.current.style.top;
                      const retryLeftMatch = retryLeft === expectedLeft || 
                        (retryLeft && expectedLeft && Math.abs(parseFloat(retryLeft) - parseFloat(expectedLeft)) < 0.1);
                      const retryTopMatch = retryTop === expectedTop || 
                        (retryTop && expectedTop && Math.abs(parseFloat(retryTop) - parseFloat(expectedTop)) < 0.1);
                      
                      if (retryLeftMatch && retryTopMatch && rippleContainerRef.current) {
                        const ripples = rippleContainerRef.current.querySelectorAll('div');
                        ripples.forEach((ripple: HTMLDivElement, index: number) => {
                          ripple.style.animation = 'none';
                          void ripple.offsetHeight;
                          if (index === 0) {
                            ripple.style.animation = 'tradingViewRipple 2s ease-out forwards';
                          } else if (index === 1) {
                            ripple.style.animation = 'tradingViewRipple 2s ease-out 0.5s forwards';
                          } else if (index === 2) {
                            ripple.style.animation = 'tradingViewRipple 2s ease-out 1s forwards';
                          }
                        });
                      }
                      // Don't log warning - position restoration is expected to cause this
                    }, 100);
                  }
                });
              });
            });
          } else {
            console.warn("⚠️ Cannot update ripple position: invalid coordinates", { coordinate, timeCoordinate });
            // Fallback to sharedGroupPosition if coordinates are invalid
            if (sharedGroupPosition && markerRef.current) {
              markerRef.current.style.left = `${sharedGroupPosition.x}px`;
              markerRef.current.style.top = `${sharedGroupPosition.y}px`;
              void markerRef.current.offsetHeight;
            }
          }
        });
      });
    }
  }, [triggerAnimation, chart, series, lastDataPoint, sharedGroupPosition]);

  useEffect(() => {
    // Early return if chart/series not available - don't set up subscriptions
    if (!chart || !series) {
      return;
    }
    
    const updatePosition = () => {
      // Silent check - don't log warnings during normal operations
      // This can happen temporarily during chart updates or when component is unmounting
      if (!markerRef.current || !chart || !series) {
        return;
      }

      try {
        // CRITICAL: Always recalculate position dynamically - same as dot does
        // Use EXACT same calculation as PermanentDot to ensure perfect alignment
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);

        if (coordinate !== null && timeCoordinate !== null) {
          // Use timeCoordinate for ripple x coordinate - this is the actual last price point position on the chart
          // The ripple should align with the last price dot, not the caret position
          markerRef.current.style.left = `${timeCoordinate}px`;
          markerRef.current.style.top = `${coordinate}px`;
        } else {
          // Fallback: use sharedGroupPosition only if calculation fails
          if (sharedGroupPosition && markerRef.current) {
            markerRef.current.style.left = `${sharedGroupPosition.x}px`;
            markerRef.current.style.top = `${sharedGroupPosition.y}px`;
          }
        }
      } catch (error) {
        console.error("  ❌ Error positioning pulse:", error);
        // Fallback: use sharedGroupPosition if calculation throws error
        if (sharedGroupPosition && markerRef.current) {
          markerRef.current.style.left = `${sharedGroupPosition.x}px`;
          markerRef.current.style.top = `${sharedGroupPosition.y}px`;
        }
      }
    };
    
    // CRITICAL: Expose updatePosition function to parent component
    // This allows PermanentDot to trigger ripple position updates whenever dot position changes
    if (onPositionUpdateReady) {
      onPositionUpdateReady(updatePosition);
    }

    // CRITICAL: Use requestAnimationFrame to ensure chart state is fully updated before calculating position
    // This is especially important when chart is rescaled/stretched
    requestAnimationFrame(() => {
      updatePosition();
    });
    
    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        updatePosition();
      });
    });
    if (markerRef.current?.parentElement) {
      resizeObserver.observe(markerRef.current.parentElement);
    }

    // Subscribe to time scale changes (when chart is scrolled/dragged)
    // This ensures the pulse marker moves with the chart when user scrolls horizontally
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      // CRITICAL: Update position immediately to prevent incorrect coordinates
      // Then use requestAnimationFrame to ensure chart has finished updating
      // Check refs again in case component is unmounting
      if (markerRef.current && chart && series) {
        try {
          const coordinate = series.priceToCoordinate(lastDataPoint.value);
          const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);
          if (coordinate !== null && timeCoordinate !== null) {
            markerRef.current.style.left = `${timeCoordinate}px`;
            markerRef.current.style.top = `${coordinate}px`;
          }
        } catch (e) {
          // Ignore errors, will be handled by updatePosition
        }
      }
      // Only call updatePosition if chart/series still exist
      if (chart && series) {
        requestAnimationFrame(() => {
          updatePosition();
        });
      }
    });

    // Subscribe to price scale changes (when chart is zoomed/scaled vertically)
    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        // CRITICAL: Update position immediately to prevent incorrect coordinates
        // Then use requestAnimationFrame to ensure chart has finished updating
        if (markerRef.current && chart && series) {
          try {
            const coordinate = series.priceToCoordinate(lastDataPoint.value);
            const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);
            if (coordinate !== null && timeCoordinate !== null) {
              markerRef.current.style.left = `${timeCoordinate}px`;
              markerRef.current.style.top = `${coordinate}px`;
            }
          } catch (e) {
            // Ignore errors, will be handled by updatePosition
          }
        }
        requestAnimationFrame(() => {
          updatePosition();
        });
      });
    }

    return () => {
      resizeObserver.disconnect();
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
      if (unsubscribePriceScaleChange) {
        unsubscribePriceScaleChange();
      }
    };
  }, [chart, series, lastDataPoint, color, isMobile, sharedGroupPosition, triggerAnimation, onPositionUpdateReady]);

  return (
    <div 
      ref={markerRef}
      className="absolute pointer-events-none"
      style={{
        zIndex: 9999,
      }}
    >
      <div ref={rippleContainerRef}>
        {/* First ripple wave */}
        <div 
          style={{
            position: "absolute",
            left: "0",
            top: "0",
            width: "8px",
            height: "8px",
            marginLeft: "-4px",
            marginTop: "-4px",
            borderRadius: "50%",
            backgroundColor: color,
            opacity: 0.5, // 50% transparent
            transformOrigin: "center center",
            animation: "tradingViewRipple 2s ease-out forwards",
          }}
        />
        {/* Second ripple wave */}
        <div 
          style={{
            position: "absolute",
            left: "0",
            top: "0",
            width: "8px",
            height: "8px",
            marginLeft: "-4px",
            marginTop: "-4px",
            borderRadius: "50%",
            backgroundColor: color,
            transformOrigin: "center center",
            animation: "tradingViewRipple 2s ease-out 0.5s forwards",
          }}
        />
        {/* Third ripple wave */}
        <div 
          style={{
            position: "absolute",
            left: "0",
            top: "0",
            width: "8px",
            height: "8px",
            marginLeft: "-4px",
            marginTop: "-4px",
            borderRadius: "50%",
            backgroundColor: color,
            transformOrigin: "center center",
            animation: "tradingViewRipple 2s ease-out 1s forwards",
          }}
        />
      </div>
    </div>
  );
}

// Y-axis unified arrow-rectangle shape - single element combining triangle + rectangle
function YAxisArrowShape({ chart, series, lastDataPoint, color, preCalculatedPosition, cachedPosition, cacheTimestamp }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
  preCalculatedPosition?: { x: number; y: number; width: number } | null;
  cachedPosition?: { x: number; y: number; width: number } | null;
  cacheTimestamp?: number;
}) {
  const arrowRef = useRef<SVGSVGElement>(null);
  const horizontalPositionRef = useRef<number | null>(null); // Store fixed horizontal position
  const containerWidthRef = useRef<number | null>(null); // Store container width to detect changes
  const lastDataPointRef = useRef<{ time: number; value: number } | null>(null); // Store last data point to detect changes
  const lastUpdateTimeRef = useRef<number>(0); // Track when data was last updated
  const isMobileRef = useRef(false);

  useEffect(() => {
    const checkMobile = () => {
      isMobileRef.current = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    // Check if lastDataPoint actually changed (data update from time range change)
    const dataChanged = lastDataPointRef.current === null || 
                        lastDataPointRef.current.time !== lastDataPoint.time ||
                        lastDataPointRef.current.value !== lastDataPoint.value;
    
    const updatePosition = (forceSync = false) => {
      if (!arrowRef.current || !chart || !series) return;

      try {
        // Always recalculate vertical position dynamically based on current chart state
        // This ensures the caret adjusts when chart is dragged or rescaled
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        
        // Always update vertical position first if coordinate is available
        // This ensures the caret moves with the dot when chart is rescaled
        if (coordinate !== null) {
          arrowRef.current.style.top = `${coordinate}px`;
        }

        const containerWidth = chart.options().width;
        if (!containerWidth) return;

        // Use pre-calculated position if available (from parent component) and coordinate is null
        // But prefer dynamic coordinate if available
        if (preCalculatedPosition && coordinate === null) {
          horizontalPositionRef.current = preCalculatedPosition.x;
          containerWidthRef.current = containerWidth;
          lastDataPointRef.current = {
            time: lastDataPoint.time,
            value: lastDataPoint.value
          };
          
          arrowRef.current.style.left = `${preCalculatedPosition.x}px`;
          arrowRef.current.style.top = `${preCalculatedPosition.y}px`;
          arrowRef.current.setAttribute('width', preCalculatedPosition.width.toString());
          
          // Update the path
          const rectRightX = preCalculatedPosition.width;
          const pathElement = arrowRef.current.querySelector('#y-axis-arrow-path') as SVGPathElement;
          if (pathElement) {
            const pathD = `M 10,0 L 0,11.5 L 10,23 L ${rectRightX - 4},23 Q ${rectRightX},23 ${rectRightX},19 L ${rectRightX},4 Q ${rectRightX},0 ${rectRightX - 4},0 Z`;
            pathElement.setAttribute('d', pathD);
          }
          
          // Update text position
          const textElement = arrowRef.current.querySelector('#y-axis-arrow-text') as SVGTextElement;
          if (textElement) {
            const textX = 10;
            textElement.setAttribute('x', textX.toString());
            textElement.setAttribute('textAnchor', 'start');
          }
          return;
        }
        
        // If coordinate is null and no pre-calculated position, don't update (wait for valid coordinate)
        if (coordinate === null) {
          return;
        }

        // Always recalculate position dynamically
        const storedData = lastDataPointRef.current;
        const dataPointChanged = storedData === null || 
                                 storedData.time !== lastDataPoint.time ||
                                 storedData.value !== lastDataPoint.value;
        const widthChanged = containerWidthRef.current !== containerWidth;

        // Process horizontal position and other updates
        if (containerWidth) {
          // Recalculate horizontal position if needed
          if (horizontalPositionRef.current === null || widthChanged || dataPointChanged) {
            let priceScaleWidth = 0;
            try {
              const priceScale = chart.priceScale('right');
              if (priceScale && typeof priceScale.width === 'function') {
                priceScaleWidth = priceScale.width() || 0;
              }
            } catch (e) {
              priceScaleWidth = 60;
            }
            
            const chartPaneWidth = containerWidth - priceScaleWidth;
            const desiredWidth = priceScaleWidth - 1;
            const currentTotalWidth = 84;
            const newTotalWidth = currentTotalWidth + desiredWidth;
            
            horizontalPositionRef.current = chartPaneWidth;
            containerWidthRef.current = containerWidth;
            lastDataPointRef.current = {
              time: lastDataPoint.time,
              value: lastDataPoint.value
            };
            if (forceSync) {
              lastUpdateTimeRef.current = Date.now(); // Track when data was updated
            }
            
            arrowRef.current.style.left = `${horizontalPositionRef.current}px`;
            arrowRef.current.setAttribute('width', newTotalWidth.toString());
            
            const rectRightX = newTotalWidth;
            const pathElement = arrowRef.current.querySelector('#y-axis-arrow-path') as SVGPathElement;
            if (pathElement) {
              const pathD = `M 10,0 L 0,11.5 L 10,23 L ${rectRightX - 4},23 Q ${rectRightX},23 ${rectRightX},19 L ${rectRightX},4 Q ${rectRightX},0 ${rectRightX - 4},0 Z`;
              pathElement.setAttribute('d', pathD);
            }
          } else {
            // Horizontal position didn't change, but ensure it's set
            if (horizontalPositionRef.current !== null) {
              arrowRef.current.style.left = `${horizontalPositionRef.current}px`;
            } else {
              const priceScale = chart.priceScale('right');
              let priceScaleWidth = 60;
              try {
                if (priceScale && typeof priceScale.width === 'function') {
                  priceScaleWidth = priceScale.width() || 60;
                }
              } catch (e) {}
              const chartPaneWidth = containerWidth - priceScaleWidth;
              arrowRef.current.style.left = `${chartPaneWidth}px`;
            }
          }
          
          const textElement = arrowRef.current.querySelector('#y-axis-arrow-text') as SVGTextElement;
          if (textElement) {
            const textX = 10;
            textElement.setAttribute('x', textX.toString());
            textElement.setAttribute('textAnchor', 'start');
          }
        }
      } catch (error) {
        console.error("Error positioning arrow shape:", error);
        if (horizontalPositionRef.current !== null && arrowRef.current) {
          arrowRef.current.style.left = `${horizontalPositionRef.current}px`;
        }
      }
    };

    // When data changes (time range change), update immediately and synchronously
    if (dataChanged) {
      // CRITICAL: Always update position immediately on data change to prevent disappearance
      // Don't rely on cached position as it might be stale
      updatePosition(true);
      
      // Also force multiple updates to ensure caret stays visible
      requestAnimationFrame(() => {
        updatePosition(true);
        requestAnimationFrame(() => {
          updatePosition(true);
        });
      });
    } else {
      // For other updates (like chart drag/rescale), use normal flow
      updatePosition();
    }
    
    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    if (arrowRef.current?.parentElement) {
      resizeObserver.observe(arrowRef.current.parentElement);
    }

    // Subscribe to time scale changes (when chart is scrolled/dragged)
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      // CRITICAL: Update position immediately when chart is dragged
      // This ensures the caret stays anchored to the last price point at all times
      updatePosition();
      // Also do a delayed update to catch any chart internal state changes
      requestAnimationFrame(() => {
        updatePosition();
      });
    });

    // Subscribe to price scale changes (when chart is rescaled/zoomed)
    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        // CRITICAL: Always update vertical position immediately to prevent disappearance
        // This ensures the caret moves with the dot when chart is rescaled
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        if (coordinate !== null && arrowRef.current) {
          arrowRef.current.style.top = `${coordinate}px`;
        }
        
        // Check if this is a data update (recent data change) vs user interaction
        const recentDataChange = Date.now() - lastUpdateTimeRef.current < 100;
        
        if (recentDataChange) {
          // For data updates, update synchronously without delays
          updatePosition(true);
        } else {
          // For user interactions (drag/rescale), use RAF delays
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              updatePosition();
            });
          });
        }
      });
    }

    // Also listen to chart resize events (handles container resize)
    const handleChartResize = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updatePosition();
        });
      });
    };
    
    // Subscribe to window resize as well
    window.addEventListener('resize', handleChartResize);

    // Add mouse/touch move listeners on the chart container to catch rescaling gestures
    // This is a fallback for when subscriptions don't fire during active rescaling
    let isRescaling = false;
    let rescaleCheckInterval: number | null = null;
    
    const startRescaleCheck = () => {
      if (rescaleCheckInterval !== null) return;
      isRescaling = true;
      rescaleCheckInterval = window.setInterval(() => {
        if (isRescaling) {
          updatePosition();
        }
      }, 16); // ~60fps check during rescaling
    };
    
    const stopRescaleCheck = () => {
      isRescaling = false;
      if (rescaleCheckInterval !== null) {
        clearInterval(rescaleCheckInterval);
        rescaleCheckInterval = null;
        // Final update after rescaling stops
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updatePosition();
          });
        });
      }
    };

    // Listen for pointer and touch events on the chart container to detect rescaling
    // Use both pointer events (works on desktop) and touch events (works better on mobile)
    const container = arrowRef.current?.parentElement;
    if (container) {
      const getEventCoordinates = (e: PointerEvent | TouchEvent): { x: number; y: number } => {
        if ('touches' in e && e.touches.length > 0) {
          return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if ('clientX' in e) {
          return { x: e.clientX, y: e.clientY };
        }
        return { x: 0, y: 0 };
      };

      const handlePointerDown = (e: PointerEvent | TouchEvent) => {
        // Check if pointer/touch is near the price scale (right edge) or time scale (bottom edge)
        const rect = container.getBoundingClientRect();
        const coords = getEventCoordinates(e);
        const isNearRightEdge = coords.x > rect.right - 50; // Within 50px of right edge
        const isNearBottomEdge = coords.y > rect.bottom - 30; // Within 30px of bottom edge
        
        if (isNearRightEdge || isNearBottomEdge) {
          startRescaleCheck();
        }
      };
      
      const handlePointerUp = () => {
        stopRescaleCheck();
      };
      
      // Add pointer events (works on desktop and modern mobile browsers)
      container.addEventListener('pointerdown', handlePointerDown as EventListener);
      container.addEventListener('pointerup', handlePointerUp);
      container.addEventListener('pointercancel', handlePointerUp);
      
      // Add touch events (better support on mobile)
      container.addEventListener('touchstart', handlePointerDown as EventListener);
      container.addEventListener('touchend', handlePointerUp);
      container.addEventListener('touchcancel', handlePointerUp);
      
      // Also listen for touchmove to detect active dragging/rescaling
      const handleTouchMove = () => {
        // If touch is moving, ensure we're updating position
        if (isRescaling) {
          updatePosition();
        }
      };
      container.addEventListener('touchmove', handleTouchMove);
      
      // Cleanup
      const cleanupPointerListeners = () => {
        container.removeEventListener('pointerdown', handlePointerDown as EventListener);
        container.removeEventListener('pointerup', handlePointerUp);
        container.removeEventListener('pointercancel', handlePointerUp);
        container.removeEventListener('touchstart', handlePointerDown as EventListener);
        container.removeEventListener('touchend', handlePointerUp);
        container.removeEventListener('touchcancel', handlePointerUp);
        container.removeEventListener('touchmove', handleTouchMove);
        stopRescaleCheck();
      };
      
      // Store cleanup function
      (container as any).__yAxisArrowCleanup = cleanupPointerListeners;
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleChartResize);
      stopRescaleCheck();
      
      // Cleanup pointer listeners
      const container = arrowRef.current?.parentElement;
      if (container && (container as any).__yAxisArrowCleanup) {
        (container as any).__yAxisArrowCleanup();
        delete (container as any).__yAxisArrowCleanup;
      }
      
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
      if (unsubscribePriceScaleChange) {
        unsubscribePriceScaleChange();
      }
    };
  }, [chart, series, lastDataPoint, color, preCalculatedPosition]);

  // Format price for display with 2 decimal places (1/100 precision) and comma thousand separator
  const formatPrice = (price: number): string => {
    const parts = price.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };
  const priceText = formatPrice(lastDataPoint.value);

  return (
    <svg
      ref={arrowRef}
      className="absolute pointer-events-none"
      width="84"
      height="23"
      style={{
        transform: "translate(0, calc(-50% + 0.5px))",
        zIndex: 9997,
      }}
    >
      {/* Combined shape: triangle + rectangle with rounded corners only on right side */}
      {/* Path will be dynamically updated via useEffect to adjust rectangle width */}
      <path
        id="y-axis-arrow-path"
        d="M 10,0 L 0,11.5 L 10,23 L 80,23 Q 84,23 84,19 L 84,4 Q 84,0 80,0 Z"
        fill={color}
        style={{
          transition: "fill 0.3s ease-in-out",
        }}
      />
      {/* Price text - left-aligned, shifted 5px left from original position */}
      <text
        id="y-axis-arrow-text"
        x="10"
        y="15.5"
        fontSize="12"
        fill="rgba(0, 0, 0, 0.9)"
        textAnchor="start"
        fontFamily="monospace"
        fontWeight="500"
        style={{
          transition: "fill 0.3s ease-in-out",
        }}
      >
        {priceText}
      </text>
    </svg>
  );
}

// Crosshair Y-axis label - matches live price caret shape but with white color, reduced top padding, rounded upper corners
function CrosshairYAxisLabel({ chart, series, price, point }: { 
  chart: any; 
  series: any; 
  price: number;
  point: { x: number; y: number };
}) {
  const labelRef = useRef<SVGSVGElement>(null);
  const horizontalPositionRef = useRef<number | null>(null); // Store fixed horizontal position
  const containerWidthRef = useRef<number | null>(null); // Store container width to detect changes
  const [displayPrice, setDisplayPrice] = useState<number>(price);

  // Update displayPrice when price prop changes
  useEffect(() => {
    setDisplayPrice(price);
  }, [price]);

  useEffect(() => {
    const updatePosition = () => {
      if (!labelRef.current || !chart || !series) return;

      try {
        // Calculate Y position from the price at the crosshair's time position
        // This ensures the caret aligns with the actual chart line, not the cursor Y position
        // The library's point.y is the cursor Y, but we need the chart line Y at the crosshair time
        const coordinate = series.priceToCoordinate(price);
        const containerWidth = chart.options().width;

        if (coordinate !== null && containerWidth) {
          // Use the calculated coordinate from price - this aligns with the actual chart line
          setDisplayPrice(price);
          // Only recalculate horizontal position if container width changed
          // This prevents shifting when prices update
          if (horizontalPositionRef.current === null || containerWidthRef.current !== containerWidth) {
            // Get the actual chart pane width (container width minus right price scale width)
            let priceScaleWidth = 0;
            try {
              const priceScale = chart.priceScale('right');
              if (priceScale && typeof priceScale.width === 'function') {
                priceScaleWidth = priceScale.width() || 0;
              }
            } catch (e) {
              // Price scale not available yet, use default
              priceScaleWidth = 60; // Default price scale width estimate
            }
            
            const chartPaneWidth = containerWidth - priceScaleWidth;
            horizontalPositionRef.current = chartPaneWidth; // Store fixed horizontal position
            containerWidthRef.current = containerWidth; // Store container width
            
            // Calculate desired width: from chart pane right edge to chart card right edge (minus 1px margin)
            const desiredWidth = priceScaleWidth - 1;
            const currentTotalWidth = 84;
            const newTotalWidth = currentTotalWidth + desiredWidth;
            
            labelRef.current.style.left = `${chartPaneWidth}px`;
            labelRef.current.setAttribute('width', newTotalWidth.toString());
            
            // Update the path to extend the rectangle to the new width
            const rectRightX = newTotalWidth;
            const pathElement = labelRef.current.querySelector('path') as SVGPathElement;
            if (pathElement) {
              const pathD = `M 10,1.5 L 0,13.0 L 10,24.5 L ${rectRightX - 4},24.5 Q ${rectRightX},24.5 ${rectRightX},20.5 L ${rectRightX},5.5 Q ${rectRightX},1.5 ${rectRightX - 4},1.5 Z`;
              pathElement.setAttribute('d', pathD);
            }
          }
          
          // Always update vertical position using coordinate from price - aligns with actual chart line
          // Use the stored horizontal position
          if (horizontalPositionRef.current !== null) {
            labelRef.current.style.left = `${horizontalPositionRef.current}px`;
          }
          labelRef.current.style.top = `${coordinate}px`;
          
          // Update text position to align left in the rectangle (shifted 5px left from original, then 2px right)
          const textElement = labelRef.current.querySelector('text') as SVGTextElement;
          if (textElement) {
            const textX = 10; // Left-aligned, shifted 5px left from original (was 15, now 10)
            textElement.setAttribute('x', textX.toString());
            textElement.setAttribute('textAnchor', 'start'); // Left align
          }
        }
      } catch (error) {
        console.error("Error positioning crosshair Y-axis label:", error);
      }
    };

    updatePosition();
    
    const resizeObserver = new ResizeObserver(updatePosition);
    if (labelRef.current?.parentElement) {
      resizeObserver.observe(labelRef.current.parentElement);
    }

    return () => resizeObserver.disconnect();
  }, [chart, series, price, point]);

  // Format price for display with 2 decimal places (1/100 precision) and comma thousand separator
  const formatPrice = (price: number): string => {
    const parts = price.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };
  const priceText = formatPrice(displayPrice);

  return (
    <svg
      ref={labelRef}
      className="absolute pointer-events-none"
      width="84"
      height="28"
      style={{
        transform: "translate(0, calc(-50% + 1px))",
        zIndex: 9998,
      }}
    >
      {/* Combined shape: triangle + rectangle matching live price caret - no rounding on left corners, only right corners rounded */}
      {/* Triangle: tip at (0,13.0), extends from (10,1.5) to (10,24.5) - symmetric triangle with equal sides and angles, moved down 0.5px */}
      {/* Rectangle: from y=1.5 to y=24.5 (23px tall, moved down 0.5px) - rounded only on right side */}
      {/* Path: Rectangle (y=1.5 to y=24.5), triangle tip at y=13.0 (center between y=1.5 and y=24.5) for equal sides and angles */}
      {/* Path will be dynamically updated via useEffect to adjust rectangle width */}
      <path
        d="M 10,1.5 L 80,1.5 Q 84,1.5 84,5.5 L 84,20.5 Q 84,24.5 80,24.5 L 10,24.5 L 0,13.0 L 10,1.5 Z"
        fill="#ffffff"
      />
      {/* Price text - left-aligned, shifted 5px left from original position */}
      {/* Text x position will be dynamically updated via useEffect */}
      <text
        x="10"
        y="17.0"
        fontSize="12"
        fill="rgba(0, 0, 0, 0.9)"
        textAnchor="start"
        fontFamily="monospace"
        fontWeight="500"
      >
        {priceText}
      </text>
    </svg>
  );
}

// Crosshair X-axis label - simple rectangle with equal padding (no triangle, as it was before)
function CrosshairXAxisLabel({ chart, time, point }: { 
  chart: any; 
  time: number;
  point: { x: number; y: number };
}) {
  const labelRef = useRef<SVGSVGElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const updatePosition = () => {
      if (!labelRef.current || !chart) return;

      try {
        // Use point.x directly (same as desktop) - the library's crosshair vertical line uses this
        // This ensures alignment with the library's crosshair on both desktop and mobile
        const containerHeight = chart.options().height;

        if (point.x !== null && containerHeight) {
          if (isMobile) {
            // On mobile, position caret at the top of the chart container
            // Chart container starts after header (62px) + buttons (48px) = 110px from top of chart card
            // Position caret at top of chart container (0px relative to container)
            labelRef.current.style.position = 'absolute';
            labelRef.current.style.left = `${point.x}px`;
            labelRef.current.style.top = `0px`; // At top of chart container
          } else {
            // On desktop, position at bottom
            const shapeY = containerHeight - 23;
            labelRef.current.style.left = `${point.x}px`;
            labelRef.current.style.top = `${shapeY}px`;
            labelRef.current.style.position = 'absolute';
          }
        }
      } catch (error) {
        console.error("Error positioning crosshair X-axis label:", error);
      }
    };

    updatePosition();
    
    const resizeObserver = new ResizeObserver(updatePosition);
    if (labelRef.current?.parentElement) {
      resizeObserver.observe(labelRef.current.parentElement);
    }

    return () => resizeObserver.disconnect();
  }, [chart, point, isMobile]);

  // Format date and time for display - include date and month
  const date = new Date(time * 1000);
  const dateText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeText = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const displayText = `${dateText} ${timeText}`;

  // Calculate width needed for text - buttons use px-4 py-2, so similar padding
  // Measure text width and add padding
  const buttonHeight = 24; // py-2 = 8px top + 8px bottom + ~8px text height
  const buttonPaddingX = 16; // px-4
  // More accurate width calculation: monospace font at 12px = ~7.2px per character
  // Date format: "MMM DD HH:MM:SS" = ~18 characters
  const estimatedTextWidth = displayText.length * 7.2; // Approximate character width for monospace 12px
  const caretWidth = Math.max(Math.ceil(estimatedTextWidth + (buttonPaddingX * 2)), 120); // Minimum width 120px, add padding

  return (
    <svg
      ref={labelRef}
      className="absolute pointer-events-none"
      width={isMobile ? caretWidth : 140}
      height={isMobile ? buttonHeight : 23}
      style={{
        transform: "translate(calc(-50% + 0.5px), 0)",
        zIndex: 9999,
      }}
    >
      {/* Simple rectangle with all corners rounded - match button styling on mobile */}
      <rect
        x="0"
        y="0"
        width={isMobile ? caretWidth : 140}
        height={isMobile ? buttonHeight : 23}
        rx={isMobile ? 8 : 4} // rounded-lg = 8px, rounded = 4px
        ry={isMobile ? 8 : 4}
        fill="#ffffff"
      />
      {/* Date and time text - centered */}
      <text
        x={(isMobile ? caretWidth : 140) / 2}
        y={isMobile ? buttonHeight / 2 + 4 : 15.5}
        fontSize="12"
        fill="rgba(0, 0, 0, 0.9)"
        textAnchor="middle"
        fontFamily="monospace"
        fontWeight="500"
      >
        {displayText}
      </text>
    </svg>
  );
}


