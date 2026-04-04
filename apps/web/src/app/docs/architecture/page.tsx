import type { Metadata } from "next";
import { Header } from "../../components";
import AnimatedBackground from "../../swap/components/AnimatedBackground";
import { ArchitectureDocContent } from "./ArchitectureDocContent";

export const metadata: Metadata = {
  title: "Architecture & codebase map — Stoix",
  description: "Internal map of Stoix contracts, web app, and operational flows.",
};

export default function ArchitectureDocsPage() {
  return (
    <div
      className="min-h-screen text-white cross-texture"
      style={{
        width: "100vw",
        overflowX: "hidden",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        position: "relative",
        backgroundColor: "#000000",
      }}
    >
      <Header />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.1725, pointerEvents: "none" }}>
        <AnimatedBackground />
      </div>
      <ArchitectureDocContent />
    </div>
  );
}
