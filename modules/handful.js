import { INITIAL_RATING } from "./storage.js";

/**
 * Handful sorting: rank groups of up to 5 (best → worst), then merge runs
 * by repeatedly ranking the heads of active runs.
 *
 * @typedef {import("./storage.js").Book} Book
 *
 * @typedef {{
 *   phase: "group" | "merge" | "done",
 *   pool: string[],
 *   runs: string[][],
 *   rankedIds: string[],
 *   handful: string[],
 *   handfulsCompleted: number,
 *   undoStack: HandfulUndo[],
 * }} HandfulSession
 *
 * @typedef {{
 *   session: HandfulSession,
 *   priorRatings: { bookId: string, rating: number }[],
 * }} HandfulUndo
 */

const RATING_CEILING = 1_000_000;
const HANDFUL_SIZE = 5;
const SESSION_KEY = "shelf-showdown-handful-session";

/**
 * @returns {HandfulSession}
 */
function emptySession() {
  return {
    phase: "done",
    pool: [],
    runs: [],
    rankedIds: [],
    handful: [],
    handfulsCompleted: 0,
    undoStack: [],
  };
}

/**
 * @param {Book[]} books
 * @returns {string[]}
 */
function sortedUnrankedIds(books) {
  return [...books]
    .filter((b) => b.rating === INITIAL_RATING)
    .sort(
      (a, b) =>
        (b.timesRead ?? 1) - (a.timesRead ?? 1) ||
        a.createdAt - b.createdAt ||
        a.title.localeCompare(b.title)
    )
    .map((b) => b.id);
}

/**
 * @param {Book[]} books
 * @returns {string[]}
 */
function rankedIdsFromRatings(books) {
  return [...books]
    .filter((b) => b.rating !== INITIAL_RATING)
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    )
    .map((b) => b.id);
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
function shuffle(items) {
  const copy = [...items];
  if (
    typeof process !== "undefined" &&
    process.env?.SHELF_SHOWDOWN_TEST === "1"
  ) {
    return copy;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * @param {HandfulSession} session
 * @returns {HandfulSession}
 */
function cloneSession(session) {
  return {
    phase: session.phase,
    pool: [...session.pool],
    runs: session.runs.map((r) => [...r]),
    rankedIds: [...session.rankedIds],
    handful: [...session.handful],
    handfulsCompleted: session.handfulsCompleted,
    undoStack: session.undoStack.map((u) => ({
      session: cloneSessionWithoutUndo(u.session),
      priorRatings: u.priorRatings.map((p) => ({ ...p })),
    })),
  };
}

/**
 * @param {HandfulSession} session
 * @returns {HandfulSession}
 */
function cloneSessionWithoutUndo(session) {
  return {
    phase: session.phase,
    pool: [...session.pool],
    runs: session.runs.map((r) => [...r]),
    rankedIds: [...session.rankedIds],
    handful: [...session.handful],
    handfulsCompleted: session.handfulsCompleted,
    undoStack: [],
  };
}

/**
 * @param {HandfulSession} session
 * @returns {HandfulSession}
 */
export function dealHandful(session) {
  let next = {
    ...session,
    pool: [...session.pool],
    runs: session.runs.map((r) => [...r]),
    rankedIds: [...session.rankedIds],
    handful: [],
  };

  if (next.phase === "done") {
    return next;
  }

  if (next.phase === "group") {
    if (next.pool.length === 0) {
      return beginMergeOrFinish(next);
    }
    const take = Math.min(HANDFUL_SIZE, next.pool.length);
    next.handful = shuffle(next.pool.slice(0, take));
    next.pool = next.pool.slice(take);
    return next;
  }

  // merge: rank heads of up to HANDFUL_SIZE non-empty runs
  const active = next.runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => run.length > 0);

  if (active.length === 0) {
    return { ...next, phase: "done", handful: [] };
  }

  if (active.length === 1) {
    const only = active[0];
    next.rankedIds = [...next.rankedIds, ...only.run];
    next.runs[only.index] = [];
    next.runs = next.runs.filter((r) => r.length > 0);
    return { ...next, phase: "done", handful: [] };
  }

  const heads = active.slice(0, HANDFUL_SIZE);
  next.handful = shuffle(heads.map(({ run }) => run[0]));
  return next;
}

/**
 * @param {HandfulSession} session
 * @returns {HandfulSession}
 */
function beginMergeOrFinish(session) {
  const runs = session.runs.filter((r) => r.length > 0);
  if (runs.length === 0) {
    return { ...session, runs: [], phase: "done", handful: [] };
  }
  if (runs.length === 1) {
    return {
      ...session,
      runs: [],
      rankedIds: [...session.rankedIds, ...runs[0]],
      phase: "done",
      handful: [],
    };
  }
  return dealHandful({
    ...session,
    runs,
    phase: "merge",
    handful: [],
  });
}

/**
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function createHandfulSession(books) {
  if (books.length === 0) return emptySession();

  const alreadyRanked = rankedIdsFromRatings(books);
  const pool = sortedUnrankedIds(books);

  if (pool.length === 0) {
    return {
      phase: "done",
      pool: [],
      runs: [],
      rankedIds: alreadyRanked,
      handful: [],
      handfulsCompleted: 0,
      undoStack: [],
    };
  }

  /** @type {HandfulSession} */
  const base = {
    phase: "group",
    pool,
    runs: alreadyRanked.length > 0 ? [alreadyRanked] : [],
    rankedIds: [],
    handful: [],
    handfulsCompleted: 0,
    undoStack: [],
  };

  // Existing ranked shelf is one run; new books are grouped then merged in.
  return dealHandful(base);
}

