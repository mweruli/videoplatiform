import { useQuery } from '@tanstack/react-query'

import { getHealth } from '../lib/api'

/**
 * Sprint 1 placeholder home page. Its only real job right now is to prove
 * the frontend can reach the backend: it calls GET /health via TanStack
 * Query and renders the DB/Redis connectivity it reports. The real homepage
 * (search bar, trending videos, categories) is designed and built in later
 * sprints per docs/DEVELOPMENT_PLAN.md.
 */
export default function Home() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Alfabiz Video Discovery Platform</h1>
        <p className="text-[var(--color-ink-muted)] mt-1">
          Sprint 1 dev skeleton — frontend and backend wired together.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-[var(--color-surface)] p-5">
        <h2 className="font-medium mb-3">Backend health check</h2>

        {isLoading && <p className="text-sm text-[var(--color-ink-muted)]">Checking backend…</p>}

        {isError && (
          <p className="text-sm text-red-600">
            Could not reach the backend: {error instanceof Error ? error.message : 'unknown error'}
          </p>
        )}

        {data && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm max-w-md">
            <dt className="text-[var(--color-ink-muted)]">Overall status</dt>
            <dd>
              <StatusBadge ok={data.status === 'ok'} label={data.status} />
            </dd>

            <dt className="text-[var(--color-ink-muted)]">Environment</dt>
            <dd>{data.environment}</dd>

            <dt className="text-[var(--color-ink-muted)]">Database</dt>
            <dd>
              <StatusBadge ok={data.database.status === 'ok'} label={data.database.status} />
              {data.database.detail && (
                <span className="block text-xs text-red-600 mt-1">{data.database.detail}</span>
              )}
            </dd>

            <dt className="text-[var(--color-ink-muted)]">Redis</dt>
            <dd>
              <StatusBadge ok={data.redis.status === 'ok'} label={data.redis.status} />
              {data.redis.detail && (
                <span className="block text-xs text-red-600 mt-1">{data.redis.detail}</span>
              )}
            </dd>
          </dl>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {label}
    </span>
  )
}
