"""Placeholder pricing for Phase 1b's self-serve advertiser campaign manager.

Single source of truth for the CPM rate and the minimum top-up amount —
mirrors app/core/featured_pricing.py's own "one dict/one constant, deliberately
round/fake numbers" pattern exactly, for the same reason: the PM has not
supplied real commercial ad pricing yet, so changing it later is "edit this
file," not a hunt through endpoint/service code for magic numbers.

**Why CPM-only for v1 (no CPC) — see docs/decisions.md for the full writeup,
summarized here for anyone reading just this module**: a click is trivial to
fabricate (a bot, a competitor, or the advertiser's own script hitting the
click-report endpoint) in a way a rendered-impression batch report already
is too, but CPC billing raises the stakes of that same weakness from "a
slightly inflated impression count" to "directly and repeatedly charging an
advertiser's budget for clicks nobody genuinely made" — real CPC billing
needs click-fraud resistance (rate limiting per viewer/session, IP/device
heuristics, delayed/batched billing with a dispute window, possibly a
server-side redirect-and-verify click path instead of a client-reported
batch) that is a materially bigger scope than this round. Clicks are still
recorded (`Campaign.click_count`, via `POST /campaigns/clicks`) for CTR/
analytics reporting per PROJECT_BRIEF.md's Advertising Analytics bullet —
only *billing* on clicks is deferred.

`CPM_KES` is a platform-wide flat rate, not an advertiser-chosen bid — see
docs/decisions.md for why: a real bidding/auction mechanism is Phase 2+
scope (this project's own "buy, don't build" / smallest-thing-that-ships
posture), and a flat rate keeps the budget-depletion mechanic (the PM's
explicit ask for this round) simple to reason about and to bill atomically.
`Campaign.cpm_kes` snapshots this value at campaign-creation time — exactly
like `FeaturedPurchase.amount_kes`/`duration_days` snapshot
`FEATURED_PRICING` — so a future rate change never retroactively alters an
already-running campaign's economics.
"""

from __future__ import annotations

from decimal import Decimal

# --- PLACEHOLDER / TEST PRICING — not real commercial numbers. ---
# Change here, and only here, once the PM supplies real client pricing.

# KES per 1,000 impressions. Chosen to land on a clean per-impression cost
# (500 / 1000 = 0.50 KES/impression) — same "obviously round test number"
# spirit as FEATURED_PRICING's 500/1,500 KES tiers, and on the same order of
# magnitude (a business's whole ad budget and a week of featured placement
# should feel comparable, not wildly different, since the PM will eventually
# price both from the same commercial conversation).
CPM_KES = Decimal("500.00")

# Cost per impression a campaign created *right now* would lock in (what a
# new-campaign form should display before submit). NOT what the atomic
# deduction in app/services/campaign_billing.py bills — that function
# correctly reads each row's own already-snapshotted `Campaign.cpm_kes`
# (divided by 1,000) instead, so a rate change here never retroactively
# alters an already-running campaign's economics. An earlier version of
# that function billed this constant directly, silently defeating the
# snapshot's whole purpose — fixed; see campaign_billing.py's docstring.
COST_PER_IMPRESSION_KES = CPM_KES / Decimal(1000)

# Smallest top-up a CampaignFunding transaction will accept. Exists purely to
# stop an advertiser (or a buggy client) from spamming Safaricom OAuth/STK
# Push calls with e.g. a 1-shilling top-up that could never even buy 3 full
# impressions at the current CPM — not a revenue/business decision, just
# operational sanity. Cheap to raise/lower later; it's one constant.
MIN_FUNDING_KES = Decimal("200.00")
