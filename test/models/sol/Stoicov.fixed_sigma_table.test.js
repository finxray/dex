const { expect } = require("chai");

const LEVELS_BPS = [0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500];

describe("StoicovQuoter table (SIGMA_FIXED: stdev == target)", function () {
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

  it("prints Excel-style rows for mid/high gamma tiers", async function () {
    const gammaMid = await harness.gammaMidPpb();
    const gammaHigh = await harness.gammaHighPpb();

    const outRows = [];

    for (let i = 0; i < LEVELS_BPS.length; i++) {
      const d_bps = LEVELS_BPS[i];
      const k_small = 1 / d_bps; // display only (Excel)
      const invKppb = await harness.invKppbFromIdx(i);
      const oneOverK_bps = Number(invKppb) / 1e5; // PPB → bps (ppb / 1e5)

      const bucketMid = await harness.buildBucketID(i, 1, false, true, false);
      const bucketHigh = await harness.buildBucketID(i, 1, true,  true, false);

      const deltaMidBps = Number(await harness.deltaStarPrecomp(bucketMid, 0)) / 1e5;
      const deltaHighBps = Number(await harness.deltaStarPrecomp(bucketHigh, 0)) / 1e5;

      const term2MidBps = Number(await harness.term2ByGammaFromIdx(i, gammaMid)) / 1e5;
      const term2HighBps = Number(await harness.term2ByGammaFromIdx(i, gammaHigh)) / 1e5;
      const term3MidBps = term2MidBps; // equals term2 when sigma fixed at target
      const term3HighBps = term2HighBps;

      const gammaMidDisplay = (0.5 * k_small).toFixed(6);
      const gammaHighDisplay = (1.0 * k_small).toFixed(6);
      const q = 1;
      const qGamSigma2Mid = Math.round(parseFloat(gammaMidDisplay) * d_bps * d_bps);
      const qGamSigma2High = Math.round(parseFloat(gammaHighDisplay) * d_bps * d_bps);

      outRows.push(
        [d_bps, d_bps, k_small.toFixed(6), gammaMidDisplay, oneOverK_bps.toFixed(2), term2MidBps.toFixed(2), term3MidBps.toFixed(2), deltaMidBps.toFixed(2), q, String(qGamSigma2Mid), (2*deltaMidBps).toFixed(2)],
        [d_bps, d_bps, k_small.toFixed(6), gammaHighDisplay, oneOverK_bps.toFixed(2), term2HighBps.toFixed(2), term3HighBps.toFixed(2), deltaHighBps.toFixed(2), q, String(qGamSigma2High), (2*deltaHighBps).toFixed(2)],
      );
    }
    renderTable(outRows);
  });
});


