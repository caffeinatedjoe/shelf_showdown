const K_FACTOR = 32;

/**
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number}
 */
export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * @param {number} ratingA
 * @param {number} ratingB
 * @param {0 | 0.5 | 1} outcome 1 if A wins, 0 if B wins
 * @returns {{ ratingA: number, ratingB: number }}
 */
export function updateRatings(ratingA, ratingB, outcome) {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  return {
    ratingA: Math.round(ratingA + K_FACTOR * (outcome - expectedA)),
    ratingB: Math.round(ratingB + K_FACTOR * (1 - outcome - expectedB)),
  };
}

/**
 * Bradley-Terry / Elo updates from a full ranking (best → worst).
 * Expands to all pairwise outcomes and applies simultaneous deltas from
 * pre-handful ratings (online BT gradient step).
 *
 * @param {string[]} orderedIds best → worst
 * @param {Map<string, number> | Record<string, number>} ratingById
 * @param {number} [kFactor]
 * @returns {{ bookId: string, rating: number }[]}
 */
export function ratingUpdatesFromRanking(orderedIds, ratingById, kFactor = K_FACTOR) {
  if (orderedIds.length < 2) return [];

  /** @param {string} id */
  const getRating = (id) => {
    if (ratingById instanceof Map) return ratingById.get(id) ?? 1500;
    return ratingById[id] ?? 1500;
  };

  const initial = orderedIds.map((id) => getRating(id));
  const deltas = orderedIds.map(() => 0);

  for (let i = 0; i < orderedIds.length; i++) {
    for (let j = i + 1; j < orderedIds.length; j++) {
      // i is ranked above j → i wins
      const expectedI = expectedScore(initial[i], initial[j]);
      deltas[i] += kFactor * (1 - expectedI);
      deltas[j] += kFactor * (0 - (1 - expectedI));
    }
  }

  return orderedIds.map((bookId, i) => ({
    bookId,
    rating: Math.round(initial[i] + deltas[i]),
  }));
}

/**
 * Adjacent pairs from a ranking (best → worst), for comparison history.
 * @param {string[]} orderedIds
 * @returns {{ winnerId: string, loserId: string }[]}
 */
export function adjacentPairsFromRanking(orderedIds) {
  /** @type {{ winnerId: string, loserId: string }[]} */
  const pairs = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    pairs.push({
      winnerId: orderedIds[i],
      loserId: orderedIds[i + 1],
    });
  }
  return pairs;
}

export { K_FACTOR };
