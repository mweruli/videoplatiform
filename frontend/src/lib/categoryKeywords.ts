/**
 * Category auto-suggestion for Product/Video listings — keyword matching
 * only, no AI/API calls (PM explicitly ruled out an AI API budget for this).
 * Purely client-side: as a business owner types a title/description, we
 * score the 18 launch categories (backend/app/db/seed.py's LAUNCH_CATEGORIES)
 * by keyword hits and suggest the top few. This is a suggestion/head-start,
 * never a lock-in — the owner can always freely add/remove categories.
 *
 * Scope: Products and Videos only. Business profiles keep single-category
 * selection as-is — do not wire this into business category selection.
 *
 * `CATEGORY_KEYWORDS` is a manually curated v1 list of realistic Kenyan-market
 * product/business vocabulary per category. It is expected to need tuning
 * over time as real listings come in — add/remove keywords here as patterns
 * emerge, no other code needs to change. Keys are category `slug`s exactly as
 * produced by `backend/app/db/seed.py`'s `slugify()` (lowercase, `&` dropped,
 * spaces to hyphens), NOT category ids, so this file stays valid even if
 * category ids differ across environments/seeds.
 *
 * Multi-word entries (e.g. "spare part", "solar panel") are matched as a
 * literal substring of the (lowercased) title+description text. Single-word
 * entries are matched against the same tokens `searchMatch.ts`'s `tokenize()`
 * already produces elsewhere in the app, so word-boundary behaviour (and
 * stopword handling) stays consistent with search instead of a second
 * tokenizer.
 */

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  manufacturing: [
    'factory', 'manufacturer', 'manufacturing', 'production line', 'machinery', 'industrial',
    'fabrication', 'assembly', 'plant', 'mould', 'mold', 'moulding', 'molding', 'packaging',
    'processing plant', 'rotomoulding', 'welding', 'steel fabrication', 'bulk supply',
  ],
  agriculture: [
    'farm', 'farming', 'farmer', 'seed', 'seedling', 'irrigation', 'crop', 'fertilizer',
    'pesticide', 'tractor', 'greenhouse', 'poultry', 'livestock', 'dairy', 'agrovet',
    'harvest', 'agribusiness', 'animal feed', 'silo', 'cattle', 'maize', 'horticulture',
  ],
  education: [
    'school', 'tutoring', 'tuition', 'curriculum', 'exam', 'revision', 'kcpe', 'kcse',
    'university', 'college', 'e-learning', 'elearning', 'textbook', 'classroom', 'teacher',
    'training course', 'certificate course', 'learners', 'academy',
  ],
  health: [
    'clinic', 'hospital', 'pharmacy', 'medicine', 'healthcare', 'dental', 'diagnosis',
    'therapy', 'wellness clinic', 'nutrition', 'medical', 'doctor', 'nurse', 'maternity',
    'physiotherapy', 'laboratory test', 'health insurance', 'patient',
  ],
  technology: [
    'software', 'app', 'website', 'computer', 'laptop', 'server', 'cloud', 'network',
    'cybersecurity', 'it support', 'developer', 'coding', 'hardware', 'gadget', 'smartphone',
    'artificial intelligence', 'database', 'tech support', 'saas', 'api',
  ],
  science: [
    'laboratory', 'research', 'scientific', 'chemical', 'biology', 'physics', 'experiment',
    'analysis', 'testing lab', 'calibration', 'instrumentation', 'sample testing',
  ],
  construction: [
    'building', 'cement', 'concrete', 'contractor', 'construction site', 'hardware store',
    'roofing', 'plumbing', 'tiles', 'paint', 'bricks', 'steel bars', 'quarry', 'masonry',
    'architecture', 'renovation', 'borehole drilling', 'scaffolding',
  ],
  automotive: [
    'car', 'vehicle', 'tyre', 'tyres', 'tire', 'spare part', 'spare parts', 'engine',
    'garage', 'motor vehicle', 'auto repair', 'mechanic', 'exhaust', 'gearbox',
    'car battery', 'windscreen', 'bodywork', 'motorbike', 'boda boda', 'panel beating',
  ],
  retail: [
    'shop', 'store', 'supermarket', 'wholesale', 'retailer', 'merchandise', 'boutique',
    'outlet', 'stockist', 'distributor', 'shopping',
  ],
  'beauty-lifestyle': [
    'salon', 'spa', 'cosmetics', 'skincare', 'haircare', 'makeup', 'barber', 'nails',
    'fashion', 'wig', 'perfume', 'fragrance', 'hairdressing', 'lifestyle', 'beauty products',
  ],
  energy: [
    'solar', 'inverter', 'battery backup', 'power', 'electricity', 'generator', 'hybrid system',
    'solar panel', 'off-grid', 'off grid', 'energy saving', 'gas cylinder', 'lpg', 'biogas',
    'kwh', 'kilowatt', 'power backup',
  ],
  finance: [
    'loan', 'bank', 'banking', 'savings', 'sacco', 'insurance', 'investment', 'credit',
    'microfinance', 'mpesa', 'payment', 'financial services', 'forex', 'accounting services',
    'tax', 'lending',
  ],
  hospitality: [
    'hotel', 'restaurant', 'lodge', 'resort', 'catering', 'accommodation', 'guesthouse',
    'bnb', 'tourism', 'event venue', 'conference facility', 'bar and restaurant', 'safari',
  ],
  'arts-culture': [
    'art', 'artist', 'gallery', 'craft', 'sculpture', 'painting', 'cultural', 'heritage',
    'museum', 'traditional', 'handicraft', 'curio', 'exhibition',
  ],
  'books-journals': [
    'book', 'journal', 'publication', 'novel', 'magazine', 'publisher', 'ebook', 'author',
    'printing press', 'literature', 'periodical',
  ],
  entertainment: [
    'music', 'concert', 'dj', 'film', 'movie', 'comedy show', 'entertainment', 'nightlife',
    'gaming', 'artiste', 'band', 'live show', 'event mc',
  ],
  diy: [
    'diy', 'handmade', 'tutorial', 'how to', 'build your own', 'home improvement',
    'craft project', 'workshop kit', 'repair guide', 'step by step',
  ],
  'professional-services': [
    'consulting', 'consultancy', 'legal services', 'lawyer', 'advocate', 'audit',
    'hr services', 'marketing agency', 'branding', 'law firm', 'notary', 'accountant',
    'business consultant',
  ],
}

