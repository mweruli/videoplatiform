/**
 * Shared "out-of-focus video still" treatment for every product/video
 * thumbnail placeholder, ported from the approved prototype
 * (docs/design/prototype-v1.html, .grad-0….grad-5). Real photography/video
 * stills replace these once media upload lands — see Thumb.tsx.
 */
export const GRAIN_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export const THUMB_GRADIENTS: string[] = [
  // grad-0 — teal/cyan
  'radial-gradient(circle at 78% 18%, rgba(56,190,224,.55) 0%, transparent 42%), radial-gradient(circle at 14% 88%, rgba(250,189,46,.14) 0%, transparent 38%), linear-gradient(150deg,#060B15 0%,#0E1F35 38%,#155874 72%,#1C8AA8 100%)',
  // grad-1 — amber/gold
  'radial-gradient(circle at 80% 14%, rgba(255,214,110,.65) 0%, transparent 45%), radial-gradient(circle at 10% 90%, rgba(122,78,0,.4) 0%, transparent 40%), linear-gradient(150deg,#2B1B00 0%,#5E3E00 42%,#9C6A00 75%,#FABD2E 100%)',
  // grad-2 — steel blue
  'radial-gradient(circle at 75% 20%, rgba(150,175,205,.5) 0%, transparent 42%), radial-gradient(circle at 15% 85%, rgba(28,138,168,.22) 0%, transparent 38%), linear-gradient(150deg,#0A0F1A 0%,#16233D 40%,#2C4260 75%,#3D5570 100%)',
  // grad-3 — green/teal
  'radial-gradient(circle at 80% 16%, rgba(90,224,180,.5) 0%, transparent 42%), radial-gradient(circle at 12% 88%, rgba(28,138,168,.28) 0%, transparent 38%), linear-gradient(150deg,#031A12 0%,#0B3B2E 42%,#0F6E5C 75%,#1C8AA8 100%)',
  // grad-4 — orange/amber
  'radial-gradient(circle at 78% 18%, rgba(255,196,90,.6) 0%, transparent 44%), radial-gradient(circle at 14% 88%, rgba(58,31,0,.5) 0%, transparent 38%), linear-gradient(150deg,#200F00 0%,#4A2A00 40%,#8C5A00 75%,#FABD2E 100%)',
  // grad-5 — violet/slate
  'radial-gradient(circle at 78% 18%, rgba(190,170,230,.42) 0%, transparent 42%), radial-gradient(circle at 14% 88%, rgba(91,107,125,.35) 0%, transparent 38%), linear-gradient(150deg,#160B22 0%,#2C1B3D 42%,#42405C 75%,#5B6B7D 100%)',
]

export function gradientFor(index: number): string {
  return THUMB_GRADIENTS[index % THUMB_GRADIENTS.length]
}