/**
 * Ignore prior ratings and sort the whole library from scratch.
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function createFreshHandfulSession(books) {
  if (books.length === 0) return emptySession();
  const pool = [...books]
    .sort(
      (a, b) =>
        (b.timesRead ?? 1) - (a.timesRead ?? 1) ||
        a.createdAt - b.createdAt ||
        a.title.localeCompare(b.title)
    )
    .map((b) => b.id);

  return dealHandful({
    phase: "group",
    pool,
    runs: [],
    rankedIds: [],
    handful: [],
    handfulsCompleted: 0,
    undoStack: [],
  });
}

/**
 * Reorder the current handful (best → worst).
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
 * Submit the current handful order.
 * Group phase → store as a sorted run.
 * Merge phase → emit the best book onto the shelf.
 *
 * @param {HandfulSession} session
 * @param {string[]} orderedIds best → worst
 * @param {Book[]} books
 * @returns {{
 *   session: HandfulSession,
 *   ratingUpdates: { bookId: string, rating: number }[],
 *   priorRatings: { bookId: string, rating: number }[],
 * }}
 */
export function submitHandful(session, orderedIds, books) {
  const ordered = setHandfulOrder(session, orderedIds);
  if (ordered.handful.length === 0 || ordered.phase === "done") {
    return { session, ratingUpdates: [], priorRatings: [] };
  }

  const snapshot = cloneSessionWithoutUndo(session);
  let next = {
    ...ordered,
    runs: ordered.runs.map((r) => [...r]),
    rankedIds: [...ordered.rankedIds],
    pool: [...ordered.pool],
    undoStack: [...ordered.undoStack],
  };

  /** @type {string[]} */
  let affectedRanked = [];

  if (next.phase === "group") {
    next.runs.push([...next.handful]);
    next.handful = [];
    next.handfulsCompleted += 1;
    next = dealHandful(next);
    // Ratings update when we first produce rankedIds (single-run finish or merge emits)
    if (next.rankedIds.length > 0) {
      affectedRanked = [...next.rankedIds];
    }
  } else if (next.phase === "merge") {
    const winnerId = next.handful[0];
    if (!winnerId) {
      return { session, ratingUpdates: [], priorRatings: [] };
    }

    const runIndex = next.runs.findIndex(
      (run) => run.length > 0 && run[0] === winnerId
    );
    if (runIndex < 0) {
      return { session, ratingUpdates: [], priorRatings: [] };
    }

    next.runs[runIndex] = next.runs[runIndex].slice(1);
    next.rankedIds.push(winnerId);
    next.handful = [];
    next.handfulsCompleted += 1;
    next.runs = next.runs.filter((r) => r.length > 0);
    next = dealHandful({ ...next, phase: "merge" });
    affectedRanked = [...next.rankedIds];
  }

  const ratingUpdates =
    affectedRanked.length > 0 ? rebalanceRatings(affectedRanked) : [];

  const byId = new Map(books.map((b) => [b.id, b]));
  const priorRatings = ratingUpdates.map((u) => ({
    bookId: u.bookId,
    rating: byId.get(u.bookId)?.rating ?? INITIAL_RATING,
  }));

  next.undoStack = [
    ...next.undoStack,
    { session: snapshot, priorRatings },
  ].slice(-40);

  return { session: next, ratingUpdates, priorRatings };
}

/**
 * Undo the last handful submit.
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
      ...cloneSession(last.session),
      undoStack: stack,
    },
    priorRatings: last.priorRatings,
  };
}

/**
 * Put one book from the current handful back and draw a replacement if possible.
 * @param {HandfulSession} session
 * @param {string} bookId
 * @returns {HandfulSession}
 */
