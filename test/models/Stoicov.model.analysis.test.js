const { expect } = require("chai");

// Avellaneda–Stoikov (simplified) parameters for analysis
// k levels matched to minimal half-spreads (bps):
// [0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500]
const K_LEVELS = [
  20000, 10000, 4000, 2000, 1333, 1000, 667, 500,
  333,   200,   133,  100,   67,   50,   33,   20,
];

// Gamma presets (inventory mode 00 will implicitly use gammaLow)
const gammaLow  = 1e-6;
const gammaMid  = 5e-6;
const gammaHigh = 2e-5;

// Time horizon: 15 minutes (seconds not directly used; we fold units into sigma^2 * tau)
// For analysis, pick a fixed per-horizon volatility (ETH/USDC) at 15m window
// Use sigma15 = 1% (0.01) per sqrt(horizon), so sigma^2 * tau == 0.01^2 = 1e-4
const sigma15 = 0.01; // per sqrt(15m)
const sigma2Tau = sigma15 * sigma15; // sigma^2 * tau (unitless in our analysis)

// Half-spread formula: delta* = (1/gamma) * ln(1 + gamma/k) + (gamma * sigma^2 * tau) / 2
function deltaStar(gamma, k) {
  const lnTerm = Math.log(1 + (gamma / k)) / gamma; // safe for small gamma
  const baseline = (gamma * sigma2Tau) / 2;
  return lnTerm + baseline;
}

// Convenience: minimal half-spread (near gamma -> 0) is approximately 1/k
function deltaMinApprox(k) {
  return 1 / k;
}

describe("Stoicov model analysis (isolated)", function () {
  it("inv=00 (inventory not a concern): delta stays ~ minimal mapping for all k", function () {
    for (const k of K_LEVELS) {
      const d = deltaStar(gammaLow, k);
      const dMin = deltaMinApprox(k);
      // Relative error should be small because gammaLow is tiny and baseline is negligible
      const relErr = Math.abs(d - dMin) / dMin;
      // Tolerance 5%
      expect(relErr).to.be.lte(0.05, `k=${k}, got ${d}, min ${dMin}, relErr ${relErr}`);
      // Always positive
      expect(d).to.be.gt(0);
    }
  });

  it("gamma monotonicity: delta varies monotonically with gamma (low→mid→high)", function () {
    for (const k of K_LEVELS) {
      const dl = deltaStar(gammaLow, k);
      const dm = deltaStar(gammaMid, k);
      const dh = deltaStar(gammaHigh, k);
      const minLH = Math.min(dl, dh);
      const maxLH = Math.max(dl, dh);
      expect(dm).to.be.gte(minLH - 1e-12, `k=${k}, dl=${dl}, dm=${dm}, dh=${dh}`);
      expect(dm).to.be.lte(maxLH + 1e-12, `k=${k}, dl=${dl}, dm=${dm}, dh=${dh}`);
      // All positive
      expect(dh).to.be.gt(0);
    }
  });

  it("sanity: minimal half-spread never violated (delta* > 0) and stays close to 1/k for small gamma", function () {
    for (const k of K_LEVELS) {
      const dLow = deltaStar(gammaLow, k);
      expect(dLow).to.be.gt(0);
      // Close to mapping
      const dMin = 1 / k;
      expect(Math.abs(dLow - dMin)).to.be.lte(0.1 * dMin); // 10% absolute tolerance
    }
  });

  it("reservation price keeps spread positive regardless of inventory: p_ask - p_bid = 2*delta* > 0", function () {
    const S = 1.0; // normalized midprice
    const qSamples = [ -1000, -10, 0, 10, 1000 ]; // arbitrary units
    for (const k of [1000, 200, 50]) { // sample a few k
      const d = deltaStar(gammaMid, k);
      for (const q of qSamples) {
        const r = S - q * gammaMid * sigma2Tau; // r = S - q*gamma*sigma^2*tau
        const pBid = r - d;
        const pAsk = r + d;
        expect(pAsk - pBid).to.be.closeTo(2 * d, 1e-12);
        expect(pAsk).to.be.gt(pBid);
      }
    }
  });

  it("print tables: reservation spreads and half-spreads (exact)", function () {
    // Table 1: Reservation spreads (bps) for q grid
    const qGrid = [1000, 100, 0, -100, -1000];
    const headers1 = ["q", "inv_indiff(γ_low)", "γ_mid", "γ_high"];
    console.log("\nReservation spreads (bps), σ15=", sigma15, " σ²τ=", sigma2Tau);
    console.log(headers1.join("\t"));
    for (const q of qGrid) {
      const rLowBps = -q * gammaLow;  // since (r-Ŝ)bps = -q*γ with σ²τ=1e-4 and Ŝ=1
      const rMidBps = -q * gammaMid;
      const rHighBps = -q * gammaHigh;
      console.log([
        q,
        rLowBps.toFixed(6),
        rMidBps.toFixed(6),
        rHighBps.toFixed(6),
      ].join("\t"));
    }

    // Table 2: Half-spreads for all k levels (bps)
    const headers2 = ["k", "δ*(γ_mid)", "δ*(γ_high)"];
    console.log("\nHalf-spreads δ* (bps) for all k levels");
    console.log(headers2.join("\t"));
    for (const k of K_LEVELS) {
      const dMid = deltaStar(gammaMid, k) * 1e4;   // to bps
      const dHigh = deltaStar(gammaHigh, k) * 1e4; // to bps
      console.log([
        k,
        dMid.toFixed(8),
        dHigh.toFixed(8),
      ].join("\t"));
    }
  });
});


