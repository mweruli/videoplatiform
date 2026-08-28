# Frontend — Miles Tech Video Discovery Platform

React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query. See the [root README](../README.md) for how to run the full stack, and [`docs/DEVELOPMENT_PLAN.md`](../docs/DEVELOPMENT_PLAN.md) for scope/sprint context.

## Structure

- `src/pages/` — one file per route (`Home`, `Search`, `VideoFeed`, `BusinessDashboard`, `Admin`). Sprint 1 ships stubs; each is built out in the sprint noted in its file comment.
- `src/components/` — shared UI (currently just `Layout`, the nav shell).
- `src/lib/api.ts` — the only place that talks to the backend (`fetch` wrapper + typed helpers). Add new endpoint calls here, not ad hoc `fetch` in components.
- `src/lib/queryClient.ts` — shared TanStack Query client.
- `src/styles/index.css` — Tailwind v4 entry point + starter design tokens (`@theme` block). The UI/UX Designer owns the real design system.

## Commands

```bash
npm install       # install deps
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # type-check + production build
npm run lint      # oxlint
npm run preview   # preview a production build locally
```

## Config

Copy `.env.example` to `.env`. `VITE_API_BASE_URL` must point at the running backend (defaults to `http://localhost:8000`).
