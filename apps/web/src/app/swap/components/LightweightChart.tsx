"use client";

import { useEffect, useRef, useState } from "react";
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
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        console.log("  ⏳ Waiting for container dimensions...");
        requestAnimationFrame(initChart);
        return;
      }

      console.log("  ✅ Initializing chart with container:", {
        width: container.clientWidth,
        height: container.clientHeight
      });

      try {
        // Clean up existing chart if any
        if (chartRef.current) {
          console.log("  🧹 Cleaning up existing chart instance");
          chartRef.current.remove();
          chartRef.current = null;
        }

        console.log("  🎨 Creating new chart instance");
        const chart = createChart(container, {
          width: container.clientWidth,
          height: container.clientHeight,
          layout: {
            background: { color: "rgba(0,0,0,0)" },
            textColor: "rgba(255,255,255,0.6)",
          },
          localization: {
            priceFormatter: (price: number) => price.toFixed(6),
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
              top: 0.1,
              bottom: 0.1,
            },
            alignLabels: true,
            borderColor: "rgba(255,255,255,0.1)",
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
          },
          crosshair: {
            vertLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1,
              style: 2, // Dashed
              labelBackgroundColor: "transparent",
            },
            horzLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1,
              style: 2, // Dashed
              labelBackgroundColor: "transparent",
            },
            mode: 1, // Normal crosshair mode
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
            precision: 6,
            minMove: 0.000001,
          },
        });

        seriesRef.current = series;

        if (data && data.length > 0) {
          console.log("  📊 Setting data on chart series:", data.length, "points");
          console.log("  📊 First point being set:", data[0]);
          console.log("  📊 Last point being set:", data[data.length - 1]);
          series.setData(data);
          chart.timeScale().fitContent();
          console.log("  ✅ Chart data applied and fitted!");
        } else {
          console.log("  ⚠️ No data to set on chart series!");
        }

        // Notify parent that series is ready
        if (onSeriesReady) {
          console.log("  📢 Calling onSeriesReady callback");
          onSeriesReady(series, chart);
        }

        // Track crosshair position for custom labels
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

        const resizeObserver = new ResizeObserver(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            chart.applyOptions({
              width: container.clientWidth,
              height: container.clientHeight,
            });
          }
        });

        resizeObserver.observe(container);

        return () => {
          console.log("  🧹 Cleanup: removing chart and observer");
          resizeObserver.disconnect();
          if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
          }
        };
      } catch (error) {
        console.error("❌ Chart initialization error:", error);
      }
    };

    initChart();
  }, [data]);

  return (
    <div className="relative h-full w-full lightweight-chart-container">
      <div ref={containerRef} className="h-full w-full crosshair-custom" />
      
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
      `}</style>
      
      
      {/* Permanent dot at last data point - always visible */}
      {permanentDotColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <PermanentDot
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={permanentDotColor}
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
      
      {/* Unified arrow-rectangle shape on Y-axis */}
      {permanentDotColor && data.length > 0 && chartRef.current && seriesRef.current && (
        <YAxisArrowShape
          chart={chartRef.current} 
          series={seriesRef.current} 
          lastDataPoint={data[data.length - 1]}
          color={permanentDotColor}
        />
      )}
    </div>
  );
}

// Permanent dot component - stays visible at last data point
function PermanentDot({ chart, series, lastDataPoint, color }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
}) {
  const dotRef = useRef<HTMLDivElement>(null);

  console.log("💎 PermanentDot rendering with color:", color);

  useEffect(() => {
    const updatePosition = () => {
      if (!dotRef.current || !chart || !series) return;

      try {
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const timeCoordinate = chart.timeScale().timeToCoordinate(lastDataPoint.time);

        console.log("💎 Permanent dot position update:", {
          x: timeCoordinate,
          y: coordinate,
          color: color
        });

        if (coordinate !== null && timeCoordinate !== null) {
          dotRef.current.style.left = `${timeCoordinate}px`;
          dotRef.current.style.top = `${coordinate}px`;
        }
      } catch (error) {
        console.error("Error positioning permanent dot:", error);
      }
    };

    updatePosition();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updatePosition);
    if (dotRef.current?.parentElement) {
      resizeObserver.observe(dotRef.current.parentElement);
    }

    // Subscribe to time scale changes (when chart is scrolled/dragged)
    // This ensures the dot moves with the chart when user scrolls horizontally
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      updatePosition();
    });

    return () => {
      resizeObserver.disconnect();
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
    };
  }, [chart, series, lastDataPoint, color]);

  return (
    <div 
      ref={dotRef}
      className="absolute pointer-events-none"
      style={{
        zIndex: 9998,
      }}
    >
      {/* Permanent center dot */}
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
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`,
          transition: "background-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out",
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

    return () => {
      resizeObserver.disconnect();
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
    };
  }, [chart, series, lastDataPoint, color]);

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
function YAxisArrowShape({ chart, series, lastDataPoint, color }: { 
  chart: any; 
  series: any; 
  lastDataPoint: ChartData;
  color: string;
}) {
  const arrowRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (!arrowRef.current || !chart || !series) return;

      try {
        const coordinate = series.priceToCoordinate(lastDataPoint.value);
        const containerWidth = chart.options().width;

        if (coordinate !== null && containerWidth) {
          // Position the unified shape
          const shapeX = containerWidth - 84;
          arrowRef.current.style.left = `${shapeX}px`;
          arrowRef.current.style.top = `${coordinate}px`;
          
          console.log("📐 Unified arrow-rectangle positioned:", {
            x: shapeX,
            y: coordinate,
            color: color
          });
        }
      } catch (error) {
        console.error("Error positioning arrow shape:", error);
      }
    };

    updatePosition();
    
    const resizeObserver = new ResizeObserver(updatePosition);
    if (arrowRef.current?.parentElement) {
      resizeObserver.observe(arrowRef.current.parentElement);
    }

    // Subscribe to time scale changes (when chart is scrolled/dragged)
    // This ensures the arrow shape moves with the chart when user scrolls horizontally
    const timeScale = chart.timeScale();
    const unsubscribeVisibleTimeRangeChange = timeScale.subscribeVisibleTimeRangeChange(() => {
      updatePosition();
    });

    return () => {
      resizeObserver.disconnect();
      if (unsubscribeVisibleTimeRangeChange) {
        unsubscribeVisibleTimeRangeChange();
      }
    };
  }, [chart, series, lastDataPoint, color]);

  // Format price for display
  const priceText = lastDataPoint.value.toFixed(6);

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
      <path
        d="M 10,0 L 0,11.5 L 10,23 L 80,23 Q 84,23 84,19 L 84,4 Q 84,0 80,0 Z"
        fill={color}
        style={{
          transition: "fill 0.3s ease-in-out",
        }}
      />
      {/* Price text - centered vertically with equal padding */}
      <text
        x="47"
        y="15.5"
        fontSize="12"
        fill="rgba(0, 0, 0, 0.9)"
        textAnchor="middle"
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

  useEffect(() => {
    const updatePosition = () => {
      if (!labelRef.current || !chart || !series) return;

      try {
        const coordinate = series.priceToCoordinate(price);
        const containerWidth = chart.options().width;

        if (coordinate !== null && containerWidth) {
          // Position on the right side
          const shapeX = containerWidth - 84;
          labelRef.current.style.left = `${shapeX}px`;
          labelRef.current.style.top = `${coordinate}px`;
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
  }, [chart, series, price]);

  const priceText = price.toFixed(6);

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
      <path
        d="M 10,1.5 L 80,1.5 Q 84,1.5 84,5.5 L 84,20.5 Q 84,24.5 80,24.5 L 10,24.5 L 0,13.0 L 10,1.5 Z"
        fill="#ffffff"
      />
      {/* Price text - centered vertically in rectangle (moved down 0.5px, so y=16.5 + 0.5 = 17.0) */}
      <text
        x="47"
        y="17.0"
        fontSize="12"
        fill="rgba(0, 0, 0, 0.9)"
        textAnchor="middle"
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

  useEffect(() => {
    const updatePosition = () => {
      if (!labelRef.current || !chart) return;

      try {
        const timeCoordinate = chart.timeScale().timeToCoordinate(time);
        const containerHeight = chart.options().height;

        if (timeCoordinate !== null && containerHeight) {
          // Position at the bottom
          const shapeY = containerHeight - 23;
          labelRef.current.style.left = `${timeCoordinate}px`;
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
  }, [chart, time]);

  // Format date and time for display - include date and month
  const date = new Date(time * 1000);
  const dateText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeText = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const displayText = `${dateText} ${timeText}`;

  return (
    <svg
      ref={labelRef}
      className="absolute pointer-events-none"
      width="140"
      height="23"
      style={{
        transform: "translate(calc(-50% + 0.5px), 0)",
        zIndex: 9999,
      }}
    >
      {/* Simple rectangle with all corners rounded and equal padding (3px top and bottom) */}
      <rect
        x="0"
        y="0"
        width="140"
        height="23"
        rx="4"
        ry="4"
        fill="#ffffff"
      />
      {/* Date and time text - centered vertically with equal padding (3px top and bottom) */}
      <text
        x="70"
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

