// Avellaneda–Stoikov δ* table for constant gamma levels and mapped k values
// δ* = (1/γ) ln(1 + γ/k) + (γ σ² τ)/2, with σ² τ = (δ_min_rel)² per row

const DELTA_MIN_BPS = [
  0.5, 1, 2, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250, 350, 500,
];

function mapK(deltaMinBps) {
  return Math.round(10000 / deltaMinBps);
}

const GAMMAS = {
  low: 0.0,       // inventory-indifferent
  mid: 0.01,      // 1% risk aversion
  high: 0.02,     // 2% risk aversion
};

function deltaStarAS(gamma, k, sigma2tau) {
  if (gamma === 0) return 1 / k; // limit as γ→0
  return Math.log(1 + gamma / k) / gamma + (gamma * sigma2tau) / 2;
}

describe("Stoicov AS table (constant gamma, mapped k, row-specific sigma)", function () {
  it("prints table of δ* (bps) for low/mid/high gammas", function () {
    console.log("\nGamma levels: low=0, mid=0.01, high=0.02");
    console.log("σ²·τ per row = (δ_min_rel)²");
    const header = [
      "δ_min(bps)",
      "k",
      "low[opt]",
      "low[mid]",
      "low[max]",
      "mid[opt]",
      "mid[mid]",
      "mid[max]",
      "high[opt]",
      "high[mid]",
      "high[max]",
    ];
    console.log(header.join("\t"));

    for (const d of DELTA_MIN_BPS) {
      const k = mapK(d);
      const dRel = d / 1e4;
      const sigma2tau = dRel * dRel;

      const dLow = deltaStarAS(GAMMAS.low, k, sigma2tau) * 1e4;
      const dMid = deltaStarAS(GAMMAS.mid, k, sigma2tau) * 1e4;
      const dHigh = deltaStarAS(GAMMAS.high, k, sigma2tau) * 1e4;

      const row = [
        d.toFixed(d < 1 ? 3 : 2),
        k,
        dLow.toFixed(8), dLow.toFixed(8), dLow.toFixed(8),
        dMid.toFixed(8), dMid.toFixed(8), dMid.toFixed(8),
        dHigh.toFixed(8), dHigh.toFixed(8), dHigh.toFixed(8),
      ];
      console.log(row.join("\t"));
    }
  });
});