export function skipHandfulBook(session, bookId) {
  if (!session.handful.includes(bookId) || session.phase !== "group") {
    return session;
  }
  if (session.handful.length <= 1 && session.pool.length === 0) {
    return session;
  }

  const remaining = session.handful.filter((id) => id !== bookId);
  let pool = [...session.pool];
  const need = Math.min(HANDFUL_SIZE - remaining.length, pool.length);
  const drawn = pool.slice(0, need);
  pool = [...pool.slice(need), bookId];

  return {
    ...session,
    handful: shuffle([...remaining, ...drawn]),
    pool,
  };
}

/**
 * @param {HandfulSession} session
 * @param {Book[]} books
 * @returns {HandfulSession}
 */
export function syncHandfulWithBooks(session, books) {
  const ids = new Set(books.map((b) => b.id));
  const filterIds = (arr) => arr.filter((id) => ids.has(id));

  let next = {
    ...session,
    pool: filterIds(session.pool),
    rankedIds: filterIds(session.rankedIds),
    handful: filterIds(session.handful),
    runs: session.runs.map(filterIds).filter((r) => r.length > 0),
    undoStack: [],
  };

  const known = new Set([
    ...next.pool,
    ...next.rankedIds,
    ...next.handful,
    ...next.runs.flat(),
  ]);

  for (const book of books) {
    if (known.has(book.id)) continue;
    if (book.rating !== INITIAL_RATING) {
      // Newly loaded ranked book — fold into merge runs
      next.runs.push([book.id]);
    } else {
      next.pool.push(book.id);
    }
  }

  if (next.phase === "done" && (next.pool.length > 0 || next.runs.length > 1)) {
    next.phase = next.pool.length > 0 ? "group" : "merge";
  }

  if (next.handful.length === 0 && next.phase !== "done") {
    next = dealHandful(next);
  }

  if (
    next.phase !== "done" &&
    next.handful.length === 0 &&
    next.pool.length === 0 &&
    next.runs.every((r) => r.length === 0)
  ) {
    next = { ...next, phase: "done" };
  }

  return next;
}

/**
 * @param {string[]} rankedIds
 * @returns {{ bookId: string, rating: number }[]}
 */
export function rebalanceRatings(rankedIds) {
  const n = rankedIds.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ bookId: rankedIds[0], rating: Math.round(RATING_CEILING / 2) }];
  }
  return rankedIds.map((bookId, idx) => ({
    bookId,
    rating: Math.round(RATING_CEILING - (RATING_CEILING * idx) / (n - 1)),
  }));
}

/**
 * Ratings to reset every book before a fresh sort.
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
  const placed = session.rankedIds.length;
  const inRuns = session.runs.reduce((sum, r) => sum + r.length, 0);
  const inHandful = session.handful.length;
  const remaining = Math.max(0, total - placed);
  const done =
    session.phase === "done" ||
    (placed === total && inHandful === 0 && session.pool.length === 0);

  return {
    placed,
    total,
    remaining,
    inHandful,
    inRuns,
    poolLeft: session.pool.length,
    handfulsCompleted: session.handfulsCompleted,
    phase: session.phase,
    done,
  };
}

/**
 * Rough screen count: ceil(n/5) group deals + ~n merge emits (flush last run).
 * @param {number} n
 */
export function estimatedHandfulScreens(n) {
  if (n < 2) return 0;
  const groupScreens = Math.ceil(n / HANDFUL_SIZE);
  // Merge emits one book per screen until a single run remains, then flushes.
  // With ~n/5 initial runs, roughly n - 5 books are emitted one-by-one.
  const mergeScreens = Math.max(0, n - HANDFUL_SIZE);
  return groupScreens + mergeScreens;
}

/**
 * @param {HandfulSession} session
 */
export function saveHandfulSession(session) {
  try {
    const toSave = {
      ...session,
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
    /** @type {HandfulSession} */
    const session = {
      phase: parsed.phase === "merge" || parsed.phase === "done" ? parsed.phase : "group",
      pool: Array.isArray(parsed.pool) ? parsed.pool : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      rankedIds: Array.isArray(parsed.rankedIds) ? parsed.rankedIds : [],
      handful: Array.isArray(parsed.handful) ? parsed.handful : [],
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
    // Also clear legacy binary-insertion key so old sessions don't confuse
    sessionStorage.removeItem("shelf-showdown-sort-session");
  } catch {
    // ignore
  }
}

export { HANDFUL_SIZE, RATING_CEILING };
