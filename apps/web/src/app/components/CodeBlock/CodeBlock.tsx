"use client";

import React, { useState, useRef, useEffect } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  typingDemo?: boolean;
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

export function CodeBlock({ code, language = "typescript", title, typingDemo = false }: CodeBlockProps) {
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
    if (!typingDemo || !isVisible || isTypingComplete) return;

    // Small delay before starting typing
    const startDelay = setTimeout(() => {
      let currentIndex = 0;
      const typingInterval = setInterval(() => {
        if (currentIndex <= code.length) {
          setDisplayedCode(code.substring(0, currentIndex));
          currentIndex++;
        } else {
          setIsTypingComplete(true);
          clearInterval(typingInterval);
        }
      }, 25);

      return () => clearInterval(typingInterval);
    }, 300);

    return () => clearTimeout(startDelay);
  }, [code, typingDemo, isVisible, isTypingComplete]);

  const highlightedCode = highlightCode(displayedCode);

  return (
    <div
      ref={containerRef}
      className={`relative transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
    >
      {title && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white/50">{title}</span>
          <span className="text-xs font-medium text-white/30 uppercase tracking-wider">{language}</span>
        </div>
      )}
      <div className="relative rounded-2xl overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-5 py-3 bg-white/5 border-b border-white/10">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
            <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
            <div className="w-3 h-3 rounded-full bg-[#28C840]" />
          </div>
        </div>

        {/* Code content */}
        <div className="relative bg-black/20">
          <pre className="p-4 md:p-6 font-mono text-[13px] leading-relaxed overflow-hidden" style={{ minHeight: '180px', maxHeight: '300px' }}>
            <code>
              {highlightedCode}
              {typingDemo && !isTypingComplete && (
                <span className="inline-block w-1.5 h-4 bg-white/80 ml-0.5 animate-pulse align-middle" />
              )}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
