# External Setup Checklist

Accounts and services the **PM** needs to create before later sprints can proceed for real. Nothing here is required to run the local dev skeleton (docker-compose self-hosts Postgres/Redis/Meilisearch and the backend runs against console-logged OTP), but each one below blocks a specific sprint if it isn't in place ahead of time. Ordered roughly by lead time / urgency.

## 1. Safaricom Daraja API — HIGHEST LEAD TIME, START NOW

- **What it's for**: M-Pesa payments for ad campaigns (Fast-follow, Weeks 13–18 per `DEVELOPMENT_PLAN.md`).
- **Why now**: Business approval for production Daraja access has historically taken weeks, independent of how simple the integration is. Applying in Sprint 1 (Week 1–2) is what keeps this off the critical path for Weeks 13–18.
- **What to do**: Register at https://developer.safaricom.co.ke, create a sandbox app (instant) for dev/testing, and submit the **production (Go Live)** application in parallel — it needs business registration documents, a paybill/till number, and Safaricom's review.
- **Tier**: Sandbox is free. Production requires an active paybill/till (short code) — confirm Alfabiz.AI already has one or needs to acquire it, since that itself has lead time.

## 2. Managed video API — Cloudflare Stream or Bunny Stream

- **What it's for**: Video upload, transcoding, adaptive playback and the Shorts feed (Sprint 3, Weeks 5–6). Per the development plan, we do not build in-house transcoding/CDN.
- **What to do**: Pick one — Cloudflare Stream is simpler to bundle with Cloudflare DNS/CDN/WAF (item 6 below) under one account; Bunny Stream is often cheaper at higher storage/minutes-watched volume. Create the account and generate an API token/key for the Backend Engineer.
- **Tier**: Start on pay-as-you-go (per-minute-stored + per-minute-delivered pricing on both). No need to commit to a plan tier before knowing real usage; revisit after the 30–50 launch businesses are onboarded.

## 3. Object storage — Cloudflare R2 or DO Spaces

- **What it's for**: Images (product photos, company logos/covers) and non-video documents. S3-compatible.
- **What to do**: Create a bucket. If Cloudflare Stream was chosen in item 2, Cloudflare R2 keeps billing/account surface in one place (and has no egress fees). If DigitalOcean App Platform is chosen for hosting (item 7), DO Spaces is the natural pairing instead.
- **Tier**: Smallest available tier; storage needs are modest until product/company content volume grows.

## 4. Meilisearch — confirm self-hosting in production, or Meilisearch Cloud

- **What it's for**: Search & discovery (Sprint 4, Weeks 7–8) — keyword search across products, companies, videos, education content.
- **What to do**: Local dev already self-hosts Meilisearch via Docker Compose at no cost. Decide before Sprint 4 whether production also self-hosts it (on the same PaaS/VM, with its own backup/upgrade discipline) or moves to Meilisearch Cloud (managed, less ops burden, has a cost). Given the "buy, don't build" preference in the development plan and a 5-person team, Meilisearch Cloud is the recommended default unless there's a strong cost reason to self-host in production.
- **Tier**: Meilisearch Cloud's smallest paid tier is sufficient at launch scale (tens of thousands of documents).

## 5. Sentry

- **What it's for**: Error monitoring for both the FastAPI backend and the React frontend.
- **What to do**: Create an organization/project (one project per app, or one project with both — Backend Engineer's call once wired in). Generate a DSN for each.
- **Tier**: Free Developer tier covers Sprint 1–2 volume comfortably; revisit before public launch (Week 12).

## 6. Hosting — DigitalOcean App Platform or Render

- **What it's for**: Staging and production deployment of the backend, frontend, and managed Postgres/Redis (or bring-your-own if self-hosting those in containers — App Platform/Render both offer managed Postgres add-ons, which is the recommended path over self-managing DB infra).
- **What to do**: Create the account and, once Sprint 1 CI is green, connect the repo for a staging environment. Decide App Platform vs Render — both fit the "PaaS, not Kubernetes" call in the development plan; pick based on whichever the PM already has billing/familiarity with, there's no strong technical reason to prefer one over the other at this scale.
- **Tier**: Smallest tier with autoscaling available (both platforms' basic/starter app tiers); managed Postgres smallest tier with daily backups enabled.

## 7. Cloudflare — DNS / CDN / WAF

- **What it's for**: DNS for the production domain, CDN caching for static assets, and basic WAF/DDoS protection in front of the hosted app.
- **What to do**: Add the domain to a Cloudflare account (free plan is enough at launch) and point nameservers at Cloudflare once a domain is confirmed. If Cloudflare Stream/R2 were chosen in items 2–3, this is the same account.
- **Tier**: Free plan is sufficient for Phase 1a; WAF managed rules can be added on the Pro tier closer to public launch if abuse/bot traffic becomes a problem.

## Not needed yet

- **UptimeRobot** (or similar) — mentioned in the development plan's infra list, but only matters once staging/production is actually deployed (item 6). Low effort, can be set up same day as hosting.
- **Native app store accounts** — Phase 2+, not Phase 1.
