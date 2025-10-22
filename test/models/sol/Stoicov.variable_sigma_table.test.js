const { expect } = require("chai");

const LEVELS_BPS = [0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500];

// Convert stdev_bps to sigma^2 * tau in PPB units the quoter expects:
function sigma2TauPpbFromStdevBps(stdev_bps) {
  const sigma_rel = stdev_bps / 1e4;
  return Math.round(sigma_rel * sigma_rel * 1e9);
}

describe("StoicovQuoter table (variable σ: stdev != target)", function () {
  let harness;

  before(async function () {
    const Factory = await ethers.getContractFactory("StoicovQuoterHarness");
    harness = await Factory.deploy();
    await harness.waitForDeployment();
  });

  function headers() {
    return [
      "Min Target",
      "stD",
      "k",
      "gamma",
      "1/k",
      "+gam/(2*k^2)",
      "+(gam*stD^2)/2",
      "optimal half spread",
      "q (inventory)",
      "q*gam*stD^2",
      "SPREAD",
    ];
  }

  function renderTable(rows) {
    const hdr = headers();
    const all = [hdr, ...rows];
    const widths = hdr.map((_, i) => Math.max(...all.map(r => String(r[i]).length)));
    const fmt = (r) => r.map((c, i) => String(c).padStart(widths[i], " ")).join(" | ");
    const sep = widths.map(w => "-".repeat(w)).join("-+-");
    console.log(fmt(hdr));
    console.log(sep);
    for (const r of rows) console.log(fmt(r));
  }

  it("prints rows for high gamma (scale=1.0) with stdev = 0.5x target and 2x target", async function () {
    const gammaHighScale = await harness.gammaHighScalePpb(); // Use only high scale (1.0)

    console.log("\n-- stdev = 0.5x target --");
    const outRows1 = [];
    for (let i = 0; i < LEVELS_BPS.length; i++) {
      const d_bps = LEVELS_BPS[i];
      const stdev_bps = d_bps * 0.5;
      const sigma2TauPpb = sigma2TauPpbFromStdevBps(stdev_bps);
      const k_small = 1 / d_bps;
      const invKppb = await harness.invKppbFromIdx(i);
      const oneOverK_bps = Number(invKppb) / 1e5;

      const bucketMid  = await harness.buildBucketID(i, 1, false, false, false);
      const bucketHigh = await harness.buildBucketID(i, 1, true,  false, false);

      const deltaMidBps  = Number(await harness.deltaStarPrecomp(bucketMid, sigma2TauPpb)) / 1e5;
      const deltaHighBps = Number(await harness.deltaStarPrecomp(bucketHigh, sigma2TauPpb)) / 1e5;

      const term2HighBps = Number(await harness.term2ByGammaFromIdx(i, gammaHighScale)) / 1e5;
      
      const gammaHighPpb = await harness.gammaFromScaleAndIdx(i, gammaHighScale);
      const gammaHighDisplay = (Number(gammaHighPpb) / 1e9).toFixed(6);
      
      // Fix term3 calculation: (gamma * stdev^2) / 2, in bps
      const gamma_actual = Number(gammaHighPpb) / 1e9; // Convert PPB to actual value
      const stdev_actual = stdev_bps; // stdev_bps is already the actual stdev value (1.0 for 1 bps)
      const term3HighBps = (gamma_actual * stdev_actual * stdev_actual) / 2; // Result in bps
      
      const q = 1;
      const qGamSigma2High = Math.round(gamma_actual * stdev_actual * stdev_actual); // q*gamma*stdev^2

      // Calculate correct optimal half spread = 1/k - gam/(2*k^2) + (gam*stDev^2)/2
      const correctOptimalHalfSpread = oneOverK_bps - term2HighBps + term3HighBps;
      
      // Calculate correct SPREAD = 1/k - gam/(2*k^2) + (gam*stDev^2)/2 + q*gam*stDev^2
      const correctSpread = oneOverK_bps - term2HighBps + term3HighBps + qGamSigma2High;
      
      outRows1.push(
        [d_bps, stdev_bps, k_small.toFixed(6), gammaHighDisplay, oneOverK_bps.toFixed(2), term2HighBps.toFixed(2), term3HighBps.toFixed(2), correctOptimalHalfSpread.toFixed(2), q, String(qGamSigma2High), correctSpread.toFixed(2)]
      );
    }
    renderTable(outRows1);

    console.log("\n-- stdev = 2x target --");
    const outRows2 = [];
    for (let i = 0; i < LEVELS_BPS.length; i++) {
      const d_bps = LEVELS_BPS[i];
      const stdev_bps = d_bps * 2.0;
      const sigma2TauPpb = sigma2TauPpbFromStdevBps(stdev_bps);
      const k_small = 1 / d_bps;
      const invKppb = await harness.invKppbFromIdx(i);
      const oneOverK_bps = Number(invKppb) / 1e5;

      const bucketMid  = await harness.buildBucketID(i, 1, false, false, false);
      const bucketHigh = await harness.buildBucketID(i, 1, true,  false, false);

      const deltaMidBps  = Number(await harness.deltaStarPrecomp(bucketMid, sigma2TauPpb)) / 1e5;
      const deltaHighBps = Number(await harness.deltaStarPrecomp(bucketHigh, sigma2TauPpb)) / 1e5;

      const term2HighBps = Number(await harness.term2ByGammaFromIdx(i, gammaHighScale)) / 1e5;
      
      const gammaHighPpb = await harness.gammaFromScaleAndIdx(i, gammaHighScale);
      const gammaHighDisplay = (Number(gammaHighPpb) / 1e9).toFixed(6);
      
      // Fix term3 calculation: (gamma * stdev^2) / 2, in bps
      const gamma_actual = Number(gammaHighPpb) / 1e9; // Convert PPB to actual value
      const stdev_actual = stdev_bps; // stdev_bps is already the actual stdev value (1.0 for 1 bps)
      const term3HighBps = (gamma_actual * stdev_actual * stdev_actual) / 2; // Result in bps
      
      const q = 1;
      const qGamSigma2High = Math.round(gamma_actual * stdev_actual * stdev_actual); // q*gamma*stdev^2

      // Calculate correct optimal half spread = 1/k - gam/(2*k^2) + (gam*stDev^2)/2
      const correctOptimalHalfSpread = oneOverK_bps - term2HighBps + term3HighBps;
      
      // Calculate correct SPREAD = 1/k - gam/(2*k^2) + (gam*stDev^2)/2 + q*gam*stDev^2
      const correctSpread = oneOverK_bps - term2HighBps + term3HighBps + qGamSigma2High;
      
      outRows2.push(
        [d_bps, stdev_bps, k_small.toFixed(6), gammaHighDisplay, oneOverK_bps.toFixed(2), term2HighBps.toFixed(2), term3HighBps.toFixed(2), correctOptimalHalfSpread.toFixed(2), q, String(qGamSigma2High), correctSpread.toFixed(2)]
      );
    }
    renderTable(outRows2);
  });
});


