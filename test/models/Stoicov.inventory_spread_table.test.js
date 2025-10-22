// Calculate half-spreads for all gamma levels and inventory states
// Shows effective half-spread = δ* (base) + inventory adjustment effect

const DELTA_MIN_BPS = [
  0.5, 1, 2, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250, 350, 500
];

// K levels mapped from minimal half-spreads
const K_LEVELS = DELTA_MIN_BPS.map(d => Math.round(10000 / d));

// Recommended gamma values
const GAMMAS = {
  low: 0.0,    // inventory-indifferent
  mid: 0.4,    // moderate risk aversion
  high: 0.8,   // higher risk aversion
};

// Inventory states (in units of risky asset, e.g., ETH)
const INVENTORY_STATES = {
  optimal: 0,        // q = 0
  mid_suboptimal: 100,  // q = 100
  max_suboptimal: 500   // q = 500
};

// AS half-spread formula
function deltaStarAS(gamma, k, sigma2tau) {
  if (gamma === 0) return 1 / k;
  const lnTerm = Math.log(1 + gamma / k) / gamma;
  const baseline = (gamma * sigma2tau) / 2;
  return lnTerm + baseline;
}

// Calculate effective half-spread considering inventory
// Note: In pure AS, δ* is inventory-independent, but inventory affects quotes through r
// For display purposes, we show δ* + a portion of the reservation adjustment
function effectiveHalfSpread(gamma, k, sigma2tau, q) {
  const deltaStar = deltaStarAS(gamma, k, sigma2tau);
  // Inventory adjustment affects bid/ask asymmetrically
  // For simplicity, we show the base δ* (inventory doesn't change half-spread directly)
  // The reservation price shift would affect the midpoint, not the spread width
  return deltaStar;
}

describe("Stoicov half-spreads for all gamma and inventory levels", function () {
  it("prints comprehensive half-spread table", function () {
    console.log("\n=== HALF-SPREAD TABLE (bps) ===");
    console.log("Note: In AS model, δ* is inventory-independent");
    console.log("Inventory affects reservation price r, not half-spread width\n");
    
    // Print header
    const header = [
      "δ_min", "k",
      "low[opt]", "low[mid]", "low[max]",
      "mid[opt]", "mid[mid]", "mid[max]",
      "high[opt]", "high[mid]", "high[max]"
    ];
    console.log(header.join("\t"));
    
    // Print data rows
    for (let i = 0; i < DELTA_MIN_BPS.length; i++) {
      const d = DELTA_MIN_BPS[i];
      const k = K_LEVELS[i];
      const sigma2tau = (d / 10000) * (d / 10000);
      
      // Calculate half-spreads for each gamma and inventory combination
      const lowOpt = effectiveHalfSpread(GAMMAS.low, k, sigma2tau, INVENTORY_STATES.optimal) * 1e4;
      const lowMid = effectiveHalfSpread(GAMMAS.low, k, sigma2tau, INVENTORY_STATES.mid_suboptimal) * 1e4;
      const lowMax = effectiveHalfSpread(GAMMAS.low, k, sigma2tau, INVENTORY_STATES.max_suboptimal) * 1e4;
      
      const midOpt = effectiveHalfSpread(GAMMAS.mid, k, sigma2tau, INVENTORY_STATES.optimal) * 1e4;
      const midMid = effectiveHalfSpread(GAMMAS.mid, k, sigma2tau, INVENTORY_STATES.mid_suboptimal) * 1e4;
      const midMax = effectiveHalfSpread(GAMMAS.mid, k, sigma2tau, INVENTORY_STATES.max_suboptimal) * 1e4;
      
      const highOpt = effectiveHalfSpread(GAMMAS.high, k, sigma2tau, INVENTORY_STATES.optimal) * 1e4;
      const highMid = effectiveHalfSpread(GAMMAS.high, k, sigma2tau, INVENTORY_STATES.mid_suboptimal) * 1e4;
      const highMax = effectiveHalfSpread(GAMMAS.high, k, sigma2tau, INVENTORY_STATES.max_suboptimal) * 1e4;
      
      console.log([
        d.toFixed(1),
        k,
        lowOpt.toFixed(4),
        lowMid.toFixed(4),
        lowMax.toFixed(4),
        midOpt.toFixed(4),
        midMid.toFixed(4),
        midMax.toFixed(4),
        highOpt.toFixed(4),
        highMid.toFixed(4),
        highMax.toFixed(4)
      ].join("\t"));
    }
    
    console.log("\n=== RESERVATION PRICE SHIFTS (bps) ===");
    console.log("Shows |r-Ŝ| for different inventory levels\n");
    
    const header2 = [
      "δ_min",
      "mid[q=100]", "mid[q=500]",
      "high[q=100]", "high[q=500]"
    ];
    console.log(header2.join("\t"));
    
    for (const d of DELTA_MIN_BPS) {
      const sigma2tau = (d / 10000) * (d / 10000);
      
      const midQ100 = Math.abs(-100 * GAMMAS.mid * sigma2tau) * 1e4;
      const midQ500 = Math.abs(-500 * GAMMAS.mid * sigma2tau) * 1e4;
      const highQ100 = Math.abs(-100 * GAMMAS.high * sigma2tau) * 1e4;
      const highQ500 = Math.abs(-500 * GAMMAS.high * sigma2tau) * 1e4;
      
      console.log([
        d.toFixed(1),
        midQ100.toFixed(4),
        midQ500.toFixed(4),
        highQ100.toFixed(4),
        highQ500.toFixed(4)
      ].join("\t"));
    }
    
    console.log("\n=== KEY OBSERVATION ===");
    console.log("In Avellaneda-Stoikov, half-spread δ* is the same across inventory levels.");
    console.log("Inventory q affects the reservation price r = Ŝ - q·γ·σ²·τ");
    console.log("This shifts the bid/ask quotes but doesn't widen the spread itself.");
  });
});
