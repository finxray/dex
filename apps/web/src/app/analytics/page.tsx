"use client";

import { useState } from "react";
import { Header, TokenSelector, type Token } from "../components";

export default function AnalyticsPage() {
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false);
  
  const mockTokens: Token[] = [
    { symbol: "ETH", name: "Ethereum", address: "0x0000000000000000000000000000000000000000" as `0x${string}`, decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`, decimals: 6 },
    { symbol: "DAI", name: "Dai Stablecoin", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as `0x${string}`, decimals: 18 },
    ...Array.from({ length: 47 }, (_, i) => ({
      symbol: `TOKEN${i + 1}`,
      name: `Token ${i + 1}`,
      address: `0x${(i + 1).toString(16).padStart(40, '0')}` as `0x${string}`,
      decimals: 18
    }))
  ];
  
  const [selectedToken, setSelectedToken] = useState<Token>(mockTokens[0]);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-black text-white pt-24">
      <div className="mx-auto max-w-[980px] px-6">
        <h1 className="text-2xl font-semibold mb-2">Analytics</h1>
        <p className="text-white/60">Coming soon: volume, fees, and pool analytics.</p>
        
        <button
          onClick={() => setIsTokenSelectorOpen(true)}
          className="mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          Open Token Selector
        </button>
      </div>

      {/* Token Selector */}
      {isTokenSelectorOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="relative">
            <TokenSelector
              selected={selectedToken}
              tokens={mockTokens}
              onSelect={(token) => {
                setSelectedToken(token);
                setIsTokenSelectorOpen(false);
              }}
              showButton={false}
              open={true}
              onClose={() => setIsTokenSelectorOpen(false)}
            />
          </div>
        </div>
      )}
      </div>
    </>
  );
}

