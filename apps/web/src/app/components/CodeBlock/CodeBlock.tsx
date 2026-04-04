"use client";

import React, { useState, useRef, useEffect } from "react";
import { CodeWindowFrame } from "./CodeWindowFrame";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  typingDemo?: boolean;
  /** When typingDemo: extra ms after in-view before the typing loop starts (used for staggered cards). */
  typingStartDelayMs?: number;
  /** When false, render only highlighted code (use inside an outer CodeWindowFrame). */
  showChrome?: boolean;
}

function highlightCode(code: string): React.ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens: React.ReactNode[] = [];
    let currentPos = 0;

    // Keywords
    const keywordRegex = /\b(const|let|var|await|async|import|from|export|function|return|if|else|true|false|null|undefined)\b/g;
    // Strings
    const stringRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    // Comments
    const commentRegex = /(\/\/.*$)/g;
    // Numbers
    const numberRegex = /\b(\d+\.?\d*)\b/g;
    // Functions
    const functionRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;

    // Combine all matches
    const allMatches: Array<{ start: number; end: number; type: string; text: string }> = [];

    let match;
    while ((match = commentRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'comment', text: match[0] });
    }
    while ((match = stringRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'string', text: match[0] });
    }
    while ((match = keywordRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', text: match[0] });
    }
    while ((match = numberRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'number', text: match[0] });
    }
    while ((match = functionRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[1].length, type: 'function', text: match[1] });
    }

    // Sort by position
    allMatches.sort((a, b) => a.start - b.start);

    // Remove overlaps (prioritize earlier matches)
    const filtered: typeof allMatches = [];
    let lastEnd = 0;
    for (const m of allMatches) {
      if (m.start >= lastEnd) {
        filtered.push(m);
        lastEnd = m.end;
      }
    }

    // Build colored tokens
    let pos = 0;
    filtered.forEach((m, idx) => {
      // Add plain text before this match
      if (m.start > pos) {
        tokens.push(
          <span key={`plain-${lineIdx}-${idx}`} className="text-white/80">
            {line.substring(pos, m.start)}
          </span>
        );
      }

      // Add colored token
      const colorMap: Record<string, string> = {
        keyword: 'text-[#FF7AB2]',    // Pink like Xcode
        string: 'text-[#FC6A5D]',     // Red/coral like Xcode
        comment: 'text-[#6C7986]',    // Gray like Xcode
        number: 'text-[#D0BF69]',     // Yellow like Xcode
        function: 'text-[#67B7A4]',   // Teal like Xcode
      };

      tokens.push(
        <span key={`token-${lineIdx}-${idx}`} className={colorMap[m.type] || 'text-white/80'}>
          {m.text}
        </span>
      );

      pos = m.end;
    });

    // Add remaining plain text
    if (pos < line.length) {
      tokens.push(
        <span key={`plain-${lineIdx}-end`} className="text-white/80">
          {line.substring(pos)}
        </span>
      );
    }

    return (
      <div key={lineIdx}>
        {tokens.length > 0 ? tokens : <span className="text-white/80">{line}</span>}
        {lineIdx < lines.length - 1 && '\n'}
      </div>
    );
  });
}

export function CodeBlock({
  code,
  language = "typescript",
  title,
  typingDemo = false,
  typingStartDelayMs = 0,
  showChrome = true,
}: CodeBlockProps) {
  const [displayedCode, setDisplayedCode] = useState(typingDemo ? "" : code);
  const [isVisible, setIsVisible] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(!typingDemo);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2, rootMargin: '0px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!typingDemo) return;

    if (!isVisible) {
      setDisplayedCode("");
      setIsTypingComplete(false);
      return;
    }

    setDisplayedCode("");
    setIsTypingComplete(false);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startDelay = window.setTimeout(() => {
      let currentIndex = 0;
      intervalId = window.setInterval(() => {
        if (currentIndex <= code.length) {
          setDisplayedCode(code.substring(0, currentIndex));
          currentIndex++;
        } else {
          setIsTypingComplete(true);
          if (intervalId !== undefined) {
            window.clearInterval(intervalId);
            intervalId = undefined;
          }
        }
      }, 25);
    }, 300 + typingStartDelayMs);

    return () => {
      window.clearTimeout(startDelay);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [code, typingDemo, isVisible, typingStartDelayMs]);

  const highlightedCode = highlightCode(displayedCode);

  const preInner = (
    <pre
      className="overflow-auto p-4 font-mono text-[13px] leading-relaxed md:p-6"
      style={{ minHeight: showChrome ? "180px" : "100px", maxHeight: showChrome ? "300px" : "220px" }}
    >
      <code>
        {highlightedCode}
        {typingDemo && !isTypingComplete && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-white/80 align-middle" />
        )}
      </code>
    </pre>
  );

  return (
    <div
      ref={containerRef}
      className={`relative transform-gpu transition-[opacity,transform] duration-700 ease-out ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      }`}
    >
      {showChrome ? (
        <CodeWindowFrame title={title} label={language} contentClassName="!p-0">
          {preInner}
        </CodeWindowFrame>
      ) : (
        preInner
      )}
    </div>
  );
}
