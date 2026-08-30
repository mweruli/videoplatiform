/**
 * Simple client-side search matching/scoring, ported from the approved
 * prototype's `tokenize`/`scoreItem` (docs/design/prototype-v1.html). There's
 * no search-indexing service (Meilisearch) wired up yet — see
 * DEVELOPMENT_PLAN.md's Sprint 4 — so Search fetches a full page from the
 * real business/product endpoints and matches/ranks it here. Replace with a
 * real query to Meilisearch once that lands; the matching *behaviour*
 * (substring, case-insensitive, every-token-must-match) should carry over.
 */

/**
 * Common connective words that carry no discriminating meaning in a natural
 * "X near Y" / "X for Y" style query — filtered out the same way the
 * approved prototype's `tokenize` did (docs/design/prototype-v1.html).
 * Dropped when this was first ported to TypeScript; restored here.
 */
const STOPWORDS = new Set(['near', 'the', 'a', 'for', 'and', 'in', 'of', 'to'])

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * True if AT LEAST ONE token appears as a substring of some haystack field —
 * relaxed from requiring every token to match, so a real multi-word query
 * (e.g. "printing project video of ramco") still surfaces a listing that
 * only literally contains some of those words ("printing", "project",
 * "ramco") rather than being excluded outright because a couple of
 * generic/stopword-adjacent terms don't appear verbatim. `scoreTokens`
 * (below) ranks by how many tokens/fields hit, so results matching more
 * words still surface above weaker partial matches — this only changes
 * whether a partial match is included at all.
 */
export function matchesTokens(haystack: (string | null | undefined)[], tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const fields = haystack.filter((f): f is string => Boolean(f)).map((f) => f.toLowerCase())
  return tokens.some((token) => fields.some((field) => field.includes(token)))
}

/** Relevance score: how many haystack fields each token hits, summed — used to sort matches, not to filter them. */
export function scoreTokens(haystack: (string | null | undefined)[], tokens: string[]): number {
  if (tokens.length === 0) return 0
  const fields = haystack.filter((f): f is string => Boolean(f)).map((f) => f.toLowerCase())
  let score = 0
  for (const token of tokens) {
    for (const field of fields) {
      if (field === token) score += 3
      else if (field.startsWith(token)) score += 2
      else if (field.includes(token)) score += 1
    }
  }
  return score
}