/** Debounce for recomputing category suggestions after title/description edits — same spirit as Search's live-search debounce (pages/Search.tsx's SEARCH_DEBOUNCE_MS), just slightly longer since this drives a heavier UI change (pre-checking chips) than re-filtering a list. */
export const CATEGORY_SUGGESTION_DEBOUNCE_MS = 400

/** Never suggest more than this many categories, even if a description hits keywords for many — a vague description shouldn't paper the picker with half the category list. */
const MAX_SUGGESTIONS = 3

interface SuggestableCategory {
  id: number
  slug: string
}

/**
 * Rank categories by keyword-match count against `text` (title + description,
 * caller's concatenation) and return the top matches — capped at
 * `MAX_SUGGESTIONS`, and only ever categories with at least one real keyword
 * hit (a zero-match "suggestion" is just noise, not a suggestion).
 *
 * Tokenization reuses `searchMatch.ts`'s `tokenize()` so word-boundary/
 * stopword behaviour matches the rest of the app instead of diverging here.
 */
export function suggestCategories<T extends SuggestableCategory>(
  text: string,
  categories: T[],
  tokenize: (query: string) => string[],
): T[] {
  const tokens = tokenize(text)
  if (tokens.length === 0 || categories.length === 0) return []

  const tokenSet = new Set(tokens)
  const normalizedText = ` ${text.toLowerCase()} `

  const scored = categories
    .map((category) => {
      const keywords = CATEGORY_KEYWORDS[category.slug] ?? []
      let matches = 0
      for (const keyword of keywords) {
        if (keyword.includes(' ')) {
          if (normalizedText.includes(keyword)) matches += 1
        } else if (tokenSet.has(keyword)) {
          matches += 1
        }
      }
      return { category, matches }
    })
    .filter((entry) => entry.matches > 0)
    .sort((a, b) => b.matches - a.matches)

  return scored.slice(0, MAX_SUGGESTIONS).map((entry) => entry.category)
}
