import { INITIAL_RATING } from "./storage.js";
import {
  adjacentPairsFromRanking,
  ratingUpdatesFromRanking,
} from "./ranking.js";

/**
 * Random handful ranking with Bradley-Terry (Elo) updates.
 * Each submit expands the dragged order into pairwise outcomes and updates ratings.
 *
 * @typedef {import("./storage.js").Book} Book
 *
 * @typedef {{
 *   phase: "ranking" | "done",
 *   handful: string[],
 *   recentIds: string[],
 *   handfulsCompleted: number,
 *   undoStack: HandfulUndo[],
 * }} HandfulSession
 *
 * @typedef {{
 *   session: HandfulSession,
 *   priorRatings: { bookId: string, rating: number }[],
 * }} HandfulUndo
 */

const HANDFUL_SIZE = 5;
const RECENT_LIMIT = 12;
const SESSION_KEY = "shelf-showdown-handful-session";

/**
 * Target comparisons per book before we consider the shelf "warmed up".
 * @param {number} n
 */
export function targetComparisonsPerBook(n) {
  if (n < 2) return 0;
  // Roughly a few full handfuls of opponents each (~ log-ish growth).
  return Math.max(6, Math.ceil(2.5 * Math.log2(n)));
}

/**
 * @returns {HandfulSession}
 */
