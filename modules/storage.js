import { convexMutation, convexQuery } from "./convexClient.js?v=20260810d";

export const INITIAL_RATING = 1500;

const FINISHED_ATS_CACHE_KEY = "shelf.showdown.finishedAts";
/** `1` = Convex accepts finishedAts; `0` = rejected (prod not redeployed). */
const FINISHED_ATS_SUPPORT_KEY = "shelf.showdown.supportsFinishedAts";
/** Bump to re-probe Convex for finishedAts support after a deploy. */
export const FINISHED_ATS_SUPPORT_VERSION = "20260810c";
const FINISHED_ATS_SUPPORT_VERSION_KEY = "shelf.showdown.supportsFinishedAts.v";

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
 * @param {unknown} err
 */
function isFinishedAtsRejected(err) {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /finishedAts/i.test(message) &&
    /extra field|not in the validator|ArgumentValidationError/i.test(message)
  );
}

function readFinishedAtsSupport() {
  try {
    const version = localStorage.getItem(FINISHED_ATS_SUPPORT_VERSION_KEY);
    if (version !== FINISHED_ATS_SUPPORT_VERSION) {
      localStorage.removeItem(FINISHED_ATS_SUPPORT_KEY);
      localStorage.setItem(
        FINISHED_ATS_SUPPORT_VERSION_KEY,
        FINISHED_ATS_SUPPORT_VERSION
      );
      return null;
    }
    const flag = localStorage.getItem(FINISHED_ATS_SUPPORT_KEY);
    if (flag === "1") return true;
    if (flag === "0") return false;
  } catch {
    // ignore
  }
  return null;
}

/** @param {boolean} supported */
function writeFinishedAtsSupport(supported) {
  try {
    localStorage.setItem(FINISHED_ATS_SUPPORT_KEY, supported ? "1" : "0");
    localStorage.setItem(
      FINISHED_ATS_SUPPORT_VERSION_KEY,
      FINISHED_ATS_SUPPORT_VERSION
    );
  } catch {
    // ignore
  }
}

/**
 * @param {{ title: string, author: string, timesRead?: number, finishedAts?: number[] }[]} rows
 * @returns {Promise<{ added: number, updated: number, dated: number, datesStored: "convex" | "local" | "none" }>}
 */
export async function importBooksRemote(rows) {
  const dated = rows.filter((r) => (r.finishedAts?.length ?? 0) > 0).length;
  // Always keep finish dates locally so Stats works even when Convex is behind.
  if (dated > 0) cacheFinishedAtsLocally(rows);

  const withoutDates = rows.map((row) => ({
    title: row.title,
    author: row.author,
    timesRead: row.timesRead,
  }));
  const withDates = rows.map((row) => ({
    title: row.title,
    author: row.author,
    timesRead: row.timesRead,
    ...(row.finishedAts && row.finishedAts.length > 0
      ? { finishedAts: row.finishedAts }
      : {}),
  }));

  const knownSupport = readFinishedAtsSupport();
  const tryWithDates = dated > 0 && knownSupport !== false;

  if (tryWithDates) {
    try {
      const result = await convexMutation("books:importMany", {
        books: withDates,
      });
      writeFinishedAtsSupport(true);
      // Server has the dates — drop local overrides for these titles.
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
      return {
        added: result?.added ?? 0,
        updated: result?.updated ?? 0,
        dated,
        datesStored: "convex",
      };
    } catch (err) {
      if (!isFinishedAtsRejected(err)) throw err;
      writeFinishedAtsSupport(false);
      // Fall through to import without finishedAts.
    }
  }

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

export async function clearLibraryRemote() {
  await convexMutation("books:clearAll", {});
  try {
    localStorage.removeItem(FINISHED_ATS_CACHE_KEY);
  } catch {
    // ignore
  }
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
