"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart } from "lightweight-charts";

interface ChartData {
  time: number;
  value: number;
}

interface LightweightChartProps {
  data: ChartData[];
  pulseColor?: string;
  showPulse?: boolean;
  permanentDotColor?: string | null;
  onSeriesReady?: (series: any, chart: any) => void;
}

export default function LightweightChart({ data, pulseColor, showPulse, permanentDotColor, onSeriesReady }: LightweightChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [crosshairData, setCrosshairData] = useState<{ price: number | null; time: number | null; point: { x: number; y: number } | null }>({ price: null, time: null, point: null });
  const [isMobile, setIsMobile] = useState(false);
  const dotPositionRef = useRef<{ x: number; y: number } | null>(null);
  const caretPositionRef = useRef<{ x: number; y: number; width: number } | null>(null);
  const lastDataPointRef = useRef<ChartData | null>(null);
  
  // Centralized function to recalculate positions - used by all chart events
  const recalculatePositions = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || !lastDataPointRef.current) return;
    
    try {
      const lastPoint = lastDataPointRef.current;
      const coordinate = seriesRef.current.priceToCoordinate(lastPoint.value);
      const timeCoordinate = chartRef.current.timeScale().timeToCoordinate(lastPoint.time);
      
      if (coordinate !== null && timeCoordinate !== null) {
        dotPositionRef.current = { x: timeCoordinate, y: coordinate };
        
        const containerWidth = chartRef.current.options().width;
        if (containerWidth) {
          let priceScaleWidth = 60;
          try {
            const priceScale = chartRef.current.priceScale('right');
            if (priceScale && typeof priceScale.width === 'function') {
              priceScaleWidth = priceScale.width() || 60;
            }
          } catch (e) {}
          const chartPaneWidth = containerWidth - priceScaleWidth;
          const desiredWidth = priceScaleWidth - 1;
          const currentTotalWidth = 84;
          const newTotalWidth = currentTotalWidth + desiredWidth;
          
          caretPositionRef.current = {
            x: chartPaneWidth,
            y: coordinate,
            width: newTotalWidth
          };
        }
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
      
      // Convert hex to rgba with 80% opacity
      const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      };
      
      // Use full opacity (100%, fully opaque)
      const colorFullOpacity = permanentDotColor;
      
      console.log("🎨 Updating Y-axis price line color:");
      console.log("  New color:", colorName, "→", permanentDotColor);
      console.log("  With 100% opacity (fully opaque)");
      console.log("  The horizontal line on Y-axis now matches the dot!");
      
      seriesRef.current.applyOptions({
        priceLineColor: colorFullOpacity,
        priceLineWidth: 1,
        priceLineStyle: 2, // Dashed line
        lastValueVisible: false, // Hide default marker - we use custom unified shape
      });
    }
  }, [permanentDotColor]);

  useEffect(() => {
    console.log("\n📈 LightweightChart Component useEffect Triggered:");
    console.log("  Data points received:", data?.length || 0);
    console.log("  Data is:", data ? "DEFINED" : "UNDEFINED");
    if (data && data.length > 0) {
      console.log("  First data point:", data[0]);
      console.log("  Last data point:", data[data.length - 1]);
      console.log("  Sample data (first 3):", data.slice(0, 3));
    } else {
      console.log("  ⚠️ No data received by chart component!");
    }
    
    const container = containerRef.current;
    if (!container) {
      console.log("  ⚠️ Container ref not available yet");
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
            rightOffset: 12,
            barSpacing: 6,
            minBarSpacing: 3,
            // On mobile, show bottom time scale (like desktop)
            // Crosshair x-axis label will still appear at top on mobile
            ...(typeof window !== 'undefined' && window.innerWidth < 768 ? {
              visible: true, // Show bottom time scale on mobile
              fixLeftEdge: false,
              fixRightEdge: false,
            } : {}),
          },
          crosshair: {
            vertLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1,
              style: 2, // Dashed
              labelBackgroundColor: "transparent",
              // On mobile, hide the default x-axis label at bottom
              ...(typeof window !== 'undefined' && window.innerWidth < 768 ? {
                labelVisible: false,
              } : {}),
            },
            horzLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1,
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
        const series = chart.addAreaSeries({
          lineColor: "#2563eb",
          lineWidth: 1.5,
          topColor: "rgba(37, 99, 235, 0.4)",
          bottomColor: "rgba(37, 99, 235, 0)", // Fully transparent at bottom
          lineStyle: 0, // Solid line (no smoothing)
          priceLineVisible: true,
          priceLineColor: permanentDotColor || "#2563eb",
          priceLineWidth: 1,
          priceLineStyle: 2, // Dashed line
          lastValueVisible: false, // Hide default marker - we use custom unified arrow-rectangle shape
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          priceFormat: {
            type: 'price',
            precision: 2, // 2 decimal places for last price (1/100 precision)
            minMove: 0.01,
          },
        });

        seriesRef.current = series;

        if (data && data.length > 0) {
          console.log("  📊 Setting data on chart series:", data.length, "points");
          console.log("  📊 First point being set:", data[0]);
          console.log("  📊 Last point being set:", data[data.length - 1]);
          
          // CRITICAL: Calculate positions BEFORE updating chart - this ensures synchronous updates
          const lastPoint = data[data.length - 1];
          const calculatePositions = () => {
            try {
              const coordinate = series.priceToCoordinate(lastPoint.value);
              const timeCoordinate = chart.timeScale().timeToCoordinate(lastPoint.time);
              
              if (coordinate !== null && timeCoordinate !== null) {
                dotPositionRef.current = { x: timeCoordinate, y: coordinate };
                
                const containerWidth = chart.options().width;
                if (containerWidth) {
                  let priceScaleWidth = 60;
                  try {
                    const priceScale = chart.priceScale('right');
                    if (priceScale && typeof priceScale.width === 'function') {
                      priceScaleWidth = priceScale.width() || 60;
                    }
                  } catch (e) {}
                  const chartPaneWidth = containerWidth - priceScaleWidth;
                  const desiredWidth = priceScaleWidth - 1;
                  const currentTotalWidth = 84;
                  const newTotalWidth = currentTotalWidth + desiredWidth;
                  
                  caretPositionRef.current = {
                    x: chartPaneWidth,
                    y: coordinate,
                    width: newTotalWidth
                  };
                }
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
          
          // Now update chart data
          series.setData(data);
          chart.timeScale().fitContent();
          // Force price scale to update after data is set
          const priceScale = chart.priceScale('right');
          if (priceScale) {
            priceScale.applyOptions({ autoScale: true });
          }
          
          // Recalculate positions AFTER chart updates using double RAF to ensure chart has rendered
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              calculatePositions();
            });
          });
          
          // Initial call to limit y-axis labels will happen after limitYAxisLabels function is defined below
          
          console.log("  ✅ Chart data applied and fitted!");
        } else {
          console.log("  ⚠️ No data to set on chart series!");
        }

        // Notify parent that series is ready
        if (onSeriesReady) {
          console.log("  📢 Calling onSeriesReady callback");
          onSeriesReady(series, chart);
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
          } else {
            setCrosshairData({ price: null, time: null, point: null });
          }
        });

        // Subscribe to time scale changes to re-apply label limit and recalculate positions
        const timeScale = chart.timeScale();
        const unsubscribeTimeScale = timeScale.subscribeVisibleTimeRangeChange(() => {
          setTimeout(limitYAxisLabels, 50);
          // Recalculate positions when time range changes (user drags/scales)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              recalculatePositions();
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
              // Recalculate positions when price scale changes (user zooms/scales vertically)
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  recalculatePositions();
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
                    // Recalculate positions after resize
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        recalculatePositions();
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
          if (unsubscribeTimeScale) {
            unsubscribeTimeScale();
          }
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
  }, [data, isMobile]);

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
          /* Chart pane positioning handled via JavaScript to exclude y-axis labels */
        }
      `}</style>
      
      
      {/* Permanent dot at last data point - always visible */}
      {permanentDotColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <PermanentDot
          key={`permanent-dot-${data[data.length - 1].time}-${data[data.length - 1].value}`}
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={permanentDotColor}
          preCalculatedPosition={dotPositionRef.current}
        />
      )}
      
      {/* Ripple animation when new data arrives */}
      {showPulse && pulseColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <PulseMarker 
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={pulseColor}
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
      {permanentDotColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <YAxisArrowShape
          key={`y-axis-arrow-${data[data.length - 1].time}-${data[data.length - 1].value}`}
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={permanentDotColor}
          preCalculatedPosition={caretPositionRef.current}
        />
      )}
    </div>
  );
}

// Permanent dot component - stays visible at last data point
function PermanentDot({ chart, series, lastDataPoint, color, preCalculatedPosition }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
  preCalculatedPosition?: { x: number; y: number } | null;
}) {
  const dotRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const cachedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastDataPointRef = useRef<ChartData | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  console.log("💎 PermanentDot rendering with color:", color);

  useEffect(() => {
    const updatePosition = () => {
      if (!dotRef.current || !chart || !series) return;

      try {
        // Use pre-calculated position if available (from parent component)
        if (preCalculatedPosition) {
          cachedPositionRef.current = preCalculatedPosition;
          lastDataPointRef.current = { ...lastDataPoint };
          dotRef.current.style.left = `${preCalculatedPosition.x}px`;
          dotRef.current.style.top = `${preCalculatedPosition.y}px`;
          return;
        }

        // Fallback: calculate position if pre-calculated not available
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);

        console.log("💎 Permanent dot position update:", {
          x: timeCoordinate,
          y: coordinate,
          color: color
        });

        if (coordinate !== null && timeCoordinate !== null) {
          cachedPositionRef.current = { x: timeCoordinate, y: coordinate };
          lastDataPointRef.current = { ...lastDataPoint };
          dotRef.current.style.left = `${timeCoordinate}px`;
          dotRef.current.style.top = `${coordinate}px`;
        }
      } catch (error) {
        console.error("Error positioning permanent dot:", error);
        // If calculation fails, use cached position if available
        if (cachedPositionRef.current && dotRef.current) {
          dotRef.current.style.left = `${cachedPositionRef.current.x}px`;
          dotRef.current.style.top = `${cachedPositionRef.current.y}px`;
        }
      }
    };

    // Update immediately with pre-calculated position or calculate synchronously
    updatePosition();
    
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
      updatePosition();
    });

    // Subscribe to price scale changes
    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        updatePosition();
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

// Pulse marker component that positions at exact chart coordinates
function PulseMarker({ chart, series, lastDataPoint, color }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  console.log("🎨🎨🎨 PulseMarker Component Rendering:");
  console.log("  Color received:", color);
  console.log("  Last data point:", lastDataPoint);

  useEffect(() => {
    const updatePosition = () => {
      if (!markerRef.current || !chart || !series) {
        console.log("  ⚠️ Missing ref/chart/series");
        return;
      }

      try {
        // Get the coordinate of the last data point
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);

        console.log("📍 Positioning pulse at chart coordinates:");
        console.log("  Data point:", lastDataPoint);
        console.log("  Y coordinate (price):", coordinate);
        console.log("  X coordinate (time):", timeCoordinate);
        console.log("  Color for ripple:", color);

        if (coordinate !== null && timeCoordinate !== null) {
          markerRef.current.style.left = `${timeCoordinate}px`;
          markerRef.current.style.top = `${coordinate}px`;
          console.log("  ✅ Pulse positioned at:", timeCoordinate, ",", coordinate);
        } else {
          console.log("  ⚠️ Could not calculate coordinates");
        }
      } catch (error) {
        console.error("  ❌ Error positioning pulse:", error);
      }
    };

    updatePosition();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updatePosition);
    if (markerRef.current?.parentElement) {
      resizeObserver.observe(markerRef.current.parentElement);
    }

    // Subscribe to time scale changes (when chart is scrolled/dragged)
    // This ensures the pulse marker moves with the chart when user scrolls horizontally
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      updatePosition();
    });

    // Subscribe to price scale changes (when chart is zoomed/scaled vertically)
    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        updatePosition();
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
  }, [chart, series, lastDataPoint, color, isMobile]);

  return (
    <div 
      ref={markerRef}
      className="absolute pointer-events-none"
      style={{
        zIndex: 9999,
      }}
    >
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
  );
}

// Y-axis unified arrow-rectangle shape - single element combining triangle + rectangle
function YAxisArrowShape({ chart, series, lastDataPoint, color, preCalculatedPosition }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
  preCalculatedPosition?: { x: number; y: number; width: number } | null;
}) {
  const arrowRef = useRef<SVGSVGElement>(null);
  const horizontalPositionRef = useRef<number | null>(null); // Store fixed horizontal position
  const containerWidthRef = useRef<number | null>(null); // Store container width to detect changes
  const lastDataPointRef = useRef<{ time: number; value: number } | null>(null); // Store last data point to detect changes
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
    const updatePosition = () => {
      if (!arrowRef.current || !chart || !series) return;

      try {
        const containerWidth = chart.options().width;
        if (!containerWidth) return;

        // Use pre-calculated position if available (from parent component)
        if (preCalculatedPosition) {
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

        // Fallback: calculate position if pre-calculated not available
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const storedData = lastDataPointRef.current;
        const dataPointChanged = storedData === null || 
                                 storedData.time !== lastDataPoint.time ||
                                 storedData.value !== lastDataPoint.value;
        const widthChanged = containerWidthRef.current !== containerWidth;

        if (coordinate !== null && containerWidth) {
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
            
            arrowRef.current.style.left = `${horizontalPositionRef.current}px`;
            arrowRef.current.setAttribute('width', newTotalWidth.toString());
            
            const rectRightX = newTotalWidth;
            const pathElement = arrowRef.current.querySelector('#y-axis-arrow-path') as SVGPathElement;
            if (pathElement) {
              const pathD = `M 10,0 L 0,11.5 L 10,23 L ${rectRightX - 4},23 Q ${rectRightX},23 ${rectRightX},19 L ${rectRightX},4 Q ${rectRightX},0 ${rectRightX - 4},0 Z`;
              pathElement.setAttribute('d', pathD);
            }
          }
          
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
          arrowRef.current.style.top = `${coordinate}px`;
          
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

    // Update immediately with pre-calculated position or calculate synchronously
    updatePosition();
    
    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    if (arrowRef.current?.parentElement) {
      resizeObserver.observe(arrowRef.current.parentElement);
    }

    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      updatePosition();
    });

    const priceScale = chart.priceScale('right');
    let unsubscribePriceScaleChange: (() => void) | null = null;
    if (priceScale && typeof priceScale.subscribeVisiblePriceRangeChange === 'function') {
      unsubscribePriceScaleChange = priceScale.subscribeVisiblePriceRangeChange(() => {
        updatePosition();
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
          // On mobile, position at top; on desktop, position at bottom
          const shapeY = isMobile ? 0 : containerHeight - 23;
          labelRef.current.style.left = `${point.x}px`;
          labelRef.current.style.top = `${shapeY}px`;
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

  // On mobile, reduce left and right padding by 2x (from 70px center to 35px padding)
  const paddingX = isMobile ? 35 : 70; // 2x smaller padding on mobile
  const textX = isMobile ? 35 : 70; // Center text based on padding

  return (
    <svg
      ref={labelRef}
      className="absolute pointer-events-none"
      width={isMobile ? 70 : 140}
      height="23"
      style={{
        transform: "translate(calc(-50% + 0.5px), 0)",
        zIndex: 9999,
      }}
    >
      {/* Simple rectangle with all corners rounded - reduced width on mobile */}
      <rect
        x="0"
        y="0"
        width={isMobile ? 70 : 140}
        height="23"
        rx="4"
        ry="4"
        fill="#ffffff"
      />
      {/* Date and time text - centered with reduced padding on mobile */}
      <text
        x={textX.toString()}
        y="15.5"
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

