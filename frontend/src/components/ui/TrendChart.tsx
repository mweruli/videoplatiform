import { useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface TrendChartSeries {
  key: string
  label: string
  /** CSS color value — pass one of this app's theme-invariant accent tokens (`var(--color-teal)`, `var(--color-amber)`, `var(--color-brand)`, `var(--color-danger)`) so the line reads with real contrast in both themes, never a one-off hex. */
  color: string
  values: number[]
  /** Fills the area under this line with a soft gradient down to the baseline, echoing this app's glow/gradient visual language (see thumbTreatment.ts). Reserve for single-series charts — layering it under 2+ lines gets muddy. */
  area?: boolean
}

interface TrendChartProps {
  /** ISO `YYYY-MM-DD` dates, oldest first — same length as every series' `values` (the zero-filled shape every timeseries endpoint in this app guarantees). */
  dates: string[]
  series: TrendChartSeries[]
  height?: number
  formatValue?: (value: number) => string
  className?: string
  /** Screen-reader summary of what this chart shows, e.g. "Profile views and search impressions, last 30 days" — the chart itself is `role="img"`; a full data table for assistive tech follows as `sr-only` markup. */
  ariaLabel: string
}

const VIEW_W = 600
const VIEW_H = 220
const PAD_LEFT = 42
const PAD_RIGHT = 10
const PAD_TOP = 14
const PAD_BOTTOM = 26
const INNER_W = VIEW_W - PAD_LEFT - PAD_RIGHT
const INNER_H = VIEW_H - PAD_TOP - PAD_BOTTOM

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * "Nice" axis step (1/2/5 × a power of 10) for ~4 gridlines, standard
 * charting-library behaviour — picking naive 25/50/75% fractions of the raw
 * max instead (this component's first pass) rounds to duplicate adjacent
 * integer labels whenever the max is small (a real seed-data case: a max of
 * 3 daily views produces gridline labels "0, 1, 2, 2, 3"). Nice-stepping
 * fixes that and reads like every other axis a user has seen before.
 */
function niceStep(maxValue: number, targetTicks = 4): number {
  if (maxValue <= 0) return 1
  const rawStep = maxValue / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const residual = rawStep / magnitude
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10
  return niceResidual * magnitude
}

/**
 * Minimal inline-SVG multi-series line chart — no charting dependency exists
 * anywhere in this codebase (confirmed before building this), and the
 * Phase 1a analytics round's own precedent (ProportionalBar.tsx) deliberately
 * skipped a chart library for its simpler proportional-breakdown case. A
 * ~30-90 point daily trend genuinely earns a real line chart (a table of
 * numbers doesn't read as a trend the way a line does), but it's still less
 * risk/code to hand-roll one small, focused component in this app's own
 * SVG/gradient idiom than to pull in a dependency for a handful of lines.
 *
 * `preserveAspectRatio="none"` lets the chart fill its container at any
 * width/height ratio — deliberate: a line chart's absolute proportions don't
 * carry meaning, only the relative trend does, so non-uniform scaling is a
 * common, correct technique here, not an oversight. All colors are passed in
 * as CSS custom-property values (never computed against the current theme in
 * JS), and grid/axis text uses the `border`/`muted-foreground` tokens, which
 * already flip between themes — so contrast holds in light and dark without
 * any theme-detection logic in this component.
 */
export default function TrendChart({
  dates,
  series,
  height = 200,
  formatValue = (v) => v.toLocaleString('en-KE'),
  className = '',
  ariaLabel,
}: TrendChartProps) {
  const rawId = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const n = dates.length
  const maxRaw = Math.max(0, ...series.flatMap((s) => s.values))
  const hasActivity = maxRaw > 0
  const step = niceStep(maxRaw)
  const niceMax = hasActivity ? Math.ceil(maxRaw / step) * step : 1
  const gridValues = hasActivity ? Array.from({ length: Math.round(niceMax / step) + 1 }, (_, i) => i * step) : [0]

  const xFor = (i: number) => (n <= 1 ? PAD_LEFT : PAD_LEFT + (i / (n - 1)) * INNER_W)
  const yFor = (v: number) => PAD_TOP + INNER_H - (v / niceMax) * INNER_H

  const drawn = useMemo(
    () =>
      series.map((s) => {
        const linePath = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`).join(' ')
        const areaPath = s.area
          ? `M ${xFor(0).toFixed(2)} ${yFor(0).toFixed(2)} ` +
            s.values.map((v, i) => `L ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`).join(' ') +
            ` L ${xFor(s.values.length - 1).toFixed(2)} ${yFor(0).toFixed(2)} Z`
          : null
        return { ...s, linePath, areaPath }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- xFor/yFor derive purely from n/niceMax, both already covered
    [series, n, niceMax],
  )

  function updateHoverFromClientX(clientX: number) {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const relX = ((clientX - rect.left) / rect.width) * VIEW_W
    const clamped = Math.min(Math.max(relX, PAD_LEFT), VIEW_W - PAD_RIGHT)
    const idx = n <= 1 ? 0 : Math.round(((clamped - PAD_LEFT) / INNER_W) * (n - 1))
    setHoverIndex(Math.min(Math.max(idx, 0), n - 1))
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    updateHoverFromClientX(e.clientX)
  }

  const xLabelIdxs = n <= 1 ? [0] : Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]))

  return (
    <div className={`chart-draw-in relative ${className}`}>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </div>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className="block touch-none overflow-visible"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          {drawn.map((s) =>
            s.area ? (
              <linearGradient key={s.key} id={`${rawId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ) : null,
          )}
        </defs>

        {gridValues.map((v) => {
          const y = yFor(v)
          return (
            <g key={v}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={VIEW_W - PAD_RIGHT}
                y2={y}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px] font-semibold">
                {formatValue(hasActivity ? v : 0)}
              </text>
            </g>
          )
        })}

        {xLabelIdxs.map((i) => (
          <text
            key={i}
            x={xFor(i)}
            y={VIEW_H - 6}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground text-[9px] font-semibold"
          >
            {shortDate(dates[i])}
          </text>
        ))}

        {drawn.map((s) => (
          <g key={s.key}>
            {s.area && s.areaPath && <path d={s.areaPath} fill={`url(#${rawId}-${s.key})`} stroke="none" />}
            <path
              d={s.linePath}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}

        {hoverIndex !== null && (
          <g>
            <line
              x1={xFor(hoverIndex)}
              y1={PAD_TOP}
              x2={xFor(hoverIndex)}
              y2={PAD_TOP + INNER_H}
              className="stroke-foreground/25"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {drawn.map((s) => (
              <circle
                key={s.key}
                cx={xFor(hoverIndex)}
                cy={yFor(s.values[hoverIndex])}
                r={3.5}
                fill={s.color}
                className="stroke-surface"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
      </svg>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-max -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] shadow-elevated"
          style={{ left: `${(xFor(hoverIndex) / VIEW_W) * 100}%` }}
        >
          <div className="mb-0.5 font-bold text-foreground">{shortDate(dates[hoverIndex])}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="font-semibold text-foreground">{formatValue(s.values[hoverIndex])}</span> {s.label}
            </div>
          ))}
        </div>
      )}

      {!hasActivity && <p className="mt-1.5 text-center text-xs text-muted-foreground">No activity in this window yet.</p>}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((d, i) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              {series.map((s) => (
                <td key={s.key}>{s.values[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
