"use client";

import { useEffect, useRef } from "react";
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
              labelBackgroundColor: "#ffffff",
            },
            horzLine: {
              color: "rgba(255, 255, 255, 0.3)",
              width: 1,
              style: 2, // Dashed
              labelBackgroundColor: "#ffffff",
            },
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
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full crosshair-custom" />
      
      {/* Custom styles for crosshair labels */}
      <style jsx global>{`
        .crosshair-custom div[style*="background-color: rgb(255, 255, 255)"] {
          color: #000000 !important;
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
    
    const resizeObserver = new ResizeObserver(updatePosition);
    if (dotRef.current?.parentElement) {
      resizeObserver.observe(dotRef.current.parentElement);
    }

    return () => resizeObserver.disconnect();
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

    return () => resizeObserver.disconnect();
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

    return () => resizeObserver.disconnect();
  }, [chart, series, lastDataPoint, color]);

  // Format price for display
  const priceText = lastDataPoint.value.toFixed(6);

  return (
    <svg
      ref={arrowRef}
      className="absolute pointer-events-none"
      width="84"
      height="17"
      style={{
        transform: "translate(0, calc(-50% + 0.5px))",
        zIndex: 9997,
      }}
    >
      {/* Single unified path: triangle + rectangle */}
      <path
        d="M 10,0 L 0,8.5 L 10,17 L 84,17 L 84,0 L 10,0 Z"
        fill={color}
        style={{
          transition: "fill 0.3s ease-in-out",
        }}
      />
      {/* Price text */}
      <text
        x="47"
        y="12"
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
