export interface SearchFilters {
  categoryIds: Set<number>
  location: string
  priceMin: string
  priceMax: string
}

export function emptyFilters(): SearchFilters {
  return { categoryIds: new Set(), location: '', priceMin: '', priceMax: '' }
}

export function cloneFilters(filters: SearchFilters): SearchFilters {
  return { ...filters, categoryIds: new Set(filters.categoryIds) }
}

export function filtersActiveCount(filters: SearchFilters): number {
  return filters.categoryIds.size + (filters.location ? 1 : 0) + (filters.priceMin || filters.priceMax ? 1 : 0)
}
