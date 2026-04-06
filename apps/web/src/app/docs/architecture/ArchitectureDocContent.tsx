"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeBlock, CodeWindowFrame } from "../../components";
import { MermaidBlock } from "./MermaidBlock";

const SCROLL_SPY_OFFSET = 130;
/** Match aside `duration-300` + slack so scroll height can settle after margin eases. */
const ARCH_DOCS_SIDEBAR_TRANSITION_MS = 300;
const ARCH_DOCS_SCROLL_PIN_EXTRA_MS = 90;

type NavNode = {
  key: string;
  label: string;
  id?: string;
  children?: NavNode[];
};

/** Cursor/VS Code–style tree: folders fold open, leaves link to #anchors. */
const DOC_NAV: NavNode[] = [
  { key: "overview", label: "Overview", id: "overview" },
  {
    key: "repository",
    label: "Repository",
    children: [{ key: "repo-layout", label: "Repository layout", id: "repo-layout" }],
  },
  {
    key: "on-chain",
    label: "On-chain",
    children: [
      { key: "core-contracts", label: "On-chain core", id: "core-contracts" },
      { key: "swap-flow", label: "Swap path", id: "swap-flow" },
      { key: "liquidity-flow", label: "Liquidity path", id: "liquidity-flow" },
      { key: "quotes-oracles", label: "Quotes & data bridges", id: "quotes-oracles" },
      { key: "flash-mev", label: "Flash accounting & MEV", id: "flash-mev" },
    ],
  },
  {
    key: "web",
    label: "apps/web",
    children: [{ key: "web-app", label: "Web application", id: "web-app" }],
  },
  {
    key: "operations",
    label: "Operations",
    children: [
      { key: "deploy-dev", label: "Deploy & local dev", id: "deploy-dev" },
      { key: "internal-notes", label: "Internal notes", id: "internal-notes" },
    ],
  },
];

function collectSectionIds(nodes: NavNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.id) out.push(n.id);
    if (n.children) out.push(...collectSectionIds(n.children));
  }
  return out;
}

const SECTION_IDS = collectSectionIds(DOC_NAV);

function findParentFolderKeys(nodes: NavNode[], targetId: string, parents: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.id === targetId) return parents;
    if (n.children) {
      const hit = findParentFolderKeys(n.children, targetId, [...parents, n.key]);
      if (hit) return hit;
    }
  }
  return null;
}

function subtreeContainsId(node: NavNode, targetId: string): boolean {
  if (node.id === targetId) return true;
  if (!node.children) return false;
  return node.children.some((c) => subtreeContainsId(c, targetId));
}

function folderKeysDeep(nodes: NavNode[]): string[] {
  const k: string[] = [];
  for (const n of nodes) {
    if (n.children?.length) {
      k.push(n.key, ...folderKeysDeep(n.children));
    }
  }
  return k;
}

/** Match landing architecture: section titles centered, generous vertical rhythm. */
const SECTION_HEAD = "mb-8 text-center";
const H2 = "text-3xl font-semibold text-white md:text-4xl";
const LEAD = "mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/50";

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wider text-white/50 md:text-base">
      {children}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-white/75 md:text-lg md:leading-relaxed">{children}</div>
  );
}

function CodeInline({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-sm text-white/95 md:text-base">{children}</code>
  );
}

function Expandable({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.07] md:px-6 md:py-5"
        aria-expanded={open}
      >
        <span>
          <span className="block text-base font-medium text-white md:text-lg">{title}</span>
          <span className="mt-1.5 block text-sm text-white/55 md:text-base">{summary}</span>
        </span>
        <span className="mt-1 shrink-0 text-lg text-white/40 tabular-nums" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-5 py-4 text-base text-white/80 md:px-6 md:py-5 md:text-lg">
          {children}
        </div>
      ) : null}
    </div>
  );
}

const poolIdSnippet = `// Canonical pool id (matches PoolIDAssembly.sol)
const poolId = uint256(
  keccak256(abi.encodePacked(a0, a1, quoter, markings))
);`;

function RepoLegendCard() {
  const items: { color: string; border: string; title: string; body: string }[] = [
    {
      color: "rgba(67, 56, 202, 0.35)",
      border: "rgba(165, 180, 252, 0.5)",
      title: "contracts/",
      body: "All Solidity: Core (pool, LP, router), Peripheral (quoters, bridges, adapters), test doubles.",
    },
    {
      color: "rgba(15, 118, 110, 0.35)",
      border: "rgba(45, 212, 191, 0.5)",
      title: "apps/web/",
      body: "Next.js 16 app router — swap UI, providers, architecture docs, static assets.",
    },
    {
      color: "rgba(180, 83, 9, 0.35)",
      border: "rgba(252, 211, 77, 0.45)",
      title: "scripts/",
      body: "Deploy Stoix pool, restart Hardhat, deploy-to-target addresses, Ignition if used.",
    },
    {
      color: "rgba(124, 58, 237, 0.3)",
      border: "rgba(196, 181, 253, 0.45)",
      title: "test/",
      body: "Hardhat tests at repo root — quoters, forks, peripheral coverage (not under apps/web).",
    },
  ];
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-5 py-6 backdrop-blur-xl md:px-7 md:py-8">
      <p className="text-base font-medium text-white md:text-lg">What each top-level folder is for</p>
      <p className="mt-2 text-sm text-white/60 md:text-base">
        Colors align with the diagram above. Use this table when you jump back into the repo after time away.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.title}
            className="rounded-2xl border px-4 py-4 md:px-5 md:py-5"
            style={{ backgroundColor: item.color, borderColor: item.border }}
          >
            <p className="font-mono text-base font-semibold text-white md:text-lg">{item.title}</p>
            <p className="mt-2 text-sm leading-snug text-white/85 md:text-base md:leading-relaxed">{item.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-white/55 md:text-base">
        <strong className="text-white/80">Workspace tooling:</strong> <CodeInline>package.json</CodeInline> at root runs
        Hardhat; <CodeInline>apps/web/package.json</CodeInline> runs <CodeInline>next dev --webpack</CodeInline>. pnpm/npm
        workspaces may hoist <CodeInline>node_modules</CodeInline> to the monorepo root.
      </p>
    </div>
  );
}

function ContentCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl md:p-6 ${className}`}>
      {children}
    </div>
  );
}

/** Heroicons 20 solid–style chevrons (same geometry as tailwindlabs/heroicons). */
function NavChevronRight({ className = "h-4 w-4 shrink-0 text-white/45" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** `w-3.5` (0.875rem) × 1.2 — icon + column share this size; trunk offsets by half width. */
const DOC_NAV_CHEVRON_SIZE = "h-[1.05rem] w-[1.05rem]";
const DOC_NAV_CHEVRON_COL = "flex h-[1.05rem] w-[1.05rem] shrink-0 items-center justify-center";
/** Pull nested trunk up (tightens space under folder chevron; ~2× previous pull → gap ~½). */
const DOC_TREE_UL_PULLUP = "-mt-[5.6px]";
/** Rail center under chevron tip: half of `1.05rem`, minus half of 1px rail. */
const DOC_TREE_UL_INDENT = "ml-[calc(0.525rem-0.5px)]";
const DOC_TREE_RAIL_X = "left-0";
/** Depth-0 folder rail: same x as `DOC_TREE_UL_INDENT` so the trunk lines up under the chevron into nested rows. */
const DOC_TREE_RAIL_LEFT_ROOT = "left-[calc(0.525rem-0.5px)]";
/** Lit trunk / stub / dot: softer white so 1px rails don’t read as heavy as title text. */
const DOC_TREE_RAIL_LIT = "w-px min-w-px shrink-0 bg-white/40";
/** 1px rail width without color — use `DOC_TREE_CONNECTOR_STROKE_RGB` in `style`. */
const DOC_TREE_RAIL_ACTIVE_W = "w-px min-w-px shrink-0";
const DOC_TREE_STROKE_RGB = "rgba(255,255,255,0.4)";
/** Active-path connector lines (folder trunk, nested rails, L-curve). Kept dim vs subtitle `bg-white` dot. */
const DOC_TREE_CONNECTOR_STROKE_RGB = "rgba(255,255,255,0.28)";
/** `pl-4` (1rem) + 40% → 1.4rem; stub / negative margin use the same inset. */
const DOC_TREE_LEAF_PAD = "pl-[1.4rem]";
const DOC_TREE_LEAF_SPACER = "-ml-[1.4rem] inline-block w-[1.4rem] shrink-0";

/**
 * Match desktop top-bar nav links in `Header.tsx` (`text-white/80`, `hover:text-white`, active `#fff` via `text-white`) —
 * same inactive tone for section titles and subtitles (`visited` stays dim so links don’t read brighter than folders).
 */
const DOC_NAV_ITEM_BASE =
  "flex w-full min-w-0 cursor-pointer items-center gap-2 py-[4.4px] text-left text-[0.825rem] font-normal leading-snug text-white/80 no-underline outline-none transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-0 active:outline-none visited:text-white/80 [&_svg]:text-current";
const DOC_NAV_ITEM_ACTIVE =
  "flex w-full min-w-0 cursor-pointer items-center gap-2 py-[4.4px] text-left text-[0.825rem] font-semibold leading-snug text-white no-underline outline-none transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-0 active:outline-none visited:text-white [&_svg]:text-current";

/** Active-dot diameter (px). */
const DOC_TREE_ACTIVE_DOT_PX = 3.5;
/** Rounded elbow radius (px) for the active connector. */
const DOC_TREE_ACTIVE_CORNER_RADIUS_PX = 4.5;
/** Lift horizontal stub slightly so it optically matches the elbow border pixel row. */
const DOC_TREE_ACTIVE_STUB_Y_ADJUST_PX = 1;
/** Stub endpoint (px from left in the active-curve box). */
const DOC_TREE_ACTIVE_STUB_END_PX = 14;
const DOC_TREE_ACTIVE_DOT_GAP_PX = 3;
/** Folder trunk: from bottom of centered chevron (`1.05rem` tall) into nested list — no junction dot. */
const DOC_TREE_FOLDER_TRUNK_TOP = "calc(50% + 0.525rem)";
const DOC_TREE_ACTIVE_DOT_CENTER_PX =
  DOC_TREE_ACTIVE_STUB_END_PX + DOC_TREE_ACTIVE_DOT_GAP_PX + DOC_TREE_ACTIVE_DOT_PX / 2;

