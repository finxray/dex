"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CodeBlock, CodeWindowFrame } from "../../components";
import { MermaidBlock } from "./MermaidBlock";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "repo-layout", label: "Repository layout" },
  { id: "core-contracts", label: "On-chain core" },
  { id: "swap-flow", label: "Swap path" },
  { id: "liquidity-flow", label: "Liquidity path" },
  { id: "quotes-oracles", label: "Quotes & data bridges" },
  { id: "flash-mev", label: "Flash accounting & MEV" },
  { id: "web-app", label: "Web application" },
  { id: "deploy-dev", label: "Deploy & local dev" },
  { id: "internal-notes", label: "Internal notes" },
] as const;

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
    <code className="rounded-md bg-white/12 px-2 py-0.5 font-mono text-sm text-white/95 md:text-base">{children}</code>
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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] md:px-5 md:py-4"
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
        <div className="border-t border-white/10 px-4 py-3 text-base text-white/80 md:px-5 md:py-4 md:text-lg">
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
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-6 md:px-7 md:py-8">
      <p className="text-base font-medium text-white md:text-lg">What each top-level folder is for</p>
      <p className="mt-2 text-sm text-white/60 md:text-base">
        Colors align with the diagram above. Use this table when you jump back into the repo after time away.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.title}
            className="rounded-xl border px-4 py-4 md:px-5 md:py-5"
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

export function ArchitectureDocContent() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  const onScrollSpy = useCallback(() => {
    const positions = SECTIONS.map(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return { id, top: Infinity };
      const rect = el.getBoundingClientRect();
      return { id, top: Math.abs(rect.top - 120) };
    });
    positions.sort((a, b) => a.top - b.top);
    setActiveId(positions[0].id);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScrollSpy, { passive: true });
    onScrollSpy();
    return () => window.removeEventListener("scroll", onScrollSpy);
  }, [onScrollSpy]);

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
    <div className="relative z-10 min-h-screen w-full pt-[4.5rem] md:pt-[6rem]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-28 md:flex-row md:items-start md:gap-10 md:px-6">
        {/* Mobile section jump — same window chrome as landing */}
        <div className="w-full md:hidden">
          <CodeWindowFrame title="On this page" label="SECTIONS" contentClassName="!p-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-base text-white md:px-6 md:py-4"
            >
              <span>Jump to section</span>
              <span className="text-white/45">{mobileNavOpen ? "▲" : "▼"}</span>
            </button>
            {mobileNavOpen ? (
              <nav className="max-h-[50vh] overflow-y-auto border-t border-white/10 py-1">
                {SECTIONS.map(({ id, label }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className={`block px-4 py-3 text-base ${
                      activeId === id ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/8"
                    }`}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            ) : null}
          </CodeWindowFrame>
        </div>

        <aside className="hidden w-60 shrink-0 lg:w-[17rem] md:block">
          <CodeWindowFrame className="sticky top-[7.7rem]" title="Navigate" label="SECTIONS" contentClassName="!p-3 md:!p-4">
            <nav className="flex flex-col gap-0.5">
              {SECTIONS.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={`block rounded-lg px-3 py-2.5 text-sm transition-colors md:text-base ${
                    activeId === id ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white/95"
                  }`}
                >
                  {label}
                </a>
              ))}
            </nav>
          </CodeWindowFrame>
        </aside>

        <main className="min-w-0 flex-1 space-y-10 md:space-y-12">
          <CodeWindowFrame sectionId="overview" title="Overview" label="REFERENCE">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-amber-500/45 bg-amber-500/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-100 md:text-sm">
                  Internal
                </span>
                <p className="text-sm text-white/55 md:text-base">Operator reference — restrict later if needed.</p>
              </div>
              <h1 className="font-anita text-3xl font-normal tracking-tight text-white md:text-4xl lg:text-5xl">
                Architecture &amp; codebase map
              </h1>
              <p className="text-base leading-relaxed text-white/65 md:text-xl">
                Same window chrome as the landing “Explore Architecture” section: traffic lights, captions, dark glass
                body. Below: diagrams and collapsible detail.
              </p>
            </div>
            <div className="mt-6 border-t border-white/10 pt-6">
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
              <div className="mt-6 space-y-3">
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="repo-layout" title="Repository layout" label="TREE">
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
            <MermaidBlock id="repo" chart={repoDiagram} />
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="core-contracts" title="On-chain core" label="CONTRACTS">
            <MermaidBlock id="core" chart={coreDiagram} />
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="swap-flow" title="Swap path" label="SEQUENCE">
            <MermaidBlock id="swap-seq" chart={swapDiagram} />
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="liquidity-flow" title="Liquidity path" label="SEQUENCE">
            <MermaidBlock id="liquidity" chart={liquidityDiagram} />
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="quotes-oracles" title="Quotes & data bridges" label="ORACLES">
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="flash-mev" title="Flash accounting & MEV" label="FLASH">
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="web-app" title="Web application" label="NEXT.JS">
            <Prose>
              <p>
                Styling uses Geist sans, Anita display for hero titles, cross-texture overlay, and animated gradient blobs
                identical to Swap. CSP in <CodeInline>next.config.ts</CodeInline> whitelists RPC + chart CDNs; adjust if
                you add new third-party origins.
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="deploy-dev" title="Deploy & local dev" label="SCRIPTS">
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
          </CodeWindowFrame>

          <CodeWindowFrame sectionId="internal-notes" title="Internal notes" label="RISKS">
            <Prose>
              <p
                className="rounded-xl border border-amber-500/35 px-4 py-3 text-amber-50 md:text-lg"
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
          </CodeWindowFrame>
        </main>
      </div>
    </div>
  );
}
