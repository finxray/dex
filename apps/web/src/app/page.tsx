"use client";

import React, { useEffect, useState } from "react";
import {
  Header,
  Hero,
  ProtocolSection,
  TechnologySection,
  ResourcesSection,
  CompanySection,
  Footer,
  ArchitectureSection,
} from "./components";

export default function Home() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div className="relative min-h-screen bg-black overflow-hidden" style={{ width: "100vw", margin: 0, padding: 0 }}>
      <Header />

      <main className="relative z-10 md:pt-20" style={{ width: "100vw", margin: 0, padding: 0, paddingTop: isMobile ? "3.645rem" : undefined }}>
        <div className="mx-auto max-w-[980px] px-4 md:px-6">
          <Hero />
        </div>
        <ArchitectureSection />
        <div className="mx-auto max-w-[980px] space-y-32 px-4 md:px-6 py-24">
          <ProtocolSection />
        </div>

        <div className="bg-white" style={{ width: "100vw", margin: 0, padding: 0 }}>
          <div className="mx-auto max-w-[980px] space-y-32 px-4 md:px-6 py-24">
            <TechnologySection />
            <ResourcesSection />
            <CompanySection />
          </div>
        </div>
      </main>

      <div className="relative z-10" style={{ width: "100vw", margin: 0, padding: 0 }}>
        <Footer />
      </div>
    </div>
  );
}
