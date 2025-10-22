#!/usr/bin/env python3

"""
Stoicov (Avellaneda–Stoikov) Taylor-approx simulation to mirror the Excel sheet and
exercise gamma scaling and inventory handling.

Model:
  r = S - q * gamma * sigma^2 * tau
  delta* ~= 1/k - gamma/(2 k^2) + (gamma * sigma^2 * tau)/2

Conventions:
  - level_bps ∈ {0.5, 1, 2.5, ..., 500}
  - k = round(10000 / level_bps)
  - sigma = stdev_bps / 10000
  - gamma = gammaScale * k  (gammaScale ∈ {0, 0.25, 0.5, 1})
  - tau default = 1 (per-horizon variance)

Inventory modes:
  - 00: no_inventory            -> q = 0
  - 01: risky0_zero             -> q = inventory0 (shares of asset0)
  - 10: risky1_zero             -> q = inventory1 / midPrice (convert to asset0 shares)
  - 11: value_neutral           -> q = inventory0 - inventory1 / midPrice

Example run at the bottom prints the 30 bps level for gammaScale ∈ {0, 0.5, 1}
and severities s ∈ {0, 0.5, 1} using a convenience severity->q mapping:
  q(s) = s / (gamma * sigma * tau), which yields |reservation shift| = s * sigma.
This mapping decouples numeric inventory units from the example and shows the
impact cleanly across gamma levels.
"""

from dataclasses import dataclass
from typing import Tuple, Literal, Iterable


InventoryMode = Literal["no_inventory", "risky0_zero", "risky1_zero", "value_neutral"]


def k_from_level_bps(level_bps: float) -> int:
    return max(1, round(10000.0 / level_bps))


def sigma_from_stdev_bps(stdev_bps: float) -> float:
    return stdev_bps / 10000.0


def gamma_from_scale(scale: float, k: int) -> float:
    # Match Excel: gamma = scale × (1 / δ_min_bps) = scale × k_small
    # Since k_small ≈ k for our discrete levels, this mirrors the sheet's growth with 1/δ.
    return scale * float(k)


def delta_star_taylor(k: int, gamma: float, sigma: float, tau: float = 1.0) -> float:
    inv_k = 1.0 / float(k)
    term2 = gamma / (2.0 * float(k) * float(k))
    term3 = (gamma * sigma * sigma * tau) / 2.0
    return inv_k - term2 + term3


def q_from_balances(mode: InventoryMode, inventory0: float, inventory1: float, mid_price: float) -> float:
    if mode == "no_inventory":
        return 0.0
    if mode == "risky0_zero":
        return inventory0
    if mode == "risky1_zero":
        return inventory1 / mid_price
    if mode == "value_neutral":
        return inventory0 - (inventory1 / mid_price)
    raise ValueError("unknown inventory mode")


def reservation_shift(q_shares: float, gamma: float, sigma: float, tau: float = 1.0) -> float:
    # Shift added to mid to get reservation price r
    return - q_shares * gamma * sigma * sigma * tau


def quotes(mid_price: float, delta_star: float, r_shift: float) -> Tuple[float, float]:
    r_price = mid_price + r_shift
    return (r_price - delta_star * mid_price, r_price + delta_star * mid_price)


def render_table(rows: Iterable[Tuple[str, ...]], headers: Tuple[str, ...]) -> None:
    # Simple fixed-width table without external deps
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))
    def fmt_row(vals):
        return " | ".join(val.ljust(col_widths[i]) for i, val in enumerate(vals))
    sep = "-+-".join("-" * w for w in col_widths)
    print(fmt_row(headers))
    print(sep)
    for row in rows:
        print(fmt_row(row))


def scenario_table(level_bps: float, sigma_mults=(0.5, 1.0, 2.0), gamma_scales=(0.0, 0.5, 1.0), severities=(0.0, 0.5, 1.0), tau: float = 1.0) -> None:
    k = k_from_level_bps(level_bps)
    base_sigma = sigma_from_stdev_bps(level_bps)
    headers = ("level_bps", "σ_bps", "γ_scale", "s", "δ*_bps", "shift_bps", "bid_off_bps", "ask_off_bps", "spread_bps")
    rows = []
    for m in sigma_mults:
        sigma = base_sigma * m
        stdev_bps = level_bps * m
        for gs in gamma_scales:
            gamma = gamma_from_scale(gs, k)
            delta = delta_star_taylor(k, gamma, sigma, tau)
            delta_bps = delta * 1e4
            for s in severities:
                q = 0.0 if gamma == 0 else s / (gamma * sigma * tau)
                shift = reservation_shift(q, gamma, sigma, tau)  # negative for undesired inventory
                shift_bps = shift * 1e4
                # Offsets from mid in bps
                bid_off = (-delta + shift) * 1e4
                ask_off = ( delta + shift) * 1e4
                spread_bps = 2 * delta_bps
                rows.append((
                    f"{level_bps:.1f}",
                    f"{stdev_bps:.1f}",
                    f"{gs:.2f}",
                    f"{s:.1f}",
                    f"{delta_bps:,.2f}",
                    f"{shift_bps:,.2f}",
                    f"{bid_off:,.2f}",
                    f"{ask_off:,.2f}",
                    f"{spread_bps:,.2f}",
                ))
    render_table(rows, headers)


def example_30bps(gamma_scales=(0.0, 0.5, 1.0), tau: float = 1.0) -> None:
    print("\n=== 30 bps scenarios (σ multipliers 0.5x/1x/2x, γ_scales 0/0.5/1, s=0/0.5/1) ===")
    scenario_table(30.0, (0.5, 1.0, 2.0), gamma_scales, (0.0, 0.5, 1.0), tau)


if __name__ == "__main__":
    example_30bps()
