import type { Category } from './types'

/**
 * Launch category set (18 categories, admin-extensible) — matches
 * docs/PROJECT_BRIEF.md and the approved prototype's CATEGORIES fixture.
 */
export const CATEGORIES: Category[] = [
  { id: 'manufacturing', label: 'Manufacturing', icon: '🏭' },
  { id: 'agriculture', label: 'Agriculture', icon: '🌾' },
  { id: 'education', label: 'Education', icon: '🎓' },
  { id: 'health', label: 'Health', icon: '🩺' },
  { id: 'technology', label: 'Technology', icon: '💻' },
  { id: 'science', label: 'Science', icon: '🔬' },
  { id: 'construction', label: 'Construction', icon: '🏗️' },
  { id: 'automotive', label: 'Automotive', icon: '🚗' },
  { id: 'retail', label: 'Retail', icon: '🛍️' },
  { id: 'beauty', label: 'Beauty & Lifestyle', icon: '💄' },
  { id: 'energy', label: 'Energy', icon: '⚡' },
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'hospitality', label: 'Hospitality', icon: '🏨' },
  { id: 'arts', label: 'Arts & Culture', icon: '🎨' },
  { id: 'books', label: 'Books & Journals', icon: '📚' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'diy', label: 'DIY', icon: '🔧' },
  { id: 'professional', label: 'Professional Services', icon: '💼' },
]

export const catById = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id)
