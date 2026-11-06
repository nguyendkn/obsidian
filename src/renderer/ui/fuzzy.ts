export interface FuzzyResult {
  score: number;
  /** Indices in the haystack that matched, in order. */
  positions: number[];
}

/**
 * Subsequence fuzzy match with small heuristic bonuses: consecutive runs and
 * matches at word boundaries score higher, spread-out matches score lower.
 * Returns null when the query is not a subsequence of the text.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const hay = text.toLowerCase();
  const positions: number[] = [];

  let score = 0;
  let hayIndex = 0;
  let streak = 0;
  for (const char of q) {
    const found = hay.indexOf(char, hayIndex);
    if (found === -1) return null;
    const boundary = found === 0 || /[\s/\-_.]/.test(hay[found - 1]);
    score += 1 + (boundary ? 6 : 0) + Math.min(streak, 4);
    streak = found === hayIndex ? streak + 1 : 0;
    positions.push(found);
    hayIndex = found + 1;
  }
  // Prefer earlier and shorter haystacks when the score is otherwise equal.
  score -= Math.min(hay.length, 40) * 0.05;
  return { score, positions };
}

export interface ScoredItem<T> {
  item: T;
  result: FuzzyResult;
}

/** Rank items by fuzzy score, best first. */
export function rankByFuzzy<T>(query: string, items: T[], textOf: (item: T) => string): Array<ScoredItem<T>> {
  const scored: Array<ScoredItem<T>> = [];
  for (const item of items) {
    const result = fuzzyMatch(query, textOf(item));
    if (result) scored.push({ item, result });
  }
  return scored.sort((a, b) => b.result.score - a.result.score);
}
