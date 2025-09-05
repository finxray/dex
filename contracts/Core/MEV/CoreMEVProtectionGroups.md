# Core-Level MEV Protection Groups

## Implementation Philosophy: Trader Risk = Trader Choice

**Key Insight**: MEV attacks primarily harm **traders**, not LPs. Therefore, MEV protections should be **trader-controlled** rather than pool-level restrictions.

**Architecture Decision**: 
- **LP-controlled** (via `markings`): Pool behavior settings that affect poolID
- **Trader-controlled** (via `traderProtection` flags): MEV protections that traders opt into

---

## ✅ IMPLEMENTED: Group C - Mempool Protection (Commit-Reveal)
**Status**: Production ready with gas testing
**Storage**: Commit hashes and nonce tracking in `PoolManagerStorage.commitData`
**Gas Impact**: 
- Disabled: 0 additional gas (87,550 baseline maintained)
- Enabled: +82% overhead (159,346 total) for perfect frontrun immunity

**Features Implemented**:
- ✅ #19: Commit-reveal swaps (two-phase execution)
- **Files**: `CommitRevealLib.sol`, `commitSwap()`, `executeCommittedSwap()`
- **Testing**: Comprehensive gas comparison vs normal swaps

**Why PoolManager Level**: 
- Needs persistent storage for commitments and nonces
- Requires transaction context (msg.sender, block.number)
- Trader-controlled via separate functions (not pool settings)

---

## PENDING GROUPS:

## Group A: Volume & Rate Limiting → **MOVED TO QUOTER LEVEL**
**Status**: Moved to `/contracts/Peripheral/quoters/real/VolumeControlLib.sol`
**Rationale**: Can be implemented in quoters if QuoteParams extended with msg.sender
**Features**: #5 (volume throttle), #6 (cooldowns), #13 (address rate limiting)
**See**: `/contracts/Peripheral/quoters/real/MEVProtectionQuoters.md`

## Group B: Access Control & Permissions
**Storage**: Address whitelists and signature validation
**Gas when disabled**: 0 (marking bit check only)
**Features**:
- #9: RFQ/permit quotes (signature verification)
- #16: Private relay enforcement (whitelist relayers)

**Why PoolManager Level**: Needs signature validation and persistent whitelist storage

## Group D: Atomic Execution & Settlement  
**Storage**: Leverages existing FlashAccounting + minimal additions
**Gas when disabled**: 0 (uses existing session logic)
**Features**:
- #8: Session-only swaps (force flash session usage)
- #18: Batch-only settlement window (accumulate + settle once)

**Why PoolManager Level**: Integrates with existing FlashAccounting session management

## Group E: Emergency Controls & Circuit Breakers
**Storage**: Per-pool pause/emergency state + backrun detection
**Gas when disabled**: 0 (marking bit check only)
**Features**:
- #17: No-arb band with auto-pause (pause on price deviation)
- #12: Block-local backrun capture (post-trade validation + value redirect)

**Why PoolManager Level**: Needs persistent pause state and post-trade validation hooks

---

## Design Principles Validated:

✅ **Zero overhead when disabled** - Normal swaps unchanged at 87,550 gas
✅ **Trader choice** - Protection via `traderProtection` flags, not pool restrictions  
✅ **Backward compatibility** - All existing functionality preserved
✅ **Gas efficiency** - Minimal storage, efficient validation
✅ **Composability** - Works with multi-pool routing and FlashAccounting

## Implementation Architecture:
- **SwapParams.traderProtection** - 4-byte flags for trader-controlled features
- **Library pattern** - Following existing PoolManagerLib approach for gas efficiency
- **Shared storage** - Each group extends PoolManagerStorage with minimal additions
- **Conditional execution** - Feature logic only runs when flags are set

## Next Implementation Priority:
Groups B, D, or E based on trader protection requirements and MEV threat landscape.