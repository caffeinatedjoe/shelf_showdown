import { createId } from "./storage.js";
import { updateRatings } from "./ranking.js";

/**
 * @typedef {import("./storage.js").Book} Book
 * @typedef {import("./storage.js").Comparison} Comparison
 * @typedef {import("./storage.js").AppState} AppState
 */

/**
 * Prefer uncompared pairs, then books with fewer comparisons.
 * @param {Book[]} books
 * @param {Comparison[]} comparisons
 * @returns {[Book, Book] | null}
 */
export function pickPair(books, comparisons) {
  if (books.length < 2) return null;

  const compared = new Set(
    comparisons.map((c) => pairKey(c.bookAId, c.bookBId))
  );

  /** @type {[Book, Book][]} */
  const uncompared = [];
  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const a = books[i];
      const b = books[j];
      if (!compared.has(pairKey(a.id, b.id))) {
        uncompared.push([a, b]);
      }
    }
  }

  if (uncompared.length > 0) {
    // Prefer pairs whose ratings are close (more informative)
    uncompared.sort(
      (x, y) =>
        Math.abs(x[0].rating - x[1].rating) -
        Math.abs(y[0].rating - y[1].rating)
    );
    return uncompared[0];
  }

  // All pairs compared: pick two with fewest comparisons, shuffle slightly
  const sorted = [...books].sort((a, b) => a.comparisons - b.comparisons);
  const pool = sorted.slice(0, Math.min(6, sorted.length));
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (b.id === a.id && guard < 20) {
    b = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  }
  if (b.id === a.id) {
    b = books.find((book) => book.id !== a.id) ?? a;
  }
  return a.id === b.id ? null : [a, b];
}

/**
 * @param {string} idA
 * @param {string} idB
 */
function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/**
 * @param {AppState} state
 * @param {string} winnerId
 * @param {string} loserId
 * @returns {AppState}
 */
export function applyComparison(state, winnerId, loserId) {
  const books = state.books.map((b) => ({ ...b }));
  const winner = books.find((b) => b.id === winnerId);
  const loser = books.find((b) => b.id === loserId);
  if (!winner || !loser) return state;

  const beforeA = winner.rating;
  const beforeB = loser.rating;
  const { ratingA, ratingB } = updateRatings(winner.rating, loser.rating, 1);
  winner.rating = ratingA;
  loser.rating = ratingB;
  winner.comparisons += 1;
  loser.comparisons += 1;

  /** @type {Comparison} */
  const comparison = {
    id: createId(),
    bookAId: winnerId,
    bookBId: loserId,
    winnerId,
    ratingA: beforeA,
    ratingB: beforeB,
    timestamp: Date.now(),
  };

  return {
    books,
    comparisons: [...state.comparisons, comparison],
  };
}

/**
 * Undo the last comparison and restore prior ratings.
 * @param {AppState} state
 * @returns {AppState}
 */
export function undoLastComparison(state) {
  if (state.comparisons.length === 0) return state;

  const comparisons = [...state.comparisons];
  const last = comparisons.pop();
  if (!last) return state;

  const books = state.books.map((b) => ({ ...b }));
  const winner = books.find((b) => b.id === last.winnerId);
  const loserId =
    last.winnerId === last.bookAId ? last.bookBId : last.bookAId;
  const loser = books.find((b) => b.id === loserId);

  if (winner && loser) {
    // last.ratingA/B were stored as winner/loser ratings before the match
    // (applyComparison stores winner as bookA conceptually via ratingA = winner before)
    winner.rating = last.ratingA;
    loser.rating = last.ratingB;
    winner.comparisons = Math.max(0, winner.comparisons - 1);
    loser.comparisons = Math.max(0, loser.comparisons - 1);
  }

  return { books, comparisons };
}

export { parseCsv } from "./tabular.js";
