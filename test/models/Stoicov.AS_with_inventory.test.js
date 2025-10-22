// Test Avellaneda-Stoikov with inventory effects on reservation price
// Shows how gamma, σ²τ, and inventory q interact naturally in the formula

const DELTA_MIN_BPS = [0.5, 1, 2, 5, 10, 20, 30, 50, 100, 200, 500];

function mapK(deltaMinBps) {
  return Math.round(10000 / deltaMinBps);
}

// Gamma values that create meaningful but not excessive differences
// These are calibrated to work with k values and typical σ²τ
const GAMMAS = {
  low: 0.0,      // inventory-indifferent
  mid: 0.3,      // moderate risk aversion  
  high: 0.7,     // higher risk aversion
};

// AS half-spread formula
function deltaStarAS(gamma, k, sigma2tau) {
  if (gamma === 0) return 1 / k;
  return Math.log(1 + gamma / k) / gamma + (gamma * sigma2tau) / 2;
}

// Reservation price adjustment (in relative units)
function reservationAdjustment(q, gamma, sigma2tau) {
  return -q * gamma * sigma2tau;
}

describe("Stoicov AS with natural inventory effects", function () {
  it("shows how δ* and reservation price interact with inventory", function () {
    console.log("\nGamma levels: low=0, mid=0.3, high=0.7");
    console.log("Inventory q levels: -500 (short), 0 (optimal), +500 (long)");
    console.log("σ²·τ = (δ_min/100)² to keep baseline term reasonable\n");

    // Header for δ* table
    console.log("Half-spread δ* (bps) - inventory-independent:");
    console.log("δ_min(bps)\tk\tγ_low\tγ_mid\tγ_high\tRatio(mid/low)\tRatio(high/low)");
    
    for (const d of DELTA_MIN_BPS) {
      const k = mapK(d);
      const sigma2tau = (d / 10000) * (d / 10000); // (δ_min_rel)²
      
      const dLow = deltaStarAS(GAMMAS.low, k, sigma2tau) * 1e4;
      const dMid = deltaStarAS(GAMMAS.mid, k, sigma2tau) * 1e4;
      const dHigh = deltaStarAS(GAMMAS.high, k, sigma2tau) * 1e4;
      
      console.log([
        d.toFixed(1),
        k,
        dLow.toFixed(4),
        dMid.toFixed(4),
        dHigh.toFixed(4),
        (dMid/dLow).toFixed(3),
        (dHigh/dLow).toFixed(3)
      ].join("\t"));
    }

    // Show reservation price effects
    console.log("\nReservation price shift |r-Ŝ| (bps) for |q|=500:");
    console.log("δ_min(bps)\tγ_mid\tγ_high");
    
    for (const d of DELTA_MIN_BPS) {
      const sigma2tau = (d / 10000) * (d / 10000);
      const rMid = Math.abs(reservationAdjustment(500, GAMMAS.mid, sigma2tau)) * 1e4;
      const rHigh = Math.abs(reservationAdjustment(500, GAMMAS.high, sigma2tau)) * 1e4;
      
      console.log([
        d.toFixed(1),
        rMid.toFixed(4),
        rHigh.toFixed(4)
      ].join("\t"));
    }

    // Show effective bid-ask spread widening
    console.log("\nEffective spread widening from inventory (|q|=500):");
    console.log("δ_min(bps)\tγ_mid effect\tγ_high effect");
    
    for (const d of DELTA_MIN_BPS.slice(0, 5)) {
      const k = mapK(d);
      const sigma2tau = (d / 10000) * (d / 10000);
      
      const dMid = deltaStarAS(GAMMAS.mid, k, sigma2tau) * 1e4;
      const dHigh = deltaStarAS(GAMMAS.high, k, sigma2tau) * 1e4;
      const rMid = Math.abs(reservationAdjustment(500, GAMMAS.mid, sigma2tau)) * 1e4;
      const rHigh = Math.abs(reservationAdjustment(500, GAMMAS.high, sigma2tau)) * 1e4;
      
      // Effective spread considers both δ* and how r shifts affect market-making
      // This is approximate - actual impact depends on order flow
      const effectMid = (dMid + 0.5 * rMid) / d;
      const effectHigh = (dHigh + 0.5 * rHigh) / d;
      
      console.log([
        d.toFixed(1),
        effectMid.toFixed(3) + "x",
        effectHigh.toFixed(3) + "x"
      ].join("\t"));
    }
  });
});
