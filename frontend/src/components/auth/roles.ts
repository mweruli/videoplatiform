import type { SelfRegisterableRole } from '../../lib/api'

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
