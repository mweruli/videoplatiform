import { useEffect, useState } from 'react'

import Icon from '../icons/Icon'
import { ALL_ROLE_META } from '../auth/roles'
import DashSection from '../dashboardshell/DashSection'
import EmptyState from '../ui/EmptyState'
import Pager from '../ui/Pager'
import RolePill from '../ui/RolePill'
import Skeleton from '../ui/Skeleton'
import ToggleSwitch from '../ui/ToggleSwitch'
import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { useAdminUserDetail, useAdminUsers, useUpdateUserActive } from '../../hooks/useAdmin'
import { ApiError } from '../../lib/api'
import type { AdminUserDto, UserRole } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../lib/toast'

const PAGE_SIZE = 10
const ROLE_FILTER_OPTIONS: { id: UserRole | ''; label: string }[] = [
  { id: '', label: 'All roles' },
  ...(Object.entries(ALL_ROLE_META) as [UserRole, { label: string }][]).map(([id, meta]) => ({ id, label: meta.label })),
]

/**
 * Admin Panel → User Management (`pages/Admin.tsx`'s "users" section). Real
 * backend throughout: `GET /admin/users` (paginated, role/q filters),
 * `GET /admin/users/{id}` (adds owned businesses, fetched lazily on expand),
 * `PATCH /admin/users/{id}` (`is_active` toggle) — see hooks/useAdmin.ts.
 *
 * The two access-control rules are enforced in the row rendering itself, not
 * just left to the API to 403 (per the brief): the signed-in admin's own row
 * always shows a locked "This is you" state, and every `platform_admin` row
 * shows a locked "Protected" state for every viewer — self-check wins over
 * the platform_admin-check when both apply (see AdminUserRow below), because
 * "this is you" is the more useful explanation in that specific case, while
 * "Protected" is what guards every *other* platform_admin row.
 */
