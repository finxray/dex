import { NavLink } from "../types/navigation";

export const navLinks: NavLink[] = [
  {
    label: "Protocol",
    href: "#protocol",
    mega: [
      {
        heading: "Liquidity",
        items: [
          { title: "Coordination layer", href: "#protocol" },
          { title: "Pool management", href: "#protocol" },
          { title: "Quote routing", href: "#protocol" },
          { title: "Flash accounting", href: "#protocol" },
        ],
      },
      {
        heading: "Risk & Controls",
        items: [
          { title: "Circuit breakers", href: "#protocol" },
          { title: "Inventory limits", href: "#protocol" },
          { title: "Rebalancing hooks", href: "#protocol" },
          { title: "MEV protection", href: "#protocol" },
        ],
      },
      {
        heading: "Governance",
        items: [
          { title: "Guardian desks", href: "#protocol" },
          { title: "Attestations", href: "#protocol" },
          { title: "Event telemetry", href: "#protocol" },
          { title: "Proposals", href: "#protocol" },
        ],
      },
    ],
  },
  {
    label: "Technology",
    href: "#technology",
    mega: [
      {
        heading: "Core Contracts",
        items: [
          { title: "PoolManager", href: "#technology" },
          { title: "LiquidityManager", href: "#technology" },
          { title: "QuoteRouter", href: "#technology" },
          { title: "ERC6909 Claims", href: "#technology" },
          { title: "Flash accounting", href: "#technology" },
          { title: "Transient storage", href: "#technology" },
        ],
      },
      {
        heading: "Periphery",
        items: [
          { title: "Orchestrators", href: "#technology" },
          { title: "Data bridges", href: "#technology" },
          { title: "Stoicov quoter", href: "#technology" },
          { title: "Market adapters", href: "#technology" },
          { title: "Custody integrations", href: "#technology" },
          { title: "RedStone adapter", href: "#technology" },
        ],
      },
      {
        heading: "Developer Tools",
        items: [
          { title: "Foundry", href: "#technology" },
          { title: "Type generation", href: "#technology" },
          { title: "Testing suite", href: "#technology" },
          { title: "Gas profiler", href: "#technology" },
          { title: "Deployment scripts", href: "#technology" },
        ],
      },
    ],
  },
  {
    label: "Documentation",
    href: "#resources",
    mega: [
      {
        heading: "Get Started",
        items: [
          { title: "Introduction", href: "#resources" },
          { title: "Installation", href: "#resources" },
          { title: "Quick start", href: "#resources" },
          { title: "Core concepts", href: "#resources" },
          { title: "Terminology", href: "#resources" },
        ],
      },
      {
        heading: "Guides",
        items: [
          { title: "Integration guide", href: "#resources" },
          { title: "Deployment guide", href: "#resources" },
          { title: "Configuration", href: "#resources" },
          { title: "Testing guide", href: "#resources" },
          { title: "Security practices", href: "#resources" },
          { title: "Migration guide", href: "#resources" },
        ],
      },
      {
        heading: "API Reference",
        items: [
          { title: "Core contracts", href: "#resources" },
          { title: "Periphery contracts", href: "#resources" },
          { title: "TypeScript SDK", href: "#resources" },
          { title: "CLI tools", href: "#resources" },
          { title: "Whitepaper", href: "#resources" },
        ],
      },
    ],
  },
  {
    label: "Resources",
    href: "#resources",
    mega: [
      {
        heading: "Community",
        items: [
          { title: "Developer forum", href: "#resources" },
          { title: "GitHub repository", href: "#resources" },
          { title: "NPM packages", href: "#resources" },
          { title: "Discord", href: "#resources" },
        ],
      },
      {
        heading: "Learn",
        items: [
          { title: "Tutorials", href: "#resources" },
          { title: "Video series", href: "#resources" },
          { title: "Case studies", href: "#resources" },
          { title: "Blog", href: "#resources" },
          { title: "Newsletter", href: "#resources" },
        ],
      },
      {
        heading: "Events",
        items: [
          { title: "Workshops", href: "#resources" },
          { title: "Hackathons", href: "#resources" },
          { title: "Conferences", href: "#resources" },
          { title: "Webinars", href: "#resources" },
        ],
      },
    ],
  },
  {
    label: "Company",
    href: "#company",
    mega: [
      {
        heading: "About Stoix",
        items: [
          { title: "Mission", href: "#company" },
          { title: "Team", href: "#company" },
          { title: "Partners", href: "#company" },
          { title: "Investors", href: "#company" },
        ],
      },
      {
        heading: "Opportunities",
        items: [
          { title: "Careers", href: "#company" },
          { title: "Working group", href: "#company" },
          { title: "Guardian program", href: "#company" },
          { title: "Internships", href: "#company" },
        ],
      },
      {
        heading: "Newsroom",
        items: [
          { title: "Press releases", href: "#company" },
          { title: "Media kit", href: "#company" },
          { title: "Contact", href: "#company" },
        ],
      },
    ],
  },
];

