/**
 * Presentation-only emoji icon per category, keyed by the real backend
 * category slug (see backend/app/db/seed.py's slugify() — lowercase, spaces
 * to hyphens, " & " to a single hyphen). Categories themselves are real data
 * from GET /api/v1/categories (see hooks/useCatalog.ts's useCategories);
 * which *icon* represents each one in the UI has no backend equivalent, so
 * that mapping lives here rather than being bolted onto CategoryDto.
 *
 * Ported 1:1 from the now-removed data/categories.ts fixture's icons, which
 * matched these same 18 launch categories by name.
 */
export const CATEGORY_ICON_BY_SLUG: Record<string, string> = {
  manufacturing: '🏭',
  agriculture: '🌾',
  education: '🎓',
  health: '🩺',
  technology: '💻',
  science: '🔬',
  construction: '🏗️',
  automotive: '🚗',
  retail: '🛍️',
  'beauty-lifestyle': '💄',
  energy: '⚡',
  finance: '💰',
  hospitality: '🏨',
  'arts-culture': '🎨',
  'books-journals': '📚',
  entertainment: '🎬',
  diy: '🔧',
  'professional-services': '💼',
}

export const DEFAULT_CATEGORY_ICON = '🏷️'

export function iconForCategory(slug: string): string {
  return CATEGORY_ICON_BY_SLUG[slug] ?? DEFAULT_CATEGORY_ICON
}
