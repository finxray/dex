"use client";

import { useState } from "react";
import { Header } from "../components";

export default function AnalyticsPage() {
  const [isTestCardOpen, setIsTestCardOpen] = useState(false);

  const testItems = Array.from({ length: 50 }, (_, i) => `Test Item ${i + 1} - This is a scrollable item for testing purposes`);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-black text-white pt-24">
      <div className="mx-auto max-w-[980px] px-6">
        <h1 className="text-2xl font-semibold mb-2">Analytics</h1>
        <p className="text-white/60">Coming soon: volume, fees, and pool analytics.</p>
        
        <button
          onClick={() => setIsTestCardOpen(true)}
          className="mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          Open Test Scroll Card
        </button>
      </div>

      {/* Simple Test Scroll Card */}
      {isTestCardOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-gray-900 border border-white/20 rounded-lg shadow-2xl" style={{ width: "400px", height: "600px", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">Test Scroll Card</h2>
              <button
                onClick={() => setIsTestCardOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div 
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "16px",
                minHeight: 0,
              }}
            >
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {testItems.map((item, index) => (
                  <li 
                    key={index}
                    style={{
                      padding: "12px",
                      marginBottom: "8px",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      borderRadius: "8px",
                      color: "white",
                    }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

