"use client";

import React from "react";
import {
  Header,
  Hero,
  ProtocolSection,
  TechnologySection,
  ResourcesSection,
  CompanySection,
  Footer,
  ArchitectureSection,
  VideoBackground,
} from "./components";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      <VideoBackground />
      <Header />

      <main className="relative z-10 px-6 pt-20">
        <div className="mx-auto max-w-[980px] px-6">
          <Hero />
        </div>
        <ArchitectureSection />
        <div className="mx-auto max-w-[980px] space-y-32 px-6 py-24">
          <ProtocolSection />
        </div>

        <div className="bg-white">
          <div className="mx-auto max-w-[980px] space-y-32 px-6 py-24">
            <TechnologySection />
            <ResourcesSection />
            <CompanySection />
          </div>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
