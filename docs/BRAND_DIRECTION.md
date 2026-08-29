# Brand Direction

Reference given by the PM: [alexiuminternational.com](https://alexiuminternational.com/) — "the colors and looks." Company is **Miles Tech** (an earlier placeholder name from initial scaffolding has been corrected everywhere and should not reappear in the product or docs).

The reference is a B2B materials-science site — don't clone its layout or copy, which won't fit a consumer-facing, mobile-first, video-heavy marketplace. What to actually carry over is the **palette, type pairing, and section rhythm**, adapted for touch, scroll, and video.

## Palette (v2 — Egyptian Blue confirmed by the owner, 2026-08-29)

**Update:** the owner has confirmed **Egyptian Blue** (`#1034A6` / `hsl(226 82% 36%)`) as the brand's blue — one of the oldest known synthetic pigments, a vivid, saturated ultramarine-leaning blue. This **replaces the deep-navy `primary` brand-blue role** below (logo/brand-lockup color, hero gradient, active/selected states, links, key brand moments) — it is bolder and more vivid than the Alexium-derived navy, a deliberate shift away from that reference's moodier, near-black feel.

Important nuance for whoever applies this: Egyptian Blue is a mid-tone, highly saturated color (36% lightness) — it is **not** dark enough to serve as an actual dark-mode background/surface color the way the old navy did double duty. Keep a separate, genuinely dark neutral (`ink`, below) for real dark surfaces/backgrounds, and reserve Egyptian Blue for brand moments, accents, and gradients where its vividness is the point. Do not mechanically find-and-replace the old navy hex everywhere — that will break dark-surface contrast.

| Token | Value | Role |
|---|---|---|
| `brand-blue` (Egyptian Blue) | `hsl(226 82% 36%)` ≈ `#1034A6` | **New primary brand color** — logo/brand lockup, hero gradient, active/selected states, links, key brand accents |
| `ink` (near-black, blue-tinted) | `hsl(226 45% 8%)` ≈ `#0A0F1C` | Actual dark surfaces/backgrounds, header/footer on dark — kept separate from `brand-blue` since Egyptian Blue is too light/saturated to use as a background |
| `primary-foreground` (ice white) | `hsl(200 100% 97%)` ≈ `#F0FAFF` | Text/icons on dark surfaces |
| `accent` (amber/gold) | `hsl(42 95% 58%)` ≈ `#FABD2E` | Unchanged — primary CTAs, highlighted words, sponsored/featured markers. Still works against Egyptian Blue; re-check contrast once applied |
| `background` (near-white) | `hsl(210 40% 99%)` | Default light page background |
| `secondary` (light panel) | `hsl(215 30% 96%)` ≈ `#F2F4F8` | Alternating section backgrounds, cards on light |
| `muted-foreground` (gray-blue) | `hsl(215 16% 42%)` ≈ `#5B6B7D` | Secondary/body text on light |
| `border` | `hsl(214 25% 91%)` ≈ `#E1E6ED` | Hairlines, card borders |
| Hero gradient | `radial-gradient(ellipse at top right, hsl(226 82% 36%), hsl(226 60% 14%) 55%, hsl(226 70% 6%) 100%)` | Dark hero/CTA sections — now built from Egyptian Blue fading into the new `ink`, replacing the old teal-to-navy blend |

Both light and dark themes should be built from these as tokens, not hardcoded per-component — see the Frontend Engineer's craft-bar note in `.claude/agents/frontend-engineer.md`.

## Type

- **Display/headings**: Space Grotesk, bold (700) — used for big, confident headlines, one phrase per headline highlighted in the amber accent color.
- **Body/UI**: Inter — clean, highly legible at small sizes, good for dense data (product specs, comparison tables, search results).

## Patterns worth carrying over

- **Alternating rhythm**: dark hero/CTA sections (navy gradient with subtle glow/grid texture) alternating with light content sections (near-white/pale gray-blue) — gives the product a confident, high-production feel rather than an endless flat scroll.
- **Uppercase eyebrow labels** with letter-spacing and a small amber dot, above section headings.
- **Pill-shaped buttons**: amber-filled primary CTA, dark-outlined secondary — both with a small arrow glyph on hover/default for "go forward" actions.
- **Bold stat callouts**: big amber numbers with a small uppercase caption underneath (adapt this for e.g. platform stats, business dashboard KPIs).
- **Rounded image cards with bottom-left label overlay** — a strong pattern for product/video thumbnails in a grid.

## What NOT to carry over

- The reference is a static B2B marketing site — this product is a scrollable, touch-first, video-heavy consumer app. Don't import its desktop-first layout thinking; every pattern above needs a mobile-first, thumb-driven adaptation (e.g. the vertical Shorts feed is nothing like a marketing hero — design that on its own terms, using the same palette/type system).
- Don't literally copy Alexium's copywriting, imagery, or layout structure — only the color system, type pairing, and the *rhythm* of dark/light sections and component shapes described above.

## Resolved

~~Open question about an existing brand color~~ — resolved 2026-08-29: owner confirmed Egyptian Blue as the brand's blue (see Palette v2 above).
