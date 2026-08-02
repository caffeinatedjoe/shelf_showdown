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
