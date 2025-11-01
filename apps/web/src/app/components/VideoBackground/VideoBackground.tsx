"use client";

import React, { useEffect, useRef, useState } from "react";

type NeonLight = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  hue: number;
  brightness: number;
};

export function VideoBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const lightsRef = useRef<NeonLight[]>([]);
  const scrollOpacityRef = useRef(1);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    let ticking = false;

    const updateOpacity = () => {
      const scrollY = window.scrollY;
      const nextOpacity = Math.max(0, Math.min(1, 1 - scrollY / 800));

      if (Math.abs(nextOpacity - scrollOpacityRef.current) > 0.01) {
        scrollOpacityRef.current = nextOpacity;
        setOpacity(nextOpacity);
      }

      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateOpacity);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateOpacity();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const { innerWidth, innerHeight } = window;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // Initialize neon lights with depth
    const initLights = () => {
      const count = 20;
      lightsRef.current = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        z: Math.random(), // Depth: 0 (far) to 1 (near)
        vx: (Math.random() - 0.5) * 1.75,
        vy: (Math.random() - 0.5) * 1.75,
        vz: (Math.random() - 0.5) * 0.0015,
        size: 100 + Math.random() * 320,
        hue: [180, 200, 240, 260, 280, 320][i % 6], // Cyan, blue, purple, pink
        brightness: 0.3 + Math.random() * 0.5,
      }));
    };

    initLights();

    const render = () => {
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Deep black background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Update and draw neon lights
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // Sort lights by depth (far to near) for proper layering
      const sortedLights = [...lightsRef.current].sort((a, b) => a.z - b.z);

      sortedLights.forEach((light, index) => {
        // Update position with smooth acceleration
        const time = Date.now() * 0.0005;
        const wave = Math.sin(time + index * 0.5) * 0.4;
        
        light.x += light.vx * light.z;
        light.y += light.vy * light.z + Math.cos(time + index * 0.7) * 0.4;
        light.z += light.vz;

        // Cycle depth
        if (light.z > 1) light.z = 0;
        if (light.z < 0) light.z = 1;

        // Dynamic brightness pulsing - depth affects brightness
        light.brightness = (0.25 + light.z * 0.5) + Math.sin(time * 1.5 + index) * 0.25;

        // Bounce off edges with some randomness
        if (light.x < -light.size * 0.5 || light.x > width + light.size * 0.5) {
          light.vx *= -0.95;
          light.vx += (Math.random() - 0.5) * 0.3;
        }
        if (light.y < -light.size * 0.5 || light.y > height + light.size * 0.5) {
          light.vy *= -0.95;
          light.vy += (Math.random() - 0.5) * 0.3;
        }

        // Keep in bounds
        light.x = Math.max(-light.size * 0.5, Math.min(width + light.size * 0.5, light.x));
        light.y = Math.max(-light.size * 0.5, Math.min(height + light.size * 0.5, light.y));

        // Apply depth-based scale and blur
        const depthScale = 0.3 + light.z * 0.7;
        const actualSize = light.size * depthScale;
        const blur = (1 - light.z) * 15;

        // Draw shadow for depth
        if (light.z > 0.5) {
          const shadowOffset = (light.z - 0.5) * 12;
          const shadowGradient = ctx.createRadialGradient(
            light.x + shadowOffset,
            light.y + shadowOffset,
            0,
            light.x + shadowOffset,
            light.y + shadowOffset,
            actualSize * 0.8
          );
          shadowGradient.addColorStop(0, `rgba(0, 0, 0, ${light.z * 0.3})`);
          shadowGradient.addColorStop(1, `rgba(0, 0, 0, 0)`);
          ctx.fillStyle = shadowGradient;
          ctx.beginPath();
          ctx.arc(light.x + shadowOffset, light.y + shadowOffset, actualSize * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw glow with depth
        ctx.filter = `blur(${blur}px)`;
        const gradient = ctx.createRadialGradient(
          light.x,
          light.y,
          0,
          light.x,
          light.y,
          actualSize
        );

        const alpha = light.brightness * depthScale;
        gradient.addColorStop(0, `hsla(${light.hue}, 85%, 60%, ${alpha})`);
        gradient.addColorStop(0.3, `hsla(${light.hue}, 80%, 55%, ${alpha * 0.5})`);
        gradient.addColorStop(0.6, `hsla(${light.hue}, 75%, 50%, ${alpha * 0.2})`);
        gradient.addColorStop(1, `hsla(${light.hue}, 70%, 45%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(light.x, light.y, actualSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.filter = 'none';
      });

      ctx.restore();

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-700"
      style={{ opacity }}
    >
      {/* Neon lights layer (behind glass) */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* Multiple glass layers for depth */}
      <div className="absolute inset-0 backdrop-blur-2xl bg-black/35" />
      <div className="absolute inset-0 backdrop-blur-xl bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5" />
      
      {/* 3D perspective grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(56, 189, 248, 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          transform: 'perspective(800px) rotateX(60deg) scale(1.5)',
          transformOrigin: 'center bottom',
        }}
      />
      
      {/* Subtle noise texture for glass realism */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Top gradient for header area */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/90 via-black/50 to-transparent" />
      
      {/* Bottom depth gradient */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
    </div>
  );
}
