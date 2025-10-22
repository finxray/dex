// Final recommended gamma and k values for Stoicov implementation
// Preserves natural AS formula shape while providing meaningful differentiation

const DELTA_MIN_BPS = [
  0.5, 1, 2, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250, 350, 500
];

// K levels mapped from minimal half-spreads
const K_LEVELS = DELTA_MIN_BPS.map(d => Math.round(10000 / d));

// Recommended gamma values
const GAMMAS = {
  low: 0.0,    // inventory-indifferent (inv mode 00)
  mid: 0.4,    // moderate risk aversion
  high: 0.8,   // higher risk aversion
};

// AS half-spread formula
function deltaStarAS(gamma, k, sigma2tau) {
  if (gamma === 0) return 1 / k;
  const lnTerm = Math.log(1 + gamma / k) / gamma;
  const baseline = (gamma * sigma2tau) / 2;
  return lnTerm + baseline;
}

describe("Final Stoicov parameters recommendation", function () {
  it("shows complete table with recommended k and gamma values", function () {
    console.log("\n=== RECOMMENDED STOICOV PARAMETERS ===\n");
    
    console.log("K LEVELS (17 values mapped from δ_min):");
    console.log(K_LEVELS.join(", "));
    
    console.log("\nGAMMA LEVELS:");
    console.log("- γ_low = 0.0 (inventory-indifferent, for inv mode 00)");
    console.log("- γ_mid = 0.4 (moderate risk aversion)");
    console.log("- γ_high = 0.8 (higher risk aversion)");
    
    console.log("\n=== HALF-SPREAD δ* TABLE (bps) ===");
    console.log("Using σ²τ = (δ_min/100)² for natural scaling\n");
    
    const header = ["δ_min", "k", "γ_low", "γ_mid", "γ_high", "mid/low", "high/low"];
    console.log(header.join("\t"));
    
    for (let i = 0; i < DELTA_MIN_BPS.length; i++) {
      const d = DELTA_MIN_BPS[i];
      const k = K_LEVELS[i];
      const sigma2tau = (d / 10000) * (d / 10000);
      
      const dLow = deltaStarAS(GAMMAS.low, k, sigma2tau) * 1e4;
      const dMid = deltaStarAS(GAMMAS.mid, k, sigma2tau) * 1e4;
      const dHigh = deltaStarAS(GAMMAS.high, k, sigma2tau) * 1e4;
      
      console.log([
        d.toFixed(1),
        k,
        dLow.toFixed(3),
        dMid.toFixed(3),
        dHigh.toFixed(3),
        (dMid/dLow).toFixed(2) + "x",
        (dHigh/dLow).toFixed(2) + "x"
      ].join("\t"));
    }
    
    console.log("\n=== INVENTORY EFFECTS (|q|=100 ETH) ===");
    console.log("Reservation spread |r-Ŝ| in bps\n");
    
    const header2 = ["δ_min", "γ_mid", "γ_high"];
    console.log(header2.join("\t"));
    
    for (const d of [0.5, 1, 5, 10, 30, 50, 100, 200, 500]) {
      const sigma2tau = (d / 10000) * (d / 10000);
      const q = 100; // moderate inventory
      
      const rMid = Math.abs(-q * GAMMAS.mid * sigma2tau) * 1e4;
      const rHigh = Math.abs(-q * GAMMAS.high * sigma2tau) * 1e4;
      
      console.log([
        d.toFixed(1),
        rMid.toFixed(3),
        rHigh.toFixed(3)
      ].join("\t"));
    }
    
    console.log("\n=== KEY PROPERTIES ===");
    console.log("1. δ* stays very close to δ_min for all gamma levels (preserves k mapping)");
    console.log("2. Inventory affects reservation price r, creating natural bid/ask asymmetry");
    console.log("3. Higher gamma increases sensitivity to inventory without distorting base spreads");
    console.log("4. Formula shape preserved: ln term dominates, baseline term stays small");
    console.log("5. LPs can choose aggressive k (tighter spreads) with higher gamma for protection");
  });
});
