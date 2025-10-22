const { expect } = require("chai");

// Target minimal half-spreads (bps)
const DELTA_MIN_BPS = [
  0.5, 1, 2, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250, 350, 500,
];

// k mapping: k = round(10000 / δ_min_bps)
function mapK(deltaMinBps) {
  return Math.round(10000 / deltaMinBps);
}

// Inventory severity s: 0 = optimal, 0.5 = mid, 1 = max suboptimal
const S_LEVELS = { max: 1.0, mid: 0.5, opt: 0.0 };

// Gamma profiles (conceptual multipliers to scale δ_min with inventory severity)
// low: flat at δ_min; mid: up to 2×; high: up to 3× at s = 1
function halfSpreadBps(deltaMinBps, profile, s) {
  if (profile === "low") return deltaMinBps; // inventory indifferent
  if (profile === "mid") return deltaMinBps * (1 + 1 * s); // δ_min → 2×
  if (profile === "high") return deltaMinBps * (1 + 2 * s); // δ_min → 3×
  throw new Error("unknown gamma profile");
}

describe("Stoicov k/gamma calibration tables (isolated)", function () {
  it("prints mapped k and computed half-spreads for low/mid/high gammas", function () {
    // Print gamma description
    console.log("\nGamma profiles:");
    console.log("- low: inventory indifferent (flat at δ_min)");
    console.log("- mid: scales to 2× δ_min at max suboptimal inventory");
    console.log("- high: scales to 3× δ_min at max suboptimal inventory\n");

    // Header
    const header = [
      "δ_min(bps)",
      "k",
      "low[max]",
      "low[mid]",
      "low[opt]",
      "mid[max]",
      "mid[mid]",
      "mid[opt]",
      "high[max]",
      "high[mid]",
      "high[opt]",
    ];
    console.log(header.join("\t"));

    // Rows
    for (const d of DELTA_MIN_BPS) {
      const k = mapK(d);
      const row = [
        d.toFixed(d < 1 ? 3 : 2),
        k,
        halfSpreadBps(d, "low", S_LEVELS.max).toFixed(6),
        halfSpreadBps(d, "low", S_LEVELS.mid).toFixed(6),
        halfSpreadBps(d, "low", S_LEVELS.opt).toFixed(6),
        halfSpreadBps(d, "mid", S_LEVELS.max).toFixed(6),
        halfSpreadBps(d, "mid", S_LEVELS.mid).toFixed(6),
        halfSpreadBps(d, "mid", S_LEVELS.opt).toFixed(6),
        halfSpreadBps(d, "high", S_LEVELS.max).toFixed(6),
        halfSpreadBps(d, "high", S_LEVELS.mid).toFixed(6),
        halfSpreadBps(d, "high", S_LEVELS.opt).toFixed(6),
      ];
      console.log(row.join("\t"));
      // Invariants
      expect(Number(row[2])).to.equal(Number(row[3])); // low max == low mid == low opt == δ_min
      expect(Number(row[3])).to.equal(Number(row[4]));
      expect(Number(row[5])).to.be.closeTo(d * 2, 1e-9); // mid max = 2×
      expect(Number(row[6])).to.be.closeTo(d * 1.5, 1e-9); // mid mid = 1.5×
      expect(Number(row[7])).to.be.closeTo(d, 1e-9); // mid opt = 1×
      expect(Number(row[8])).to.be.closeTo(d * 3, 1e-9); // high max = 3×
      expect(Number(row[9])).to.be.closeTo(d * 2, 1e-9); // high mid = 2×
      expect(Number(row[10])).to.be.closeTo(d, 1e-9); // high opt = 1×
    }
  });
});