function emptySession() {
  return {
    phase: "done",
    handful: [],
    recentIds: [],
    handfulsCompleted: 0,
    undoStack: [],
  };
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Deterministic shuffle for tests (rotate by 1) so order isn't title-sorted.
 * @template T
 * @param {T[]} items
 */
function testShuffle(items) {
  if (items.length < 2) return [...items];
  return [...items.slice(1), items[0]];
}

/**
 * @template T
 * @param {T[]} items
 */
function maybeShuffle(items) {
  if (
    typeof process !== "undefined" &&
    process.env?.SHELF_SHOWDOWN_TEST === "1"
  ) {
    return testShuffle(items);
  }
  return shuffle(items);
}

/**
 * Weighted random sample favoring under-compared books; avoids recent when possible.
 * @param {Book[]} books
 * @param {string[]} recentIds
 * @param {number} size
 * @returns {string[]}
 */
export function pickRandomHandfulIds(books, recentIds = [], size = HANDFUL_SIZE) {
  if (books.length === 0) return [];
  const take = Math.min(size, books.length);
  const recent = new Set(recentIds);

  /** @type {{ id: string, weight: number }[]} */
  const candidates = books.map((b) => {
    const underCompared = 1 / (1 + (b.comparisons ?? 0));
    const recencyPenalty = recent.has(b.id) ? 0.08 : 1;
    // Small noise so ties don't collapse to insertion / title order.
    const noise =
      typeof process !== "undefined" && process.env?.SHELF_SHOWDOWN_TEST === "1"
        ? (b.id.charCodeAt(b.id.length - 1) % 7) * 0.01
        : Math.random() * 0.35;
    return {
      id: b.id,
      weight: Math.max(0.001, underCompared * recencyPenalty + noise),
    };
  });

  /** @type {string[]} */
  const picked = [];
  const pool = [...candidates];

  while (picked.length < take && pool.length > 0) {
    const total = pool.reduce((sum, c) => sum + c.weight, 0);
    let r =
      typeof process !== "undefined" && process.env?.SHELF_SHOWDOWN_TEST === "1"
        ? total * 0.37 // fixed but not first-item bias
        : Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    picked.push(pool[idx].id);
    pool.splice(idx, 1);
  }

  return maybeShuffle(picked);
}

/**
 * @param {HandfulSession} session
 * @returns {HandfulSession}
 */
function cloneSessionWithoutUndo(session) {
  return {
    phase: session.phase,
    handful: [...session.handful],
    recentIds: [...session.recentIds],
    handfulsCompleted: session.handfulsCompleted,
    undoStack: [],
  };
}

/**
 * @param {HandfulSession} session
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function dealHandful(session, books) {
  if (books.length < 2) {
    return { ...session, phase: "done", handful: [] };
  }

  const target = targetComparisonsPerBook(books.length);
  const warmed = books.every((b) => (b.comparisons ?? 0) >= target);

  const handful = pickRandomHandfulIds(books, session.recentIds, HANDFUL_SIZE);
  return {
    ...session,
    phase: warmed ? "done" : "ranking",
    // Even when "done", still deal a handful so the user can keep refining.
    handful: handful.length >= 2 ? handful : pickRandomHandfulIds(books, [], HANDFUL_SIZE),
  };
}

/**
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function createHandfulSession(books) {
  if (books.length < 2) return emptySession();
  return dealHandful(
    {
      phase: "ranking",
      handful: [],
      recentIds: [],
      handfulsCompleted: 0,
      undoStack: [],
    },
    books
  );
}

/**
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function createFreshHandfulSession(books) {
  return createHandfulSession(books);
}

/**
 * @param {HandfulSession} session
 * @param {string[]} orderedIds
 * @returns {HandfulSession}
 */
export function setHandfulOrder(session, orderedIds) {
  const current = new Set(session.handful);
  if (
    orderedIds.length !== session.handful.length ||
    orderedIds.some((id) => !current.has(id))
  ) {
    return session;
  }
  return { ...session, handful: [...orderedIds] };
}

/**
 * Submit the current handful: BT rating updates + deal the next random set.
 *
 * @param {HandfulSession} session
 * @param {string[]} orderedIds best → worst
 * @param {Book[]} books
 * @returns {{
 *   session: HandfulSession,
 *   ratingUpdates: { bookId: string, rating: number }[],
 *   priorRatings: { bookId: string, rating: number }[],
 *   pairs: { winnerId: string, loserId: string }[],
 * }}
 */
export function submitHandful(session, orderedIds, books) {
  const ordered = setHandfulOrder(session, orderedIds);
  if (ordered.handful.length < 2) {
    return { session, ratingUpdates: [], priorRatings: [], pairs: [] };
  }

  const snapshot = cloneSessionWithoutUndo(session);
  const byId = new Map(books.map((b) => [b.id, b]));
  /** @type {Map<string, number>} */
  const ratingMap = new Map(books.map((b) => [b.id, b.rating]));

  const ratingUpdates = ratingUpdatesFromRanking(ordered.handful, ratingMap);
  const pairs = adjacentPairsFromRanking(ordered.handful);
  const priorRatings = ratingUpdates.map((u) => ({
    bookId: u.bookId,
    rating: byId.get(u.bookId)?.rating ?? INITIAL_RATING,
  }));

  // Optimistically bump local comparison counts for the next deal weights.
  const nextBooks = books.map((b) => {
    if (!ordered.handful.includes(b.id)) return b;
    const update = ratingUpdates.find((u) => u.bookId === b.id);
    return {
      ...b,
      rating: update?.rating ?? b.rating,
      comparisons: (b.comparisons ?? 0) + (ordered.handful.length - 1),
    };
  });

  const recentIds = [...ordered.handful, ...session.recentIds].slice(
    0,
    RECENT_LIMIT
  );

  const undoStack = [
    ...session.undoStack,
    { session: snapshot, priorRatings },
  ].slice(-40);

  const next = dealHandful(
    {
      phase: "ranking",
      handful: [],
      recentIds,
      handfulsCompleted: session.handfulsCompleted + 1,
      undoStack,
    },
    nextBooks
  );

  return { session: next, ratingUpdates, priorRatings, pairs };
}

/**
 * @param {HandfulSession} session
 * @returns {{ session: HandfulSession, priorRatings: { bookId: string, rating: number }[] } | null}
 */
export function undoHandful(session) {
  if (session.undoStack.length === 0) return null;
  const stack = [...session.undoStack];
  const last = stack.pop();
  if (!last) return null;
  return {
    session: {
      ...cloneSessionWithoutUndo(last.session),
      undoStack: stack,
    },
    priorRatings: last.priorRatings,
  };
}

/**
 * Replace one book in the current handful with another random title.
 * @param {HandfulSession} session
 * @param {string} bookId
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function skipHandfulBook(session, bookId, books) {
  if (!session.handful.includes(bookId) || books.length < 3) {
    return session;
  }
  const remaining = session.handful.filter((id) => id !== bookId);
  const exclude = new Set([...remaining, bookId, ...session.recentIds]);
  const replacements = books.filter((b) => !exclude.has(b.id));
  const pool = replacements.length > 0 ? replacements : books.filter((b) => b.id !== bookId && !remaining.includes(b.id));
  if (pool.length === 0) return session;

  const nextId = pickRandomHandfulIds(pool, [], 1)[0];
  if (!nextId) return session;

  return {
    ...session,
    handful: maybeShuffle([...remaining, nextId]),
  };
}

/**
 * @param {HandfulSession} session
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function syncHandfulWithBooks(session, books) {
  if (books.length < 2) return emptySession();

  const ids = new Set(books.map((b) => b.id));
  let next = {
    ...session,
    handful: session.handful.filter((id) => ids.has(id)),
    recentIds: session.recentIds.filter((id) => ids.has(id)),
    // Drop undo across library edits — ratings may have changed under us.
    undoStack: [],
  };

  // Migrate legacy group/merge sessions.
  if (session.phase === "group" || session.phase === "merge") {
    return createHandfulSession(books);
  }

  if (next.handful.length < 2) {
    next = dealHandful(next, books);
  }

  return next;
}

/**
 * @param {Book[]} books
 * @returns {{ bookId: string, rating: number }[]}
 */
export function resetAllRatings(books) {
  return books.map((b) => ({ bookId: b.id, rating: INITIAL_RATING }));
}

/**
 * @param {HandfulSession} session
 * @param {Book[]} books
 */
export function handfulProgress(session, books) {
  const total = books.length;
  const target = targetComparisonsPerBook(total);
  const comparisonCounts = books.map((b) => b.comparisons ?? 0);
  const warmedCount = comparisonCounts.filter((c) => c >= target).length;
  const minComparisons =
    comparisonCounts.length === 0 ? 0 : Math.min(...comparisonCounts);
  const avgComparisons =
    comparisonCounts.length === 0
      ? 0
      : comparisonCounts.reduce((a, b) => a + b, 0) / comparisonCounts.length;

  const done =
    session.phase === "done" ||
    (total >= 2 && warmedCount === total);

  return {
    placed: warmedCount,
    total,
    remaining: Math.max(0, total - warmedCount),
    inHandful: session.handful.length,
    targetComparisons: target,
    minComparisons,
    avgComparisons,
    handfulsCompleted: session.handfulsCompleted,
    phase: session.phase === "done" ? "done" : "ranking",
    done,
  };
}

/**
 * Rough handfuls to warm every book to the comparison target.
 * @param {number} n
 */
export function estimatedHandfulScreens(n) {
  if (n < 2) return 0;
  const perBook = targetComparisonsPerBook(n);
  // Each handful gives (size-1) comparisons to each of `size` books.
  const size = Math.min(HANDFUL_SIZE, n);
  const compsPerHandful = size * (size - 1);
  return Math.ceil((n * perBook) / compsPerHandful);
}

/**
 * @param {HandfulSession} session
 */
export function saveHandfulSession(session) {
  try {
    const toSave = {
      phase: session.phase,
      handful: session.handful,
      recentIds: session.recentIds,
      handfulsCompleted: session.handfulsCompleted,
      undoStack: session.undoStack.map((u) => ({
        session: cloneSessionWithoutUndo(u.session),
        priorRatings: u.priorRatings,
      })),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

/**
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function loadHandfulSession(books) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return createHandfulSession(books);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.handful)) {
      return createHandfulSession(books);
    }

    // Legacy merge/group sessions → start fresh random BT flow.
    if (parsed.phase === "group" || parsed.phase === "merge" || Array.isArray(parsed.runs)) {
      clearHandfulSession();
      return createHandfulSession(books);
    }

    /** @type {HandfulSession} */
    const session = {
      phase: parsed.phase === "done" ? "done" : "ranking",
      handful: Array.isArray(parsed.handful) ? parsed.handful : [],
      recentIds: Array.isArray(parsed.recentIds) ? parsed.recentIds : [],
      handfulsCompleted: Number(parsed.handfulsCompleted) || 0,
      undoStack: Array.isArray(parsed.undoStack) ? parsed.undoStack : [],
    };
    return syncHandfulWithBooks(session, books);
  } catch {
    return createHandfulSession(books);
  }
}

export function clearHandfulSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem("shelf-showdown-sort-session");
  } catch {
    // ignore
  }
}

export { HANDFUL_SIZE, adjacentPairsFromRanking };
