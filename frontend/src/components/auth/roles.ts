import type { SelfRegisterableRole, UserRole } from '../../lib/api'

export interface RoleMeta {
  emoji: string
  label: string
  description: string
}

/**
 * Metadata for the roles a person may self-select at registration —
 * mirrors SELF_REGISTERABLE_ROLES in app/schemas/auth.py. Platform Admin /
 * Content Moderator are deliberately absent: staff-assigned only, never
 * offered here.
 */
export const ROLE_META: Record<SelfRegisterableRole, RoleMeta> = {
  general_user: { emoji: '🙂', label: 'General User', description: 'Search, watch, compare — free, always.' },
  business_admin: {
    emoji: '🏢',
    label: 'Business Admin',
    description: "Manage your company's profile, products, services & videos.",
  },
  advertiser: { emoji: '📢', label: 'Advertiser', description: 'Create, fund and manage ad campaigns.' },
  content_creator: {
    emoji: '🎬',
    label: 'Content Creator',
    description: 'Upload video content for review and publication.',
  },
  publisher: { emoji: '📚', label: 'Publisher', description: 'Manage books, journals and publications.' },
}

export const OTHER_ROLES: SelfRegisterableRole[] = ['business_admin', 'advertiser', 'content_creator', 'publisher']

/**
 * Metadata for the two staff-assigned roles (never self-registered — see
 * ROLE_META's docstring). Kept as a separate map rather than widening
 * ROLE_META's type, since ROLE_META backs RolePicker's registration flow,
 * which must stay restricted to SelfRegisterableRole. Used by
 * AccountHomeView to render a real badge/label for a signed-in admin or
 * moderator instead of silently falling back to "General User".
 */
export const STAFF_ROLE_META: Record<'platform_admin' | 'content_moderator', RoleMeta> = {
  platform_admin: { emoji: '🛡️', label: 'Platform Admin', description: 'Full system management, configuration and oversight.' },
  content_moderator: { emoji: '🛡️', label: 'Content Moderator', description: 'Reviews, approves and rejects uploaded content.' },
}

/** All 7 real brief roles in one map — used by User Management's role pill/filter chips, where every role (staff or not) needs to render. */
export const ALL_ROLE_META: Record<UserRole, RoleMeta> = { ...ROLE_META, ...STAFF_ROLE_META }

/** Staff roles (platform_admin/content_moderator) get the brand-blue-tinted `.role-pill.staff` variant — see docs/design/prototype-v1.html's v8 notes ("read as a different weight class from shopper/business roles at a glance"). */
export function isStaffRole(role: UserRole): boolean {
  return role === 'platform_admin' || role === 'content_moderator'
}
