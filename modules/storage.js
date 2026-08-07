import { convexMutation, convexQuery } from "./convexClient.js";

export const INITIAL_RATING = 1500;

/**
 * @typedef {{ id: string, title: string, author: string, rating: number, comparisons: number, timesRead: number, finishedAts: number[], createdAt: number }} Book
 * @typedef {{ id: string, bookAId: string, bookBId: string, winnerId: string, ratingA: number, ratingB: number, timestamp: number }} Comparison
 * @typedef {{ books: Book[], comparisons: Comparison[] }} AppState
 */

/** @returns {AppState} */
export function createEmptyState() {
  return { books: [], comparisons: [] };
}

/**
 * @param {{ _id: string, title: string, author: string, rating: number, comparisons: number, timesRead?: number, finishedAts?: number[], createdAt: number }} book
 * @returns {Book}
 */
function mapBook(book) {
  return {
    id: book._id,
    title: book.title,
    author: book.author,
    rating: book.rating,
    comparisons: book.comparisons,
    timesRead: book.timesRead ?? 1,
    finishedAts: Array.isArray(book.finishedAts) ? book.finishedAts : [],
    createdAt: book.createdAt,
  };
}

/**
 * @param {{ _id: string, bookAId: string, bookBId: string, winnerId: string, ratingA: number, ratingB: number, timestamp: number }} comparison
 * @returns {Comparison}
 */
function mapComparison(comparison) {
  return {
    id: comparison._id,
    bookAId: comparison.bookAId,
    bookBId: comparison.bookBId,
    winnerId: comparison.winnerId,
    ratingA: comparison.ratingA,
    ratingB: comparison.ratingB,
    timestamp: comparison.timestamp,
  };
}

/** Ensure the signed-in user has a library document. */
export async function ensureLibrary() {
  await convexMutation("library:getOrCreate", {});
}

/** @returns {Promise<AppState>} */
export async function loadState() {
  await ensureLibrary();
  const [books, comparisons] = await Promise.all([
    convexQuery("books:list", {}),
    convexQuery("comparisons:list", {}),
  ]);
  return {
    books: (books ?? []).map(mapBook),
    comparisons: (comparisons ?? []).map(mapComparison),
  };
}

/**
 * @param {string} title
 * @param {string} author
 * @returns {Promise<Book>}
 */
export async function addBookRemote(title, author) {
  const book = await convexMutation("books:add", { title, author });
  return mapBook(book);
}

/**
 * @param {string} bookId
 */
export async function removeBookRemote(bookId) {
  await convexMutation("books:remove", { bookId });
}

/**
 * @param {{ title: string, author: string, timesRead?: number, finishedAts?: number[] }[]} rows
 * @returns {Promise<{ added: number, updated: number }>}
 */
export async function importBooksRemote(rows) {
  const books = rows.map((row) => ({
    title: row.title,
    author: row.author,
    timesRead: row.timesRead,
    ...(row.finishedAts && row.finishedAts.length > 0
      ? { finishedAts: row.finishedAts }
      : {}),
  }));
  const result = await convexMutation("books:importMany", {
    books,
  });
  return {
    added: result?.added ?? 0,
    updated: result?.updated ?? 0,
  };
}

export async function clearLibraryRemote() {
  await convexMutation("books:clearAll", {});
}

/**
 * @param {string} winnerId
 * @param {string} loserId
 * @param {{ bookId: string, rating: number }[]} [ratingUpdates]
 */
export async function recordComparisonRemote(winnerId, loserId, ratingUpdates) {
  /** @type {Record<string, unknown>} */
  const args = { winnerId, loserId };
  if (ratingUpdates && ratingUpdates.length > 0) {
    args.ratingUpdates = ratingUpdates;
  }
  await convexMutation("comparisons:record", args);
}

export async function undoLastComparisonRemote() {
  await convexMutation("comparisons:undoLast", {});
}

/**
 * @param {{ bookId: string, rating: number }[]} updates
 */
export async function setRatingsRemote(updates) {
  if (updates.length === 0) return;
  await convexMutation("books:setRatings", { updates });
}

/** Kept for local pair-picking helpers that still need ephemeral ids. */
export function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
