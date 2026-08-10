import { convexMutation, convexQuery } from "./convexClient.js";

export const INITIAL_RATING = 1500;

const FINISHED_ATS_CACHE_KEY = "shelf.showdown.finishedAts";

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
 * @param {string} title
 * @param {string} author
 */
function bookKey(title, author) {
  return `${title.trim().toLowerCase()}|${author.trim().toLowerCase()}`;
}

/** @returns {Record<string, number[]>} */
function readFinishedAtsCache() {
  try {
    const raw = localStorage.getItem(FINISHED_ATS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    /** @type {Record<string, number[]>} */
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const nums = value.filter((n) => typeof n === "number" && Number.isFinite(n));
      if (nums.length > 0) out[key] = nums;
    }
    return out;
  } catch {
    return {};
  }
}

/** @param {Record<string, number[]>} cache */
function writeFinishedAtsCache(cache) {
  try {
    localStorage.setItem(FINISHED_ATS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Persist finish dates locally (used when Convex prod hasn't been redeployed yet).
 * @param {{ title: string, author: string, finishedAts?: number[] }[]} rows
 */
export function cacheFinishedAtsLocally(rows) {
  const cache = readFinishedAtsCache();
  let changed = false;
  for (const row of rows) {
    if (!row.finishedAts || row.finishedAts.length === 0) continue;
    const key = bookKey(row.title, row.author);
    const merged = [
      ...new Set([...(cache[key] ?? []), ...row.finishedAts].filter(Number.isFinite)),
    ].sort((a, b) => a - b);
    if (
      merged.length !== (cache[key]?.length ?? 0) ||
      merged.some((ts, i) => ts !== cache[key]?.[i])
    ) {
      cache[key] = merged;
      changed = true;
    }
  }
  if (changed) writeFinishedAtsCache(cache);
}

/**
 * @param {{ _id: string, title: string, author: string, rating: number, comparisons: number, timesRead?: number, finishedAts?: number[], createdAt: number }} book
 * @param {Record<string, number[]>} [finishedAtsCache]
 * @returns {Book}
 */
function mapBook(book, finishedAtsCache) {
  const fromServer = Array.isArray(book.finishedAts) ? book.finishedAts : [];
  const fromCache =
    fromServer.length > 0
      ? []
      : (finishedAtsCache ?? readFinishedAtsCache())[
          bookKey(book.title, book.author)
        ] ?? [];
  return {
    id: book._id,
    title: book.title,
    author: book.author,
    rating: book.rating,
    comparisons: book.comparisons,
    timesRead: book.timesRead ?? 1,
    finishedAts: fromServer.length > 0 ? fromServer : fromCache,
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
  const finishedAtsCache = readFinishedAtsCache();
  return {
    books: (books ?? []).map((book) => mapBook(book, finishedAtsCache)),
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
  return mapBook(book, readFinishedAtsCache());
}

/**
 * @param {string} bookId
 */
export async function removeBookRemote(bookId) {
  await convexMutation("books:remove", { bookId });
}

/**
 * @param {{ title: string, author: string, timesRead?: number, finishedAts?: number[] }[]} rows
 * @returns {Promise<{ added: number, updated: number, dated: number, datesStored: "convex" | "local" | "none" }>}
 */
export async function importBooksRemote(rows) {
  const dated = rows.filter((r) => (r.finishedAts?.length ?? 0) > 0).length;
  const withDates = rows.map((row) => ({
    title: row.title,
    author: row.author,
    timesRead: row.timesRead,
    ...(row.finishedAts && row.finishedAts.length > 0
      ? { finishedAts: row.finishedAts }
      : {}),
  }));
  const withoutDates = rows.map((row) => ({
    title: row.title,
    author: row.author,
    timesRead: row.timesRead,
  }));

  try {
    const result = await convexMutation("books:importMany", {
      books: withDates,
    });
    // Server accepted finish dates — drop local overrides for these titles.
    if (dated > 0) {
      const cache = readFinishedAtsCache();
      let changed = false;
      for (const row of rows) {
        const key = bookKey(row.title, row.author);
        if (cache[key]) {
          delete cache[key];
          changed = true;
        }
      }
      if (changed) writeFinishedAtsCache(cache);
    }
    return {
      added: result?.added ?? 0,
      updated: result?.updated ?? 0,
      dated,
      datesStored: dated > 0 ? "convex" : "none",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const backendMissingDates =
      /extra field `finishedAts`|finishedAts.*not in the validator/i.test(
        message
      );
    if (!backendMissingDates) throw err;

    // Production Convex not redeployed yet — import titles, keep dates locally.
    cacheFinishedAtsLocally(rows);
    const result = await convexMutation("books:importMany", {
      books: withoutDates,
    });
    return {
      added: result?.added ?? 0,
      updated: result?.updated ?? 0,
      dated,
      datesStored: dated > 0 ? "local" : "none",
    };
  }
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