/**
 * Pure CSS 1px geometry (vertical + rounded elbow + horizontal) keeps visual thickness consistent at the turn.
 * Mixing stretched SVG curves + separate strokes caused anti-aliasing weight shifts around the elbow.
 */
function ActiveSubtitleTreeCurve() {
  const vStemH = `calc(50% - ${DOC_TREE_ACTIVE_CORNER_RADIUS_PX}px)`;
  const hStubW = DOC_TREE_ACTIVE_STUB_END_PX - DOC_TREE_ACTIVE_CORNER_RADIUS_PX;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 h-full w-[3.75rem] overflow-visible"
      aria-hidden
    >
      <span
        className="absolute left-0 top-0 w-px min-w-px shrink-0"
        style={{ height: vStemH, backgroundColor: DOC_TREE_CONNECTOR_STROKE_RGB }}
      />
      <span
        className="absolute left-0 box-border border-b border-l"
        style={{
          top: vStemH,
          width: DOC_TREE_ACTIVE_CORNER_RADIUS_PX,
          height: DOC_TREE_ACTIVE_CORNER_RADIUS_PX,
          borderColor: DOC_TREE_CONNECTOR_STROKE_RGB,
          borderBottomLeftRadius: DOC_TREE_ACTIVE_CORNER_RADIUS_PX,
        }}
      />
      <span
        className="absolute h-px min-h-px max-h-px"
        style={{
          top: `calc(50% - ${DOC_TREE_ACTIVE_STUB_Y_ADJUST_PX}px)`,
          left: DOC_TREE_ACTIVE_CORNER_RADIUS_PX,
          width: hStubW,
          backgroundColor: DOC_TREE_CONNECTOR_STROKE_RGB,
        }}
      />
      <span
        className="absolute top-[calc(50%-0.5px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{
          left: DOC_TREE_ACTIVE_DOT_CENTER_PX,
          width: DOC_TREE_ACTIVE_DOT_PX,
          height: DOC_TREE_ACTIVE_DOT_PX,
        }}
      />
    </div>
  );
}

/**
 * Docs sidebar: vertical rails render only on the active path (ancestor folders + prefix rows + active leaf above the tee).
 * No dim/suffix verticals. Active subtitle uses one curved SVG path (bend + stub + dot) instead of a sharp tee.
 */