export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Light debounce on the network call only — the input itself stays fully
  // controlled/instant so typing never stutters, but this is a real backend
  // now (not the design prototype's in-memory fixture), so firing a request
  // per keystroke isn't free the way it was there.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(rawQuery), 300)
    return () => window.clearTimeout(t)
  }, [rawQuery])

  useEffect(() => {
    setPage(1)
  }, [query, roleFilter])

  const usersQuery = useAdminUsers({
    role: roleFilter || undefined,
    q: query.trim() || undefined,
    page,
    page_size: PAGE_SIZE,
  })

  const users = usersQuery.data?.items ?? []
  const total = usersQuery.data?.total ?? 0
  const totalPages = usersQuery.data?.pages ?? 1
  const filtered = Boolean(roleFilter || query.trim())

  return (
    <DashSection>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 lg:max-w-xs">
          <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search name, email or phone…"
            className="w-full rounded-full border-[1.5px] border-border bg-panel py-2.5 pr-4 pl-9 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-brand placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_rgba(16,52,166,0.15)]"
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {ROLE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRoleFilter(opt.id)}
              aria-pressed={roleFilter === opt.id}
              className={`flex-none rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors duration-150 ease-brand ${
                roleFilter === opt.id
                  ? 'border-brand bg-brand text-white'
                  : 'border-border bg-surface text-muted-foreground hover:border-teal hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 mb-1 text-xs text-muted-foreground">
        {usersQuery.isSuccess ? `${total} user${total === 1 ? '' : 's'} found${filtered ? ' (filtered)' : ''}` : ' '}
      </p>

      {usersQuery.isLoading && (
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {usersQuery.isError && (
        <EmptyState tone="error" title="Couldn't load users" subtitle="Check your connection and try again.">
          <button
            type="button"
            onClick={() => usersQuery.refetch()}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Retry
          </button>
        </EmptyState>
      )}

      {usersQuery.isSuccess && users.length === 0 && (
        <EmptyState icon="🔍" title="No users match this search/filter" subtitle="Try a different name, email, phone or role." />
      )}

      {usersQuery.isSuccess && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
                <th className="w-8 py-2" />
                <th className="py-2 pr-3 font-extrabold">Name</th>
                <th className="py-2 pr-3 font-extrabold">Contact</th>
                <th className="py-2 pr-3 font-extrabold">Role</th>
                <th className="py-2 pr-3 font-extrabold">Status</th>
                <th className="py-2 pr-3 font-extrabold">Joined</th>
                <th className="py-2 pr-1 font-extrabold" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={currentUser?.id === u.id}
                  expanded={expandedId === u.id}
                  onToggleExpand={() => setExpandedId(expandedId === u.id ? null : u.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </DashSection>
  )
}

function UserRow({
  user,
  isSelf,
  expanded,
  onToggleExpand,
}: {
  user: AdminUserDto
  isSelf: boolean
  expanded: boolean
  onToggleExpand: () => void
}) {
  const { showToast } = useToast()
  const updateActiveMutation = useUpdateUserActive()
  const isPlatformAdmin = user.role === 'platform_admin'
  const meta = ALL_ROLE_META[user.role]

  function handleToggle() {
    updateActiveMutation.mutate(
      { userId: user.id, isActive: !user.is_active },
      {
        onSuccess: () => showToast(user.is_active ? 'User deactivated' : 'User reactivated'),
        onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not update this user.'),
      },
    )
  }

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="py-2.5">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label="Owned businesses"
            aria-expanded={expanded}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-[transform,color] duration-150 ease-brand hover:bg-panel hover:text-foreground ${
              expanded ? 'rotate-90' : ''
            }`}
          >
            <Icon name="chevronRight" size={13} />
          </button>
        </td>
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand text-sm text-white">
              {meta.emoji}
            </span>
            <div className="truncate font-bold text-foreground">{user.full_name || '—'}</div>
          </div>
        </td>
        <td className="py-2.5 pr-3 text-[13px] leading-relaxed">
          {user.email && <div className="text-foreground">{user.email}</div>}
          {user.phone && <div className="text-muted-foreground">{user.phone}</div>}
          {!user.email && !user.phone && <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-2.5 pr-3">
          <RolePill role={user.role} />
        </td>
        <td className="py-2.5 pr-3">
          <div className="flex flex-col items-start gap-1">
            {user.is_verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">
                <Icon name="check" size={9} strokeWidth={3} />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                <Icon name="clock" size={9} strokeWidth={3} />
                Unverified
              </span>
            )}
            {user.is_active ? (
              <span className="inline-flex items-center rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">Active</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
                Deactivated
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 pr-3 text-xs whitespace-nowrap text-muted-foreground">{formatDate(user.created_at)}</td>
        <td className="py-2.5 pr-1">
          {isSelf ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted-foreground"
              title="You can't deactivate your own account."
            >
              <Icon name="lock" size={11} />
              This is you
            </span>
          ) : isPlatformAdmin ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted-foreground"
              title="Platform Administrator accounts can't be deactivated from this screen, by anyone."
            >
              <Icon name="lock" size={11} />
              Protected
            </span>
          ) : (
            <ToggleSwitch
              on={user.is_active}
              onToggle={handleToggle}
              label={user.is_active ? `Deactivate ${user.full_name || 'user'}` : `Reactivate ${user.full_name || 'user'}`}
              disabled={updateActiveMutation.isPending}
            />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={7} className="bg-panel/50 px-4 py-3.5">
            <UserOwnedBusinesses userId={user.id} />
          </td>
        </tr>
      )}
    </>
  )
}

function UserOwnedBusinesses({ userId }: { userId: string }) {
  const detailQuery = useAdminUserDetail(userId)

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (detailQuery.isError) {
    return <p className="text-xs font-semibold text-danger">Couldn't load this user's businesses.</p>
  }
  const businesses = detailQuery.data?.businesses ?? []
  if (businesses.length === 0) {
    return <p className="text-xs text-muted-foreground">Owns no businesses.</p>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {businesses.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel text-sm font-extrabold text-muted-foreground">
              {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full rounded-lg object-cover" loading="lazy" /> : b.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-foreground">{b.name}</div>
              <div className="truncate text-xs text-muted-foreground">{[b.city, b.county].filter(Boolean).join(', ')}</div>
            </div>
          </div>
          <VerificationStatusBadge status={b.verification_status} withLabel className="flex-none" />
        </div>
      ))}
    </div>
  )
}
