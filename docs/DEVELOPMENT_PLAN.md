# Development Plan — Phase 1 (v1)

Source: sequenced from the approved proposal. See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the full product scope. Full visual version: https://claude.ai/code/artifact/f62c7e47-f845-4148-accd-0a754518ebce

## Reality check

The proposal's Phase 1 list has 15 modules. Built properly, that's a 5–6 month scope for a small team, not 3. Phase 1 is split into:

- **Phase 1a — core loop (Weeks 1–12)**: what this team is building now, and what launch runs on.
- **Phase 1b — fast-follow (Weeks 13–18)**: completes the rest of Phase 1 before Phase 2 begins.

Nothing from the proposal is dropped — it's resequenced by what a launch actually needs on day one.

## Team

Roles: Tech Lead / Full-stack, Backend Engineer, Frontend Engineer, UI/UX Designer, QA Engineer. Working as Claude Code subagents defined in `.claude/agents/`, coordinated by the PM (project owner) through the orchestrating session. See [TEAM.md](TEAM.md) for how the team operates.

The owner wants a modern, highly interactive UI — the Frontend Engineer and UI/UX Designer roles are held to a higher craft bar than a typical CRUD build.

## Tech stack

- **Frontend**: React 18 + Vite, TypeScript, TanStack Query, Tailwind CSS.
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0 + Alembic, PostgreSQL, Redis, arq/Celery for async jobs.
- **Search**: Meilisearch (not Elasticsearch — lower ops overhead at MVP scale).
- **Video & media**: managed video API (Cloudflare Stream or Bunny Stream — do not build in-house transcoding/CDN) + object storage (Cloudflare R2 / DO Spaces) for images.
- **Auth & payments-readiness**: JWT sessions, phone/email OTP, M-Pesa Daraja API (apply early — approval lead time is the bottleneck, not the integration).
- **Infra**: Docker, GitHub Actions CI/CD, DigitalOcean App Platform or Render, Cloudflare (DNS/CDN/WAF), Sentry + UptimeRobot.

## Architecture

Client (React web app, responsive, mobile-first; admin/business dashboard is the same app, role-gated) → FastAPI services (Auth, Business/Product, Search, Video, Ads & placements, Moderation, Admin & analytics) → Data & media layer (PostgreSQL, Redis, Meilisearch, object storage, managed video API). Cross-cutting: CI/CD, monitoring, RBAC (7 roles per Project Brief).

API-first from day one so native apps can plug into the same backend later without a rebuild.

## Scope: what ships in 12 weeks

**Must-ship (Weeks 1–12)**
- Registration & login (email/phone OTP)
- Business registration + manual verification
- Company profiles & product/service listings
- Video upload & playback (managed API), Shorts-style feed
- Category framework (18 categories, admin-editable)
- Keyword search + filters (category, location, price)
- Manual product comparison (2–3 items, side by side)
- Manual moderation queue (pending / approved / rejected)
- Manual "featured" placement, clearly labelled sponsored
- Admin dashboard: users, businesses, listings, moderation
- Core analytics: views, search appearances, basic counts
- Rule-based recommendations: trending + related-by-category

**Fast-follow (Weeks 13–18)**
- M-Pesa self-serve payments for ads
- Self-serve advertiser campaign manager
- AI-assisted moderation (pilot)
- Automated content categorisation
- Advanced business analytics dashboard
- Creator management system, licensing workflow

**Phase 2 / 3 (Month 5+)**
- Personalised feeds, advanced recommendation engine
- Voice & natural-language search
- AI-driven product discovery
- Native mobile apps
- Stadium / exhibition / billboard advertising marketplace

## Sprint plan

| Weeks | Sprint | Focus |
|---|---|---|
| 1–2 | 1 | Foundations — repo, CI/CD, environments, DB schema v1, auth (OTP/JWT), 18 categories seeded |
| 3–4 | 2 | Business & product core — registration, verification, listing CRUD, admin dashboard v1 |
| 5–6 | 3 | Video — managed video API upload/playback, video↔listing association, Shorts feed, moderation queue extended |
| 7–8 | 4 | Search & discovery — Meilisearch integration, unified results page, location/price/category filters, manual comparison |
| 9–10 | 5 | Advertising, analytics & homepage — featured flag, trending/related widgets, view counters, homepage assembly |
| 11–12 | 6 | Hardening & launch — QA/security pass, legal (ToS/privacy/takedown/DPA), onboard 30–50 launch businesses, beta → public launch |

## Risks

| Risk | Mitigation |
|---|---|
| Two-sided cold start (no businesses ↔ no users) | Sales-led onboarding of 30–50 businesses before public launch |
| M-Pesa approval lead time | Apply Week 1; sell first placements manually/invoiced until Phase 1b |
| Content & moderation liability | Manual review before publish at launch scale; published takedown process; ToS reviewed by counsel |
| Video cost at scale | Managed video API with usage dashboards from day one; monitor cost-per-view monthly |
| Scope creep back into 15 modules | Anything not in "must-ship" is fast-follow or later — no exceptions without moving the launch date |

## This week

1. Confirm team tier and assign against it.
2. Open cloud, video API and Meilisearch accounts; stand up repo and CI/CD skeleton.
3. Start the M-Pesa Daraja API application.
4. Brief the designer on Sprint 1–2 screens: registration, business profile, product listing.
5. Draft ToS, privacy policy and takedown process for legal review in parallel with Sprint 1.
6. Start outreach to the first 30–50 launch businesses.
