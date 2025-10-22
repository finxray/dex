#!/usr/bin/env python3

"""
Replicate the Excel table exactly:

Columns:
  Min Target | stD | k | gamma | 1/k | +gam/(2*k^2) | +(gam*stD^2)/2 | optimal half spread | q (inventory) | q*gam*stD^2 | SPREAD

Conventions (match the Excel screenshot):
  - Units are in bps for Min Target and stD; k is the small-k: k_small = 1 / (δ_bps)
  - gamma = gammaScale * k_small
  - 1/k = δ_bps
  - term2 = gamma / (2 * k_small^2)
  - term3 = (gamma * stD_bps^2) / 2
  - δ*_approx = 1/k − term2 + term3
  - q (inventory) = 1
  - q*gamma*stD^2 = gamma * stD_bps^2
  - SPREAD = 2 * δ*_approx

This matches the identity when stD_bps = Min Target and gammaScale=1:
  term2 = term3 = δ_bps / 2  ⇒  δ* = δ_bps, SPREAD = 2*δ_bps
"""

from typing import List, Tuple


LEVELS_BPS: List[float] = [
    0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500,
]


def build_rows(gamma_scale: float = 1.0, stdev_equals_target: bool = True) -> List[Tuple[str, ...]]:
    rows: List[Tuple[str, ...]] = []
    for d_bps in LEVELS_BPS:
        stdev_bps = d_bps if stdev_equals_target else d_bps
        k_small = 1.0 / d_bps
        gamma = gamma_scale * k_small
        inv_k = 1.0 / k_small  # equals d_bps
        term2 = gamma / (2.0 * k_small * k_small)
        term3 = (gamma * (stdev_bps ** 2)) / 2.0
        delta_star = inv_k - term2 + term3
        q = 1.0
        q_gamma_sigma2 = gamma * (stdev_bps ** 2)
        spread = 2.0 * delta_star

        # Format to match sheet look-and-feel
        rows.append(
            (
                f"{d_bps:g}",
                f"{stdev_bps:g}",
                f"{k_small:.6f}",
                f"{gamma:.6f}",
                f"{inv_k:.2f}",
                f"{term2:.2f}",
                f"{term3:.2f}",
                f"{delta_star:.2f}",
                f"{q:g}",
                f"{q_gamma_sigma2:.0f}",
                f"{spread:,.2f}",
            )
        )
    return rows


def render_table(rows: List[Tuple[str, ...]]) -> None:
    headers = (
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
    )
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))
    def fmt_row(vals):
        return " | ".join(val.rjust(col_widths[i]) for i, val in enumerate(vals))
    sep = "-+-".join("-" * w for w in col_widths)
    print(fmt_row(headers))
    print(sep)
    for row in rows:
        print(fmt_row(row))


def main() -> None:
    rows = build_rows(gamma_scale=1.0, stdev_equals_target=True)
    render_table(rows)


if __name__ == "__main__":
    main()
