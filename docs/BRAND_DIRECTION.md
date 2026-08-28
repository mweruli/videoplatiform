# Brand Direction

Reference given by the PM: [alexiuminternational.com](https://alexiuminternational.com/) — "the colors and looks." Company is **Miles Tech** (an earlier placeholder name from initial scaffolding has been corrected everywhere and should not reappear in the product or docs).

The reference is a B2B materials-science site — don't clone its layout or copy, which won't fit a consumer-facing, mobile-first, video-heavy marketplace. What to actually carry over is the **palette, type pairing, and section rhythm**, adapted for touch, scroll, and video.

## Palette (extracted from the reference, as HSL — convert to Tailwind tokens)

| Token | Value | Role |
|---|---|---|
| `primary` (deep navy) | `hsl(220 55% 12%)` ≈ `#0E1729` | Dark surfaces, header/footer, primary text on light |
| `primary-foreground` (ice white) | `hsl(200 100% 97%)` ≈ `#F0FAFF` | Text/icons on dark surfaces |
| `accent` (amber/gold) | `hsl(42 95% 58%)` ≈ `#FABD2E` | Primary CTAs, highlighted words, active states, sponsored/featured markers |
| `background` (near-white) | `hsl(210 40% 99%)` | Default light page background |
| `secondary` (light panel) | `hsl(215 30% 96%)` ≈ `#F2F4F8` | Alternating section backgrounds, cards on light |
| `muted-foreground` (gray-blue) | `hsl(215 16% 42%)` ≈ `#5B6B7D` | Secondary/body text on light |
| `border` | `hsl(214 25% 91%)` ≈ `#E1E6ED` | Hairlines, card borders |
| Hero gradient | `radial-gradient(ellipse at top right, hsl(195 80% 28%), hsl(220 60% 10%) 55%, hsl(222 70% 6%) 100%)` | Dark hero/CTA sections — a teal glow fading into navy/black |

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

## Open question for the PM

The reference's amber is fairly saturated and works against a very dark navy. If Miles Tech's own brand has an existing logo or color already in use elsewhere (business cards, an existing site, socials), flag it now — this direction assumes we're picking colors from scratch based on the reference alone.
