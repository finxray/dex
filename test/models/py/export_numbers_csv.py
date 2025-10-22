#!/usr/bin/env python3

"""
Generate an Excel-style table as CSV that opens cleanly in Apple Numbers.

Columns:
  Min Target, stD, k, gamma, 1/k, +gam/(2*k^2), +(gam*stD^2)/2,
  optimal half spread, q (inventory), q*gam*stD^2, SPREAD

Conventions (matching our StoicovQuoter/Excel logic):
  - Levels in bps: [0.5 .. 500]
  - k_small = 1 / δ_bps
  - gamma = gammaScale * k_small (default gammaScale=1.0)
  - stD = δ_bps (fixed, to mirror the screenshot)
  - δ*_approx = 1/k − gamma/(2*k^2) + (gamma * stD^2)/2
  - q = 1
  - SPREAD = 2 * δ*_approx
"""

import csv
from pathlib import Path


LEVELS_BPS = [
    0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500,
]


def build_rows(gamma_scale: float = 1.0):
    rows = []
    for d_bps in LEVELS_BPS:
        stdev_bps = d_bps
        k_small = 1.0 / d_bps
        gamma = gamma_scale * k_small
        inv_k = 1.0 / k_small  # equals d_bps
        term2 = gamma / (2.0 * k_small * k_small)
        term3 = (gamma * (stdev_bps ** 2)) / 2.0
        delta_star = inv_k - term2 + term3
        q = 1.0
        q_gamma_sigma2 = gamma * (stdev_bps ** 2)
        spread = 2.0 * delta_star

        rows.append([
            d_bps,
            stdev_bps,
            round(k_small, 6),
            round(gamma, 6),
            round(inv_k, 2),
            round(term2, 2),
            round(term3, 2),
            round(delta_star, 2),
            int(q),
            int(round(q_gamma_sigma2)),
            round(spread, 2),
        ])
    return rows


def main():
    out_dir = Path("tables")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "stoicov_numbers.csv"

    headers = [
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
    ]

    rows = build_rows(gamma_scale=1.0)
    with out_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    print(f"Wrote {out_path.resolve()}")


if __name__ == "__main__":
    main()