function IdeExplorerNav({
  activeId,
  expanded,
  toggleFolder,
  onNavigate,
}: {
  activeId: string;
  expanded: Set<string>;
  toggleFolder: (key: string) => void;
  onNavigate?: () => void;
}) {
  const renderNodes = (nodes: NavNode[], depth: number): React.ReactNode => {
    const pathIndex = nodes.findIndex((n) => subtreeContainsId(n, activeId));

    const rowGap = depth > 0 ? "gap-0" : "gap-[4.4px]";

    return (
      <ul
        className={`flex list-none flex-col ${rowGap} ${
          depth > 0 ? `mt-0 ${DOC_TREE_UL_PULLUP} ${DOC_TREE_UL_INDENT}` : ""
        }`}
      >
        {nodes.map((node, i) => {
          const hasChildren = !!node.children?.length;
          const isOpen = expanded.has(node.key);
          const isActiveLeaf = node.id === activeId;
          const folderOnActivePath = hasChildren && subtreeContainsId(node, activeId);
          const showTreeRail = depth > 0;
          const hasActiveInList = pathIndex >= 0;
          const isPrefixRow = hasActiveInList && i < pathIndex;
          const isPathRow = hasActiveInList && i === pathIndex;
          const isLast = i === nodes.length - 1;

          if (hasChildren) {
            const folderRailLeft = depth === 0 ? DOC_TREE_RAIL_LEFT_ROOT : DOC_TREE_RAIL_X;
            const folderRow = (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleFolder(node.key)}
                className={folderOnActivePath ? DOC_NAV_ITEM_ACTIVE : DOC_NAV_ITEM_BASE}
              >
                <span className={DOC_NAV_CHEVRON_COL}>
                  <NavChevronRight
                    className={`${DOC_NAV_CHEVRON_SIZE} transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
                      isOpen ? "rotate-90" : "rotate-0"
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">{node.label}</span>
              </button>
            );

            return (
              <li key={node.key} className={`min-w-0 ${showTreeRail ? DOC_TREE_LEAF_PAD : ""}`}>
                <div className="relative w-full min-w-0">
                  {folderOnActivePath && isOpen ? (
                    <span
                      className={`pointer-events-none absolute ${folderRailLeft} bottom-0 ${DOC_TREE_RAIL_ACTIVE_W} transition-colors`}
                      style={{
                        top: DOC_TREE_FOLDER_TRUNK_TOP,
                        backgroundColor: DOC_TREE_CONNECTOR_STROKE_RGB,
                      }}
                      aria-hidden
                    />
                  ) : null}
                  <div className="relative z-[1]">{folderRow}</div>
                </div>
                <div
                  className={`grid motion-reduce:transition-none transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">{renderNodes(node.children!, depth + 1)}</div>
                </div>
              </li>
            );
          }

          return (
            <li key={node.key} className={`relative min-w-0 ${showTreeRail ? DOC_TREE_LEAF_PAD : ""}`}>
              {showTreeRail ? (
                isPathRow ? (
                  <ActiveSubtitleTreeCurve />
                ) : !isPathRow && isLast && isPrefixRow ? (
                  <span
                    className={`pointer-events-none absolute ${DOC_TREE_RAIL_X} top-0 bottom-1/2 ${DOC_TREE_RAIL_ACTIVE_W} transition-colors`}
                    style={{ backgroundColor: DOC_TREE_CONNECTOR_STROKE_RGB }}
                    aria-hidden
                  />
                ) : !isPathRow && !isLast && isPrefixRow ? (
                  <span
                    className={`pointer-events-none absolute ${DOC_TREE_RAIL_X} top-0 bottom-0 ${DOC_TREE_RAIL_ACTIVE_W} transition-colors`}
                    style={{ backgroundColor: DOC_TREE_CONNECTOR_STROKE_RGB }}
                    aria-hidden
                  />
                ) : null
              ) : null}
              <a
                href={`#${node.id}`}
                onClick={onNavigate}
                aria-current={isActiveLeaf ? "location" : undefined}
                className={`${isActiveLeaf ? DOC_NAV_ITEM_ACTIVE : DOC_NAV_ITEM_BASE} ${
                  isActiveLeaf ? "!text-white" : ""
                } ${showTreeRail ? "gap-1.5" : ""}`}
              >
                {depth === 0 ? (
                  <span className={DOC_NAV_CHEVRON_COL} aria-hidden />
                ) : isActiveLeaf ? (
                  <span className={DOC_TREE_LEAF_SPACER} aria-hidden />
                ) : (
                  <span className={DOC_TREE_LEAF_SPACER} aria-hidden />
                )}
                <span className="min-w-0 flex-1">{node.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <nav
      className="select-none text-white/80 origin-top scale-95 [-webkit-font-smoothing:antialiased]"
      aria-label="Documentation structure"
    >
      {renderNodes(DOC_NAV, 0)}
    </nav>
  );
}

function DocSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-28 md:scroll-mt-32 ${SECTION_HEAD}`}>
      <h2 className={H2}>{title}</h2>
      {subtitle ? <p className={LEAD}>{subtitle}</p> : null}
      <div className="mt-10 space-y-8">{children}</div>
    </section>
  );
}

export function ArchitectureDocContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** Desktop: while `md:ml-*` animates, pin `scrollY` each frame so easing doesn’t yank the viewport. */
  const scrollPinYRef = useRef<number | null>(null);
  const scrollPinRafRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folderKeysDeep(DOC_NAV)));
  const [activeId, setActiveId] = useState<string>(SECTION_IDS[0] ?? "overview");

  const toggleFolder = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    const parents = findParentFolderKeys(DOC_NAV, activeId);
    if (parents?.length) {
      setExpanded((prev) => new Set([...prev, ...parents]));
    }
  }, [activeId]);

  const onScrollSpy = useCallback(() => {
    const positions = SECTION_IDS.map((id) => {
      const el = document.getElementById(id);
      if (!el) return { id, top: Infinity };
      const rect = el.getBoundingClientRect();
      return { id, top: Math.abs(rect.top - SCROLL_SPY_OFFSET) };
    });
    positions.sort((a, b) => a.top - b.top);
    const best = positions[0];
    setActiveId(best.top === Infinity ? SECTION_IDS[0] ?? "overview" : best.id);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScrollSpy, { passive: true });
    onScrollSpy();
    return () => window.removeEventListener("scroll", onScrollSpy);
  }, [onScrollSpy]);

  const stopScrollPin = useCallback(() => {
    if (scrollPinRafRef.current != null) {
      cancelAnimationFrame(scrollPinRafRef.current);
      scrollPinRafRef.current = null;
    }
    scrollPinYRef.current = null;
  }, []);

  const startScrollPin = useCallback(
    (y: number) => {
      stopScrollPin();
      scrollPinYRef.current = y;
      const t0 = performance.now();
      const until = t0 + ARCH_DOCS_SIDEBAR_TRANSITION_MS + ARCH_DOCS_SCROLL_PIN_EXTRA_MS;
      const tick = () => {
        const target = scrollPinYRef.current;
        if (target == null) return;
        window.scrollTo({ top: target, left: 0, behavior: "auto" });
        if (performance.now() < until) {
          scrollPinRafRef.current = requestAnimationFrame(tick);
        } else {
          scrollPinRafRef.current = null;
          scrollPinYRef.current = null;
        }
      };
      scrollPinRafRef.current = requestAnimationFrame(tick);
    },
    [stopScrollPin]
  );

  useEffect(() => () => stopScrollPin(), [stopScrollPin]);

  const toggleDocsSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      startScrollPin(window.scrollY);
    }
    setSidebarOpen((o) => !o);
  }, [startScrollPin]);

  const repoDiagram = useMemo(
    () =>
      `flowchart TB
    subgraph WS["Monorepo root · dex"]
      contracts["contracts/<br/>Solidity"]:::sol
      apps["apps/web<br/>Next.js 16"]:::web
      scripts["scripts/<br/>deploy & tooling"]:::scr
      test["test/<br/>Hardhat tests"]:::tst
      hh["hardhat.config.js"]:::cfg
    end
    core["Core<br/>PoolManager · LM · QuoteRouter · ERC6909"]:::coreN
    peri["Periphery<br/>Quoters · DataBridges · Adapters"]:::periN
    swapui["Product UI<br/>swap · liquidity · wagmi/viem"]:::web
    deployL["Deploy scripts<br/>StoixTestPool · target addrs"]:::scr

    contracts --> core
    contracts --> peri
    apps --> swapui
    scripts --> deployL
    test -.-> contracts

    classDef sol fill:#4338ca,stroke:#a5b4fc,stroke-width:2.5px,color:#eef2ff
    classDef web fill:#0f766e,stroke:#2dd4bf,stroke-width:2.5px,color:#ecfdf5
    classDef scr fill:#b45309,stroke:#fcd34d,stroke-width:2.5px,color:#fffbeb
    classDef tst fill:#7c3aed,stroke:#c4b5fd,stroke-width:2.5px,color:#f5f3ff
    classDef cfg fill:#475569,stroke:#94a3b8,stroke-width:2px,color:#f1f5f9
    classDef coreN fill:#1e3a8a,stroke:#38bdf8,stroke-width:2.5px,color:#e0f2fe
    classDef periN fill:#831843,stroke:#fb7185,stroke-width:2.5px,color:#ffe4e6`,
    []
  );

  const coreDiagram = useMemo(
    () =>
      `flowchart TB
    subgraph inherit["Contract relationships"]
      QR["QuoteRouter<br/>(abstract · getQuote · bridges)"]:::qr
      PM["PoolManager<br/>swaps · inventory · ERC6909 · flash"]:::pm
      LM["LiquidityManager<br/>add/remove liquidity"]:::lm
    end
    PM -.->|extends| QR
    LM -->|"only msg.sender LM<br/>executeLiquidity*"| PM

    classDef qr fill:#4c1d95,stroke:#c4b5fd,stroke-width:2.5px,color:#f5f3ff
    classDef pm fill:#1e3a8a,stroke:#38bdf8,stroke-width:2.5px,color:#e0f2fe
    classDef lm fill:#14532d,stroke:#4ade80,stroke-width:2.5px,color:#dcfce7`,
    []
  );

  const swapDiagram = useMemo(
    () =>
      `sequenceDiagram
    autonumber
    participant U as Trader
    participant PM as PoolManager
    participant QR as QuoteRouter
    participant B as DataBridge(s)
    participant Q as Quoter
    U->>PM: swap(...) / batchSwap
    PM->>QR: getQuote(SwapParams, inventory)
    QR->>B: getData (optional, tstore cache)
    QR->>Q: quote(params, dx payload)
    Q-->>QR: amountOut
    QR-->>PM: quote + poolId
    PM->>PM: validate inventory · packed Δ inventory
    PM->>PM: FlashAccounting · settle ERC20/ETH`,
    []
  );

  const liquidityDiagram = useMemo(
    () =>
      `sequenceDiagram
    autonumber
    participant LP as LP / user
    participant LM as LiquidityManager
    participant PM as PoolManager
    LP->>LM: addLiquidity / removeLiquidity
    LM->>LM: poolID · amounts · share math
    LM->>PM: executeLiquidityAdd / Remove
    PM->>PM: mint/burn ERC6909 · inventory
    PM->>PM: FlashAccounting deltas
    PM->>LP: settle (if no flash session)`,
    []
  );

  return (
    <div className="relative z-10 min-h-screen w-full pt-[60.72px] md:pt-[48.4px]">
      {/* Mobile: dim content when explorer open */}
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[44] bg-black/55 md:hidden"
          aria-label="Close documentation menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Fixed toggle — closed: glass + outline; open: outline mainly on hover. Chevron follows menu state. */}
      <button
        type="button"
        className={`fixed z-[52] flex h-9 w-9 items-center justify-center rounded-full text-white/95 backdrop-blur-xl backdrop-saturate-200 motion-reduce:transform-none motion-reduce:transition-none transition-[transform,background-color,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)] hover:scale-[1.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.97] motion-reduce:hover:scale-100 top-[calc(60.72px+8px)] md:top-[calc(48.4px+8px)] left-[10px] md:left-[13.2px] motion-reduce:active:scale-100 ${
          sidebarOpen
            ? "border border-transparent bg-black/55 shadow-[0_2px_20px_rgba(0,0,0,0.45)] hover:border-white/28 hover:bg-white/[0.09] hover:shadow-[0_10px_44px_rgba(0,0,0,0.5)] focus-visible:border-white/30 motion-reduce:hover:shadow-[0_2px_20px_rgba(0,0,0,0.45)]"
            : "border border-white/[0.22] bg-white/[0.12] shadow-[0_4px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.14)] hover:border-white/32 hover:bg-white/[0.16] hover:shadow-[0_10px_40px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.2)] focus-visible:border-white/35 motion-reduce:hover:shadow-[0_4px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.14)]"
        }`}
        aria-expanded={sidebarOpen}
        aria-controls="arch-docs-sidebar"
        aria-label={sidebarOpen ? "Hide documentation menu" : "Open documentation menu"}
        onClick={toggleDocsSidebar}
      >
        <svg
          className={`h-[1.3rem] w-[1.3rem] shrink-0 motion-reduce:transition-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            sidebarOpen ? "rotate-180" : "rotate-0"
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <aside
        id="arch-docs-sidebar"
        className={`fixed top-0 left-0 z-[45] flex h-dvh w-[300px] min-h-0 flex-col border-r border-white/10 bg-black pt-[60.72px] shadow-none motion-reduce:transition-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:pt-[48.4px] ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Title centered on full aside width (300px); fixed toggle sits over the left gutter. */}
        <div className="flex min-h-[52px] shrink-0 items-center justify-center border-b border-white/10 px-3 py-3.5 md:px-[13.2px]">
          <span className="min-w-0 max-w-full truncate text-center text-[0.825rem] font-medium leading-snug tracking-wide text-white/60">
            Architecture / docs
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[10px] py-3 md:px-[13.2px]">
          <IdeExplorerNav
            activeId={activeId}
            expanded={expanded}
            toggleFolder={toggleFolder}
            onNavigate={() => {
              if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                setSidebarOpen(false);
              }
            }}
          />
        </div>
      </aside>

      <div
        className={`[overflow-anchor:none] pb-28 pt-12 motion-reduce:md:transition-none md:transition-[margin-left] md:duration-300 md:ease-[cubic-bezier(0.32,0.72,0,1)] md:px-6 md:pt-16 ${
          sidebarOpen ? "md:ml-[300px]" : "md:ml-0"
        } px-4`}
      >
        <div className="mx-auto max-w-6xl">
          <main className="min-w-0 space-y-20 md:space-y-24 lg:space-y-28">
            {/* Overview — landing-style hero */}
            <header id="overview" className="scroll-mt-28 text-center md:scroll-mt-32">
              <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
                <span className="rounded-full border border-amber-500/45 bg-amber-500/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-100 md:text-sm">
                  Internal
                </span>
                <p className="text-sm text-white/55 md:text-base">Operator reference — restrict later if needed.</p>
              </div>
              <h1 className="text-5xl font-semibold tracking-tight text-white md:text-6xl">
                Architecture &amp; codebase map
              </h1>
              <p className="mx-auto mt-6 max-w-4xl text-xl leading-relaxed text-white/60 md:text-2xl">
                How Stoix fits together: on-chain core, periphery, web app, and scripts — same tone and spacing as the
                marketing architecture section.
              </p>
              <div className="mx-auto mt-10 max-w-3xl text-left">
                <Prose>
                  <p>
                    Stoix is a <strong className="text-white/95">liquidity coordination</strong> stack: pools hold two
                    assets in packed inventories, LPs receive <CodeInline>ERC6909</CodeInline> shares per pool id, and
                    executable prices come from <strong className="text-white/95">pluggable quoters</strong> fed by
                    optional <strong className="text-white/95">data bridges</strong> (oracles, UniV2/V3 reads, TWAPs).
                    Settlement uses EIP-1153 <CodeInline>FlashAccounting</CodeInline> so single swaps, batch routes, and
                    flash sessions share one consistent delta ledger.
                  </p>
                </Prose>
                <div className="mt-8 space-y-3">
                  <Expandable title="Mental model" summary="Pool id, inventory packing, and where trust sits." defaultOpen>
                    <ul className="list-inside list-disc space-y-3 marker:text-sky-400/80">
                      <li>
                        <CodeInline>poolID = keccak256(sort(a,b), quoter, markings)</CodeInline> — canonical pair order; UI
                        env vars must match the same pool key.
                      </li>
                      <li>
                        Inventory is two <CodeInline>uint128</CodeInline> balances in one storage word per pool (gas-optimized
                        reads in the swap hot path).
                      </li>
                      <li>
                        The quoter is in the trust zone for <CodeInline>amountOut</CodeInline>; bridges are advisory; users
                        still need <CodeInline>minAmountOut</CodeInline> and sane pool configs.
                      </li>
                    </ul>
                  </Expandable>
                </div>
              </div>
            </header>

            <DocSection
              id="repo-layout"
              title="Repository layout"
              subtitle="Monorepo folders, Hardhat at root, Next app under apps/web."
            >
              <Prose>
                <p>
                  The Solidity project lives at the <strong className="text-white/90">repo root</strong> (Hardhat). The
                  customer-facing app is <CodeInline>apps/web</CodeInline>. Integration tests live in root{" "}
                  <CodeInline>test/</CodeInline>, not inside the Next app.
                </p>
              </Prose>
              <div className="mt-8">
                <CodeWindowFrame title="Pool id" label="TYPESCRIPT" contentClassName="!p-0">
                  <CodeBlock code={poolIdSnippet} language="typescript" showChrome={false} />
                </CodeWindowFrame>
              </div>
              <ContentCard className="mt-8 overflow-hidden !p-0">
                <MermaidBlock id="repo" chart={repoDiagram} />
              </ContentCard>
              <RepoLegendCard />
              <div className="mt-6 space-y-4">
                <Expandable title="Paths worth memorizing" summary="Where to edit when something breaks." defaultOpen>
                  <ul className="list-inside list-disc space-y-3 marker:text-emerald-400/70">
                    <li>
                      <CodeInline>contracts/Core/</CodeInline> — PoolManager, LiquidityManager entrypoints, QuoteRouter
                      mixin, ERC6909, PoolManagerLib, flash + MEV libs, transient helpers.
                    </li>
                    <li>
                      <CodeInline>contracts/Peripheral/</CodeInline> — Real/dummy data bridges,{" "}
                      <CodeInline>StoixQuoter</CodeInline>, alias registries, adapter stack for external protocols.
                    </li>
                    <li>
                      <CodeInline>apps/web/src/app/swap/page.tsx</CodeInline> — main trading surface (quotes, approvals,
                      chart overlay, mobile layout) — large file by design.
                    </li>
                    <li>
                      <CodeInline>scripts/deployStoixTestPool.js</CodeInline> — seeds local PoolManager / tokens / quoter
                      for <CodeInline>npx hardhat node</CodeInline>.
                    </li>
                  </ul>
                </Expandable>
              </div>
            </DocSection>

            <DocSection id="core-contracts" title="On-chain core" subtitle="PoolManager, LiquidityManager, and QuoteRouter.">
              <ContentCard className="overflow-hidden !p-0">
                <MermaidBlock id="core" chart={coreDiagram} />
              </ContentCard>
              <Prose>
                <p>
                  <strong className="text-white/95">PoolManager</strong> is the singleton users and routers hit: swaps,
                  batch swaps, flash sessions, commit-reveal execution, and governance/config for bridge slots. It inherits{" "}
                  <CodeInline>QuoteRouter</CodeInline> so <CodeInline>getQuote</CodeInline> shares the same storage-backed
                  bridge/data wiring.
                </p>
                <p>
                  <strong className="text-white/95">LiquidityManager</strong> outsources add/remove math and bytecode size;
                  only it may call <CodeInline>executeLiquidityAdd</CodeInline> /{" "}
                  <CodeInline>executeLiquidityRemove</CodeInline> on the pool manager.
                </p>
              </Prose>
              <div className="mt-6 space-y-4">
                <Expandable title="PoolManager internals" summary="Reentrancy, libraries, and fee hooks.">
                  <ul className="list-inside list-disc space-y-3">
                    <li>
                      Transient reentrancy guards and flash session keys avoid traditional storage mutex costs on hot
                      paths.
                    </li>
                    <li>
                      <CodeInline>PoolManagerLib</CodeInline> centralizes hop execution, inventory updates, and settlement
                      helpers; review there when changing batch semantics.
                    </li>
                    <li>
                      Protocol fee / profit baseline helpers exist in the library — confirm they are invoked in your
                      deployment branch before assuming fee revenue.
                    </li>
                  </ul>
                </Expandable>
                <Expandable title="Liquidity math" summary="First mint vs joins.">
                  <p>
                    Initial mint uses geometric mean with a small permanent liquidity lock (Uniswap-style dust). Subsequent
                    joins are proportional to packed inventory; a skewed pool can consult the quoter for an implied rate
                    when inventory ratio alone is ambiguous.
                  </p>
                </Expandable>
              </div>
            </DocSection>

            <DocSection id="swap-flow" title="Swap path" subtitle="Quotes, markings, and settlement.">
              <ContentCard className="overflow-hidden !p-0">
                <MermaidBlock id="swap-seq" chart={swapDiagram} />
              </ContentCard>
              <Prose>
                <p>
                  <CodeInline>bytes3 markings</CodeInline> select behaviour: protocol-only pools, pause flags, atomic
                  execution requirements, optional institutional access control paths. Multi-hop swaps use{" "}
                  <CodeInline>Hop[]</CodeInline>; when a hop carries multiple markings for one quoter, the router may
                  batch-quote to keep state consistent across sub-steps.
                </p>
              </Prose>
              <div className="mt-6 space-y-4">
                <Expandable title="Parameter assembly" summary="Canonical ordering and SwapParams.">
                  <p>
                    Every external call passes user-supplied asset addresses; pool id assembly sorts them before hashing so
                    mixed argument order still resolves to one pool.
                  </p>
                </Expandable>
                <Expandable title="Inventory checks" summary="Solvency before settlement.">
                  <p>
                    Output is validated against live pool balances before deltas are written; failures revert before tokens
                    move.
                  </p>
                </Expandable>
                <Expandable title="Settlement" summary="Deltas and ERC20/ETH paths.">
                  <p>
                    Negative delta → collect via <CodeInline>transferFrom</CodeInline> (or ETH{" "}
                    <CodeInline>msg.value</CodeInline>); positive → <CodeInline>transfer</CodeInline> out. Same pattern for
                    flash session reconciliation across many tokens.
                  </p>
                </Expandable>
              </div>
            </DocSection>

            <DocSection id="liquidity-flow" title="Liquidity path" subtitle="LP flows through LiquidityManager.">
              <ContentCard className="overflow-hidden !p-0">
                <MermaidBlock id="liquidity" chart={liquidityDiagram} />
              </ContentCard>
              <Prose>
                <p>
                  Adds march through the liquidity manager so LP-facing validation stays out of the swap-sized contract.
                  Removes burn ERC6909 from the beneficiary, shrink inventory, credit withdrawals as positive deltas, then
                  settle unless a session defers payment.
                </p>
              </Prose>
              <Expandable title="ERC6909 LP shares" summary="IDs, operators, allowances.">
                <p>
                  Pool id doubles as the ERC6909 token id. Integrators can use operators/allowances like nft-ish LP;{" "}
                  <CodeInline>ERC6909Claims</CodeInline> adds allowance-aware burns for chained workflows.
                </p>
              </Expandable>
            </DocSection>

            <DocSection
              id="quotes-oracles"
              title="Quotes & data bridges"
              subtitle="Bridges, packed dx, and StoixQuoter."
            >
              <SubTitle>Data flow</SubTitle>
              <Prose>
                <p>
                  Bridge addresses can be immutables + configurable slots set by governance. Transient caching on the
                  bridge contract address prevents duplicate external calls when multiple markings hit the same bridge in
                  one tx.
                </p>
                <p>
                  The consolidated bridge returns a packed <CodeInline>dx</CodeInline> structure (Q64.64 fields + masks).{" "}
                  <CodeInline>StoixQuoter</CodeInline> averages enabled components, rescales for token decimals, and returns
                  a single <CodeInline>uint256</CodeInline> output amount for the router.
                </p>
              </Prose>
              <Expandable title="Adapter layer" summary="Where Chainlink / RedStone / Uni attach.">
                <p>
                  Adapters live under <CodeInline>contracts/Peripheral/quoters/adapters/</CodeInline>; pairing them with{" "}
                  <CodeInline>TokenAliasRegistry</CodeInline> and real bridges lets staging mirror mainnet wiring while
                  dummy bridges keep CI deterministic.
                </p>
              </Expandable>
            </DocSection>

            <DocSection id="flash-mev" title="Flash accounting & MEV" subtitle="Sessions, deltas, and markings.">
              <Prose>
                <p>
                  Flash sessions set an active beneficiary, run arbitrary callback code, then enforce token deltas net-zero
                  per declared tokens — the Uniswap V4-style mental model, scoped to your PoolManager address.
                </p>
                <p>
                  Commit-reveal and atomic-access libraries sit beside the core; markings determine whether a pool
                  participates. Keep governance-controlled relay/trader lists in sync with product expectations when
                  enabling those bits.
                </p>
              </Prose>
            </DocSection>

            <DocSection id="web-app" title="Web application" subtitle="Next.js app, providers, and navigation.">
              <Prose>
                <p>
                  The web app uses the same Geist sans stack as the rest of the product; docs and marketing routes share
                  the header chrome. CSP in <CodeInline>next.config.ts</CodeInline> whitelists RPC + chart CDNs; adjust if you
                  add new third-party origins.
                </p>
                <p>
                  <CodeInline>providers.tsx</CodeInline> wires wagmi connectors; localhost uses a custom Hardhat chain
                  definition with id <CodeInline>31337</CodeInline> and JSON-RPC from env or LAN IP for mobile testing.
                </p>
              </Prose>
              <Expandable title="Navigation sources" summary="Marketing vs app chrome.">
                <p>
                  <CodeInline>data/navLinks.ts</CodeInline> defines mega-menu columns; app pages swap in condensed trading
                  links. This documentation route stays on the marketing header so you can reach it without connecting a
                  wallet.
                </p>
              </Expandable>
            </DocSection>

            <DocSection id="deploy-dev" title="Deploy & local dev" subtitle="Hardhat node and env wiring.">
              <Prose>
                <p>
                  Bring up <CodeInline>hardhat node</CodeInline> (optionally <CodeInline>--hostname 0.0.0.0</CodeInline>),
                  deploy via <CodeInline>deployStoixTestPool.js</CodeInline>, copy printed{" "}
                  <CodeInline>NEXT_PUBLIC_*</CodeInline> values into <CodeInline>apps/web/.env.local</CodeInline>, then run
                  the web dev server from <CodeInline>apps/web</CodeInline> with webpack flag parity to production
                  experiments.
                </p>
                <p>
                  <CodeInline>deployToTargetAddresses.js</CodeInline> and <CodeInline>restartAndDeploy.js</CodeInline>{" "}
                  automate node lifecycle when iterating on deterministic addresses.
                </p>
              </Prose>
            </DocSection>

            <DocSection id="internal-notes" title="Internal notes" subtitle="Risks and backlog reminders.">
              <Prose>
                <p
                  className="rounded-2xl border border-amber-500/35 px-4 py-3 text-amber-50 md:text-lg"
                  style={{ backgroundColor: "rgba(120, 53, 15, 0.25)" }}
                >
                  Engineering backlog / risk reminders — not a substitute for audit or threat modeling.
                </p>
                <ul className="list-inside list-disc space-y-3 marker:text-amber-400/80 md:mt-2">
                  <li>
                    Confirm protocol fee code paths are actually wired for your branch before relying on treasury revenue.
                  </li>
                  <li>
                    Investigate removing or hard-gating the batch hop quote fallback that substitutes a constant price when
                    quotes return zero.
                  </li>
                  <li>
                    ERC20 transfers assume standard semantics — rebasing / FoT assets need bespoke handling or blocking at
                    the pool level.
                  </li>
                  <li>
                    Before external launch, move internal env disclosure and this amber section behind auth or a separate
                    deployment.
                  </li>
                </ul>
              </Prose>
            </DocSection>
          </main>
        </div>
      </div>
    </div>
  );
}
