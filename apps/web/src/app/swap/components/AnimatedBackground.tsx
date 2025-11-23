"use client";

import { useEffect, useRef } from "react";
import React from "react";

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const shapesRef = useRef<Array<{
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    color: { r: number; g: number; b: number };
    currentSize: number;
    targetSize: number;
    growthRate: number;
    age: number;
    maxAge: number;
    opacity: number;
    spawnType: 'center' | 'edge';
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false }); // Disable alpha for better performance
    if (!ctx) return;


    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Swap card area will be recalculated on each frame
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Normal distribution function (Box-Muller transform)
    const normalRandom = (mean: number, stdDev: number): number => {
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return z0 * stdDev + mean;
    };

    // Generate spawn position randomly dispersed within safe zone (20vh-80vh, 10vw-90vw)
    const spawnRandom = () => {
      // Constrain to 20vh-80vh vertically and 10vw-90vw horizontally
      const minX = window.innerWidth * 0.1; // 10vw from left
      const maxX = window.innerWidth * 0.9; // 90vw from left
      const minY = window.innerHeight * 0.2; // 20vh from top
      const maxY = window.innerHeight * 0.8; // 80vh from top
      
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      
      return { 
        x: Math.max(minX, Math.min(maxX, x)), 
        y: Math.max(minY, Math.min(maxY, y)) 
      };
    };

    // Generate spawn position from screen edges (but constrained to safe zone)
    const spawnFromEdge = () => {
      const edge = Math.floor(Math.random() * 4);
      const minX = window.innerWidth * 0.1; // 10vw from left
      const maxX = window.innerWidth * 0.9; // 90vw from left
      const minY = window.innerHeight * 0.2; // 20vh from top
      const maxY = window.innerHeight * 0.8; // 80vh from top
      
      let x, y;
      
      if (edge === 0) { // Top edge (within safe zone)
        x = minX + Math.random() * (maxX - minX);
        y = minY + Math.random() * (minY + 50 - minY); // Spawn near top of safe zone
      } else if (edge === 1) { // Right edge (within safe zone)
        x = maxX - Math.random() * 50; // Spawn near right edge of safe zone
        y = minY + Math.random() * (maxY - minY);
      } else if (edge === 2) { // Bottom edge (within safe zone)
        x = minX + Math.random() * (maxX - minX);
        y = maxY - Math.random() * 50; // Spawn near bottom edge of safe zone
      } else { // Left edge (within safe zone)
        x = minX + Math.random() * 50; // Spawn near left edge of safe zone
        y = minY + Math.random() * (maxY - minY);
      }
      
      return { 
        x: Math.max(minX, Math.min(maxX, x)), 
        y: Math.max(minY, Math.min(maxY, y)) 
      };
    };

    // Gradient colors
    const gradientColors = [
      { r: 56, g: 189, b: 248 },
      { r: 99, g: 102, b: 241 },
      { r: 236, g: 72, b: 153 },
      { r: 244, g: 114, b: 182 },
      { r: 6, g: 180, b: 212 },
      { r: 59, g: 130, b: 246 },
      { r: 139, g: 92, b: 246 },
    ];

    // Initialize shapes - Increased for more collisions and color blending
    // Reduced by 15% from original, and 30% further on mobile for better performance
    const isMobileDevice = window.innerWidth < 768;
    const numShapes = isMobileDevice ? Math.floor(36 * 0.7 * 0.85) : Math.floor(36 * 0.85); // 21 on mobile, 30 on desktop (15% reduction)
    const shapes: Array<{
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      color: { r: number; g: number; b: number };
      currentSize: number; // Current size (grows over time)
      targetSize: number; // Target size (normal distribution: mean=100, std=40)
      growthRate: number; // How fast it grows
      age: number; // Age in milliseconds
      maxAge: number; // When it should fade out
      opacity: number; // Current opacity (fades as it reaches target size)
      spawnType: 'center' | 'edge'; // Where it spawned from
    }> = [];

    // Initialize shapes - dispersed throughout screen
    for (let i = 0; i < numShapes; i++) {
      const shouldSpawnFromEdge = Math.random() < 0.15; // 15% spawn from edges, 85% random across screen
      const pos = shouldSpawnFromEdge ? spawnFromEdge() : spawnRandom();
      
      const zDepth = 0.3 + Math.random() * 0.6;
      const colorIndex = Math.floor(Math.random() * gradientColors.length);
      const baseColor = gradientColors[colorIndex];
      const colorVariation = 15;
      
      // Random movement direction with slight drift
      const baseAngle = Math.random() * Math.PI * 2; // Completely random direction
      const driftAngle = baseAngle + (Math.random() - 0.5) * 0.3; // Slight drift variation
      
      const speed = (0.2 + Math.random() * 0.3) * 0.39; // 30% faster movement (0.3 * 1.3 = 0.39)
      const baseVx = Math.cos(driftAngle) * speed;
      const baseVy = Math.sin(driftAngle) * speed;
      
      // Add slight random drift component
      const driftStrength = 0.05;
      const driftVx = (Math.random() - 0.5) * driftStrength;
      const driftVy = (Math.random() - 0.5) * driftStrength;
      
      const vx = baseVx + driftVx;
      const vy = baseVy + driftVy;
      
      // Normal distribution for target size: mean and std based on viewport
      // Increased sizes for more collisions and color blending
      const viewportMean = Math.min(window.innerWidth * 0.25, window.innerHeight * 0.25); // Increased from 0.2 to 0.25
      const viewportStd = Math.min(window.innerHeight * 0.35, window.innerWidth * 0.25); // Increased for more variation
      const targetSize = Math.max(60, normalRandom(viewportMean, viewportStd)); // Increased min from 50 to 60
      const growthRate = 0.15 + Math.random() * 0.25; // Growth rate (0.15-0.4 px per frame)
      const maxAge = (targetSize / growthRate) * 16.67; // Time to reach target size (in ms)
      
      // Simulate animation having run for a while - random starting state
      const randomAge = Math.random() * maxAge * 0.8; // Random age up to 80% of maxAge
      const simulatedDeltaTime = randomAge / 16.67; // Convert age to deltaTime frames
      
      // Calculate current size based on age (as if it's been growing)
      let currentSize = 2 + Math.random() * 3; // Start from small
      if (randomAge > 0) {
        currentSize = Math.min(
          targetSize,
          currentSize + growthRate * simulatedDeltaTime
        );
      }
      
      // Calculate opacity based on size progress (as if it's been fading)
      const sizeProgress = currentSize / targetSize;
      let opacity = 1.0;
      if (sizeProgress > 0.7) {
        const fadeProgress = (sizeProgress - 0.7) / 0.3;
        opacity = Math.max(0, 1 - fadeProgress);
      }
      
      // Simulate movement - move shape as if it's been moving for randomAge
      const simulatedX = pos.x + vx * simulatedDeltaTime;
      const simulatedY = pos.y + vy * simulatedDeltaTime;
      
      shapes.push({
        x: simulatedX,
        y: simulatedY,
        z: zDepth,
        vx,
        vy,
        vz: 0, // No z movement for submarine effect
        color: {
          r: Math.max(0, Math.min(255, baseColor.r + (Math.random() - 0.5) * colorVariation)),
          g: Math.max(0, Math.min(255, baseColor.g + (Math.random() - 0.5) * colorVariation)),
          b: Math.max(0, Math.min(255, baseColor.b + (Math.random() - 0.5) * colorVariation)),
        },
        currentSize,
        targetSize,
        growthRate,
        age: randomAge, // Start with random age to simulate having run
        maxAge,
        opacity,
        spawnType: shouldSpawnFromEdge ? 'edge' : 'center',
      });
    }

    // Pre-run animation for 1 minute (60 seconds) without rendering
    // This simulates the animation having run for a while so users see the preferred state immediately
    const preRunAnimation = () => {
      const simulatedShapes = shapes.map(shape => ({ ...shape }));
      const targetFPS = 30;
      const frameInterval = 1000 / targetFPS;
      const totalFrames = 30 * targetFPS; // 30 seconds * 30 FPS = 900 frames
      const deltaTime = frameInterval / 16.67; // Normalized deltaTime
      const deltaMs = frameInterval; // Delta in milliseconds
      
      // Normal distribution function (needed for respawning)
      const normalRandom = (mean: number, stdDev: number): number => {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z0 * stdDev + mean;
      };
      
      // Spawn functions (needed for respawning)
      const spawnRandom = () => {
        const minX = window.innerWidth * 0.1;
        const maxX = window.innerWidth * 0.9;
        const minY = window.innerHeight * 0.2;
        const maxY = window.innerHeight * 0.8;
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        return { 
          x: Math.max(minX, Math.min(maxX, x)), 
          y: Math.max(minY, Math.min(maxY, y)) 
        };
      };
      
      const spawnFromEdge = () => {
        const edge = Math.floor(Math.random() * 4);
        const minX = window.innerWidth * 0.1;
        const maxX = window.innerWidth * 0.9;
        const minY = window.innerHeight * 0.2;
        const maxY = window.innerHeight * 0.8;
        let x, y;
        if (edge === 0) {
          x = minX + Math.random() * (maxX - minX);
          y = minY + Math.random() * 50;
        } else if (edge === 1) {
          x = maxX - Math.random() * 50;
          y = minY + Math.random() * (maxY - minY);
        } else if (edge === 2) {
          x = minX + Math.random() * (maxX - minX);
          y = maxY - Math.random() * 50;
        } else {
          x = minX + Math.random() * 50;
          y = minY + Math.random() * (maxY - minY);
        }
        return { 
          x: Math.max(minX, Math.min(maxX, x)), 
          y: Math.max(minY, Math.min(maxY, y)) 
        };
      };
      
      for (let frame = 0; frame < totalFrames; frame++) {
        const shapesToRemove: number[] = [];
        
        // Update all shapes
        for (let i = simulatedShapes.length - 1; i >= 0; i--) {
          const shape = simulatedShapes[i];
          
          // Update age
          shape.age += deltaMs;
          
          // Grow shape
          if (shape.currentSize < shape.targetSize) {
            shape.currentSize = Math.min(
              shape.targetSize,
              shape.currentSize + shape.growthRate * deltaTime
            );
          }
          
          // Update position
          shape.x += shape.vx * deltaTime;
          shape.y += shape.vy * deltaTime;
          
          // Calculate edge fade-out
          const topFadeZone = window.innerHeight * 0.1;
          const bottomFadeZone = window.innerHeight - (window.innerHeight * 0.1);
          let edgeOpacity = 1.0;
          if (shape.y < topFadeZone) {
            edgeOpacity = Math.max(0, shape.y / topFadeZone);
          } else if (shape.y > bottomFadeZone) {
            edgeOpacity = Math.max(0, (window.innerHeight - shape.y) / (window.innerHeight * 0.1));
          }
          
          // Calculate size fade-out
          const sizeProgress = shape.currentSize / shape.targetSize;
          let sizeOpacity = 1.0;
          if (sizeProgress > 0.7) {
            const fadeProgress = (sizeProgress - 0.7) / 0.3;
            sizeOpacity = Math.max(0, 1 - fadeProgress);
          }
          
          shape.opacity = Math.min(edgeOpacity, sizeOpacity);
          
          // Mark for removal if faded or off-screen
          const margin = 200;
          if (
            shape.opacity <= 0 ||
            shape.x < -margin ||
            shape.x > window.innerWidth + margin ||
            shape.y < -margin ||
            shape.y > window.innerHeight + margin
          ) {
            shapesToRemove.push(i);
          }
        }
        
        // Remove faded shapes
        for (const index of shapesToRemove) {
          simulatedShapes.splice(index, 1);
        }
        
        // Respawn to maintain count
        const currentIsMobile = window.innerWidth < 768;
        const currentNumShapes = currentIsMobile ? Math.floor(36 * 0.7 * 0.85) : Math.floor(36 * 0.85);
        while (simulatedShapes.length < currentNumShapes) {
          const shouldSpawnFromEdge = Math.random() < 0.15;
          const pos = shouldSpawnFromEdge ? spawnFromEdge() : spawnRandom();
          
          const zDepth = 0.3 + Math.random() * 0.6;
          const colorIndex = Math.floor(Math.random() * gradientColors.length);
          const baseColor = gradientColors[colorIndex];
          const colorVariation = 15;
          
          const baseAngle = Math.random() * Math.PI * 2;
          const driftAngle = baseAngle + (Math.random() - 0.5) * 0.3;
          const speed = (0.2 + Math.random() * 0.3) * 0.39;
          const baseVx = Math.cos(driftAngle) * speed;
          const baseVy = Math.sin(driftAngle) * speed;
          const driftStrength = 0.05;
          const driftVx = (Math.random() - 0.5) * driftStrength;
          const driftVy = (Math.random() - 0.5) * driftStrength;
          const vx = baseVx + driftVx;
          const vy = baseVy + driftVy;
          
          const viewportMean = Math.min(window.innerWidth * 0.25, window.innerHeight * 0.25);
          const viewportStd = Math.min(window.innerHeight * 0.35, window.innerWidth * 0.25);
          const targetSize = Math.max(60, normalRandom(viewportMean, viewportStd));
          const growthRate = 0.15 + Math.random() * 0.25;
          const maxAge = (targetSize / growthRate) * 16.67;
          
          simulatedShapes.push({
            x: pos.x,
            y: pos.y,
            z: zDepth,
            vx,
            vy,
            vz: 0,
            color: {
              r: Math.max(0, Math.min(255, baseColor.r + (Math.random() - 0.5) * colorVariation)),
              g: Math.max(0, Math.min(255, baseColor.g + (Math.random() - 0.5) * colorVariation)),
              b: Math.max(0, Math.min(255, baseColor.b + (Math.random() - 0.5) * colorVariation)),
            },
            currentSize: 2 + Math.random() * 3,
            targetSize,
            growthRate,
            age: 0,
            maxAge,
            opacity: 1.0,
            spawnType: shouldSpawnFromEdge ? 'edge' : 'center',
          });
        }
      }
      
      return simulatedShapes;
    };
    
    // Run pre-simulation and update shapes
    const preRunShapes = preRunAnimation();
    shapesRef.current = preRunShapes;

    let lastTime = performance.now();
    let frameCount = 0;
    const targetFPS = 30; // Reduced from 60 to 30 FPS
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      frameCount++;
      
      // Throttle to target FPS
      const elapsed = currentTime - lastTime;
      if (elapsed < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      
      const deltaTime = Math.min(elapsed / 16.67, 3);
      const deltaMs = elapsed; // Delta in milliseconds for age tracking
      lastTime = currentTime;

      // Clear canvas
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw shapes
      const shapes = shapesRef.current;
      const shapesToRemove: number[] = [];
      
      // Batch all updates first
      for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        
        // Update age
        shape.age += deltaMs;
        
        // Grow shape gradually
        if (shape.currentSize < shape.targetSize) {
          shape.currentSize = Math.min(
            shape.targetSize,
            shape.currentSize + shape.growthRate * deltaTime
          );
        }
        
        // Update position first
        shape.x += shape.vx * deltaTime;
        shape.y += shape.vy * deltaTime;
        
        // Fade out when near top or bottom edges (within 10vh) - apply this FIRST
        const topFadeZone = window.innerHeight * 0.1; // 10vh from top (0-10vh)
        const bottomFadeZone = window.innerHeight - (window.innerHeight * 0.1); // 10vh from bottom (90-100vh)
        
        let edgeOpacity = 1.0; // Default to fully visible
        
        if (shape.y < topFadeZone) {
          // Fade out as it approaches top edge (0-10vh area)
          // At y=0: opacity=0, at y=topFadeZone: opacity=1
          edgeOpacity = Math.max(0, shape.y / topFadeZone);
        } else if (shape.y > bottomFadeZone) {
          // Fade out as it approaches bottom edge (90-100vh area)
          // At y=bottomFadeZone: opacity=1, at y=window.innerHeight: opacity=0
          edgeOpacity = Math.max(0, (window.innerHeight - shape.y) / (window.innerHeight * 0.1));
        }
        
        // Calculate opacity - fade out as it approaches target size
        const sizeProgress = shape.currentSize / shape.targetSize;
        let sizeOpacity = 1.0;
        if (sizeProgress > 0.7) {
          // Start fading when 70% of target size
          const fadeProgress = (sizeProgress - 0.7) / 0.3; // 0 to 1 as size goes from 70% to 100%
          sizeOpacity = Math.max(0, 1 - fadeProgress);
        }
        
        // Combine both opacity factors - use minimum to ensure both conditions are respected
        shape.opacity = Math.min(edgeOpacity, sizeOpacity);
        
        // Remove shapes that are fully faded or way off screen
        const margin = 200;
        if (
          shape.opacity <= 0 ||
          shape.x < -margin ||
          shape.x > canvas.width + margin ||
          shape.y < -margin ||
          shape.y > canvas.height + margin
        ) {
          shapesToRemove.push(i);
        }
      }
      
      // Remove faded/off-screen shapes
      for (const index of shapesToRemove) {
        shapes.splice(index, 1);
      }
      
      // Respawn shapes to maintain count (recalculate for mobile/desktop)
      const currentIsMobile = window.innerWidth < 768;
      const currentNumShapes = currentIsMobile ? Math.floor(36 * 0.7 * 0.85) : Math.floor(36 * 0.85); // 21 on mobile, 30 on desktop
      while (shapes.length < currentNumShapes) {
        const shouldSpawnFromEdge = Math.random() < 0.15; // 15% spawn from edges, 85% random across screen
        
        // Spawn position logic (inline to avoid scope issues)
        let pos: { x: number; y: number };
        if (shouldSpawnFromEdge) {
          const edge = Math.floor(Math.random() * 4);
          const minX = window.innerWidth * 0.1; // 10vw from left
          const maxX = window.innerWidth * 0.9; // 90vw from left
          const minY = window.innerHeight * 0.2; // 20vh from top
          const maxY = window.innerHeight * 0.8; // 80vh from top
          
          if (edge === 0) { // Top edge (within safe zone)
            pos = { 
              x: minX + Math.random() * (maxX - minX), 
              y: minY + Math.random() * 50 // Spawn near top of safe zone
            };
          } else if (edge === 1) { // Right edge (within safe zone)
            pos = { 
              x: maxX - Math.random() * 50, // Spawn near right edge
              y: minY + Math.random() * (maxY - minY) 
            };
          } else if (edge === 2) { // Bottom edge (within safe zone)
            pos = { 
              x: minX + Math.random() * (maxX - minX), 
              y: maxY - Math.random() * 50 // Spawn near bottom edge
            };
          } else { // Left edge (within safe zone)
            pos = { 
              x: minX + Math.random() * 50, // Spawn near left edge
              y: minY + Math.random() * (maxY - minY) 
            };
          }
        } else {
          // Spawn within safe zone (20vh-80vh, 10vw-90vw)
          const minX = window.innerWidth * 0.1; // 10vw from left
          const maxX = window.innerWidth * 0.9; // 90vw from left
          const minY = window.innerHeight * 0.2; // 20vh from top
          const maxY = window.innerHeight * 0.8; // 80vh from top
          
          pos = {
            x: minX + Math.random() * (maxX - minX),
            y: minY + Math.random() * (maxY - minY)
          };
        }
        
        const zDepth = 0.3 + Math.random() * 0.6;
        const colorIndex = Math.floor(Math.random() * gradientColors.length);
        const baseColor = gradientColors[colorIndex];
        const colorVariation = 15;
        
        // Random movement direction with slight drift
        const baseAngle = Math.random() * Math.PI * 2;
        const driftAngle = baseAngle + (Math.random() - 0.5) * 0.3;
        
        const speed = (0.2 + Math.random() * 0.3) * 0.39; // 30% faster movement (0.3 * 1.3 = 0.39)
        const baseVx = Math.cos(driftAngle) * speed;
        const baseVy = Math.sin(driftAngle) * speed;
        
        // Add slight random drift component
        const driftStrength = 0.05;
        const driftVx = (Math.random() - 0.5) * driftStrength;
        const driftVy = (Math.random() - 0.5) * driftStrength;
        
        const vx = baseVx + driftVx;
        const vy = baseVy + driftVy;
        
        // Normal distribution for target size: mean and std based on viewport
        // Increased sizes for more collisions and color blending
        const viewportMean = Math.min(window.innerWidth * 0.25, window.innerHeight * 0.25); // Increased from 0.2 to 0.25
        const viewportStd = Math.min(window.innerHeight * 0.35, window.innerWidth * 0.25); // Increased for more variation
        const targetSize = Math.max(60, normalRandom(viewportMean, viewportStd)); // Increased min from 50 to 60
        const growthRate = 0.15 + Math.random() * 0.25;
        const maxAge = (targetSize / growthRate) * 16.67;
        
        shapes.push({
          x: pos.x,
          y: pos.y,
          z: zDepth,
          vx,
          vy,
          vz: 0,
          color: {
            r: Math.max(0, Math.min(255, baseColor.r + (Math.random() - 0.5) * colorVariation)),
            g: Math.max(0, Math.min(255, baseColor.g + (Math.random() - 0.5) * colorVariation)),
            b: Math.max(0, Math.min(255, baseColor.b + (Math.random() - 0.5) * colorVariation)),
          },
          currentSize: 2 + Math.random() * 3,
          targetSize,
          growthRate,
          age: 0,
          maxAge,
          opacity: 1.0,
          spawnType: shouldSpawnFromEdge ? 'edge' : 'center',
        });
      }

      // Batch all drawing operations
      ctx.save();
      
      for (let i = 0; i < shapes.length; i++) {
        const shape = shapes[i];
        
        const depthScale = 0.5 + shape.z * 0.5; // Less depth variation for submarine effect
        const displaySize = shape.currentSize * depthScale;
        
        if (displaySize < 1 || shape.opacity <= 0) continue; // Skip tiny or invisible shapes

        // Create gradient with larger radius for more blur (20% increase)
        const blurMultiplier = 1.2; // 20% more blur
        const gradientRadius = displaySize * blurMultiplier;
        const gradient = ctx.createRadialGradient(
          shape.x,
          shape.y,
          0,
          shape.x,
          shape.y,
          gradientRadius
        );

        const r = shape.color.r;
        const g = shape.color.g;
        const b = shape.color.b;
        const baseOpacity = (0.5 + shape.z * 0.5) * shape.opacity * 0.829; // Increased by another 20% (0.691 * 1.2 = 0.829)

        // Softer gradient stops for increased blur effect (20% more gradual falloff)
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 1.0})`);
        gradient.addColorStop(0.1, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.85})`); // Softer start
        gradient.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.65})`); // More gradual
        gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.4})`); // Softer transition
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.2})`); // More gradual
        gradient.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.1})`); // Extended fade
        gradient.addColorStop(0.9, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.03})`); // Softer edge
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        // Draw shape with extended radius for blur effect
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, gradientRadius, 0, Math.PI * 2); // Draw to extended radius
        ctx.fill();
      }
      
      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Detect mobile for opacity adjustment
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        opacity: 1.0, // Full opacity - controlled by wrapper layer in swap page
        willChange: "contents", // Hint browser to optimize
        // Removed CSS blur - using gradient-based glow instead for better performance
      }}
    />
  );
}
