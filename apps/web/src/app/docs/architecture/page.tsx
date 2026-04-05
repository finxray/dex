import type { Metadata } from "next";
import { Header } from "../../components";
import { ArchitectureDocContent } from "./ArchitectureDocContent";

export const metadata: Metadata = {
  title: "Architecture & codebase map — Stoix",
  description: "Internal map of Stoix contracts, web app, and operational flows.",
};

export default function ArchitectureDocsPage() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-black text-white"
      style={{ width: "100vw", margin: 0, padding: 0, boxSizing: "border-box" }}
    >
      <Header />
      <ArchitectureDocContent />
    </div>
  );
}
