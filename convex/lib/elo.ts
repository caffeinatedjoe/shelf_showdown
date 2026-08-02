const K_FACTOR = 32;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function updateRatings(
  ratingA: number,
  ratingB: number,
  outcome: 0 | 0.5 | 1
): { ratingA: number; ratingB: number } {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  return {
    ratingA: Math.round(ratingA + K_FACTOR * (outcome - expectedA)),
    ratingB: Math.round(ratingB + K_FACTOR * (1 - outcome - expectedB)),
  };
}
