import { ALL_ROLE_META, isStaffRole } from '../auth/roles'
import type { UserRole } from '../../lib/api'

/**
 * Small role badge for User Management's table — neutral by default, a
 * brand-blue-tinted "staff" variant for platform_admin/content_moderator so
 * they read as a different weight class from shopper/business roles at a
 * glance. See docs/design/prototype-v1.html's `.role-pill`/`.role-pill.staff`
 * (v8 design pass).
 */
export default function RolePill({ role }: { role: UserRole }) {
  const meta = ALL_ROLE_META[role]
  const staff = isStaffRole(role)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap ${
        staff
          ? 'border-brand/25 bg-brand/10 text-brand dark:text-[#93AAF5]'
          : 'border-border bg-panel text-muted-foreground'
      }`}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  )
}
