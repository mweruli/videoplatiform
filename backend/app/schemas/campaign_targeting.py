"""`CampaignTargetingRead` — the lightweight shape embedded in
`BusinessRead.active_campaign` / `ProductRead.active_campaign` (see
docs/decisions.md's "Phase 1b design pass: self-serve advertiser campaign
manager" entry, "API surface" section).

Deliberately its own leaf module, not defined inside app/schemas/campaign.py
directly, purely to avoid a circular import: app/schemas/campaign.py's own
`CampaignRead` needs `BusinessSummary`/`ProductSummary` (from
app/schemas/business.py / app/schemas/product.py), while `BusinessRead`/
`ProductRead` in those same two modules need `CampaignTargetingRead` — if
this type lived in campaign.py, business.py and product.py would each import
campaign.py, which imports business.py and product.py right back, which
Python cannot resolve (partially-initialized module import error). This
module has zero dependencies on any of the three, so all three can import it
with no cycle. `app/schemas/campaign.py` re-exports it (`from
app.schemas.campaign_targeting import CampaignTargetingRead`) so it's still
reachable from "the campaign schemas module" as the handoff plan described,
just physically defined in its own file.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class CampaignTargetingRead(BaseModel):
    """Present on `BusinessRead.active_campaign` / `ProductRead.active_campaign`
    only when there currently exists an ACTIVE `Campaign` row targeting that
    exact business (`product_id IS NULL`) or that exact product
    (`product_id = <this product>`) — never both, never leaking onto the
    wrong target (see docs/decisions.md's ad-serving-mechanic section and
    the "bulk-loading" section for the exact query shape)."""

    model_config = ConfigDict(from_attributes=True)

    campaign_id: uuid.UUID
    category_id: int | None
    county: str | None
