"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { CodeWindowFrame } from "./CodeWindowFrame";

/** ~2× faster than the original 25ms/char (~80 → ~160 chars/s). */
const TYPING_MS_PER_CHAR = 12.5;

export type TypingSequencePhase = "queued" | "typing" | "done";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  typingDemo?: boolean;
  /** When typingDemo: extra ms before the first character (default path only). */
  typingStartDelayMs?: number;
  /** When set with typingDemo, typing is driven by this phase instead of internal in-view logic. */
  typingSequencePhase?: TypingSequencePhase;
  /** Fired once when a sequential typing run finishes (last character). */
  onTypingSequenceComplete?: () => void;
  /** When false, render only highlighted code (use inside an outer CodeWindowFrame). */
  showChrome?: boolean;
}

function highlightCode(code: string): React.ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, lineIdx) => {
    const tokens: React.ReactNode[] = [];
    let currentPos = 0;

    const keywordRegex = /\b(const|let|var|await|async|import|from|export|function|return|if|else|true|false|null|undefined)\b/g;
    const stringRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    const commentRegex = /(\/\/.*$)/g;
    const numberRegex = /\b(\d+\.?\d*)\b/g;
    const functionRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;

    const allMatches: Array<{ start: number; end: number; type: string; text: string }> = [];

    let match;
    while ((match = commentRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: "comment", text: match[0] });
    }
    while ((match = stringRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: "string", text: match[0] });
    }
    while ((match = keywordRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: "keyword", text: match[0] });
    }
    while ((match = numberRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: "number", text: match[0] });
    }
    while ((match = functionRegex.exec(line)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[1].length, type: "function", text: match[1] });
    }

    allMatches.sort((a, b) => a.start - b.start);

    const filtered: typeof allMatches = [];
    let lastEnd = 0;
    for (const m of allMatches) {
      if (m.start >= lastEnd) {
        filtered.push(m);
        lastEnd = m.end;
      }
    }

    let pos = 0;
    filtered.forEach((m, idx) => {
      if (m.start > pos) {
        tokens.push(
          <span key={`plain-${lineIdx}-${idx}`} className="text-white/80">
            {line.substring(pos, m.start)}
          </span>
        );
      }

      const colorMap: Record<string, string> = {
        keyword: "text-[#FF7AB2]",
        string: "text-[#FC6A5D]",
        comment: "text-[#6C7986]",
        number: "text-[#D0BF69]",
        function: "text-[#67B7A4]",
      };

      tokens.push(
        <span key={`token-${lineIdx}-${idx}`} className={colorMap[m.type] || "text-white/80"}>
          {m.text}
        </span>
      );

      pos = m.end;
    });

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
        {lineIdx < lines.length - 1 && "\n"}
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
  typingSequencePhase,
  onTypingSequenceComplete,
  showChrome = true,
}: CodeBlockProps) {
  const sequential = typingDemo && typingSequencePhase !== undefined;
  const [displayedCode, setDisplayedCode] = useState(() => {
    if (!typingDemo) return code;
    if (typingSequencePhase === "done") return code;
    return "";
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(() => {
    if (!typingDemo) return true;
    return typingSequencePhase === "done";
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const typingRafRef = useRef(0);
  const sequenceCompleteRef = useRef<(() => void) | undefined>(onTypingSequenceComplete);
  sequenceCompleteRef.current = onTypingSequenceComplete;

  const fullHighlighted = useMemo(() => highlightCode(code), [code]);
  const displayedHighlighted = useMemo(() => highlightCode(displayedCode), [displayedCode]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2, rootMargin: "0px" }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Sync sequential phases (no rAF).
  useEffect(() => {
    if (!typingDemo || !sequential || !typingSequencePhase) return;
    if (typingSequencePhase === "done") {
      setDisplayedCode(code);
      setIsTypingComplete(true);
    } else if (typingSequencePhase === "queued") {
      setDisplayedCode("");
      setIsTypingComplete(false);
    }
  }, [typingDemo, sequential, typingSequencePhase, code]);

  // Typing animation: sequential "typing" phase OR legacy in-view typingDemo.
  useEffect(() => {
    if (!typingDemo) return;

    if (sequential) {
      if (typingSequencePhase !== "typing") {
        cancelAnimationFrame(typingRafRef.current);
        return;
      }
    } else {
      if (!isVisible) {
        cancelAnimationFrame(typingRafRef.current);
        setDisplayedCode("");
        setIsTypingComplete(false);
        return;
      }
    }

    setDisplayedCode("");
    setIsTypingComplete(false);

    const delayMs = 300 + (sequential ? 0 : typingStartDelayMs);
    const typingStartWall = performance.now() + delayMs;

    const tick = (now: number) => {
      if (now < typingStartWall) {
        typingRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - typingStartWall;
      const nextLen = Math.min(code.length, Math.floor(elapsed / TYPING_MS_PER_CHAR));
      setDisplayedCode((prev) => {
        if (prev.length === nextLen) return prev;
        return code.slice(0, nextLen);
      });
      if (nextLen >= code.length) {
        setIsTypingComplete(true);
        sequenceCompleteRef.current?.();
        return;
      }
      typingRafRef.current = requestAnimationFrame(tick);
    };

    typingRafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(typingRafRef.current);
  }, [typingDemo, sequential, typingSequencePhase, code, isVisible, typingStartDelayMs]);

  const preShellClass =
    "relative overflow-y-auto p-4 font-mono text-[13px] leading-relaxed md:p-6";
  const preShellStyle = {
    minHeight: showChrome ? "180px" : "100px",
    maxHeight: showChrome ? "300px" : "220px",
  } as const;

  const showGhostStack =
    typingDemo &&
    (sequential
      ? typingSequencePhase === "queued" || (typingSequencePhase === "typing" && !isTypingComplete)
      : !isTypingComplete);

  const caret =
    typingDemo &&
    (sequential ? typingSequencePhase === "typing" : true) &&
    !isTypingComplete && (
      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-white/80 align-middle" />
    );

  const preInner = showGhostStack ? (
    <pre className={preShellClass} style={preShellStyle}>
      <div className="grid min-h-0 grid-cols-1 font-mono text-[13px] leading-relaxed">
        <div
          className="invisible col-start-1 row-start-1 min-w-0 select-none [pointer-events:none]"
          aria-hidden="true"
        >
          {fullHighlighted}
        </div>
        <div className="col-start-1 row-start-1 min-w-0 self-start">
          <code>
            {displayedHighlighted}
            {caret}
          </code>
        </div>
      </div>
    </pre>
  ) : (
    <pre className={preShellClass} style={preShellStyle}>
      <code>
        {displayedHighlighted}
        {caret}
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
