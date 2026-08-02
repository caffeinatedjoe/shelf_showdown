import { createId, INITIAL_RATING } from "./storage.js";
import { updateRatings } from "./ranking.js";

/**
 * @typedef {import("./storage.js").Book} Book
 * @typedef {import("./storage.js").Comparison} Comparison
 * @typedef {import("./storage.js").AppState} AppState
 */

/**
 * Binary-insertion sort session.
 * `rankedIds` is best → worst. Each unranked book is placed with ~log₂(n) picks.
 *
 * @typedef {{
 *   bookId: string,
 *   rankedIdsBefore: string[],
 *   low: number,
 *   high: number,
 *   priorRatings: { bookId: string, rating: number }[],
 * }} PlacementUndo
 *
 * @typedef {{
 *   rankedIds: string[],
 *   candidateId: string | null,
 *   low: number,
 *   high: number,
 *   pivotIndex: number | null,
 *   boundStack: {
 *     low: number,
 *     high: number,
 *     pivotIndex: number | null,
 *     candidateId: string | null,
 *     pending: Record<string, { low: number, high: number }>,
 *   }[],
 *   pending: Record<string, { low: number, high: number }>,
 *   lastPlacement: PlacementUndo | null,
 *   phase: "inserting" | "done",
 * }} SortSession
 */

const RATING_CEILING = 1_000_000;
const MIN_RATING_GAP = 2;
const SESSION_KEY = "shelf-showdown-sort-session";
/** Chance to jump to a different unranked book after a non-placing pick. */
const ROTATE_CANDIDATE_CHANCE =
  typeof process !== "undefined" && process.env?.SHELF_SHOWDOWN_TEST === "1"
    ? 0
    : 0.62;

/**
 * @param {Book[]} books
 * @returns {string | null}
 */
function pickSeedId(books) {
  if (books.length === 0) return null;
  const sorted = [...books].sort(
    (a, b) =>
      (b.timesRead ?? 1) - (a.timesRead ?? 1) ||
      a.createdAt - b.createdAt ||
      a.title.localeCompare(b.title)
  );
  return sorted[0]?.id ?? null;
}

/**
 * @param {Book[]} books
 * @returns {SortSession}
 */
export function createSortSession(books) {
  if (books.length === 0) {
    return emptySession();
  }

  // Position-based ratings (≠ default) mark books already placed on the shelf.
  // Comparison count alone is not enough — a book mid-insertion has picks but no rating yet.
  const previouslyRanked = books.filter((b) => b.rating !== INITIAL_RATING);
  if (previouslyRanked.length > 0) {
    const rankedIds = [...previouslyRanked]
      .sort(
        (a, b) =>
          b.rating - a.rating || a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
      )
      .map((b) => b.id);
    return beginNextCandidate(
      {
        rankedIds,
        candidateId: null,
        low: 0,
        high: 0,
        pivotIndex: null,
        boundStack: [],
        pending: {},
        lastPlacement: null,
        phase: "inserting",
      },
      books
    );
  }

  const seedId = pickSeedId(books);
  if (!seedId) return emptySession();

  return beginNextCandidate(
    {
      rankedIds: [seedId],
      candidateId: null,
      low: 0,
      high: 0,
      pivotIndex: null,
      boundStack: [],
      pending: {},
      lastPlacement: null,
      phase: "inserting",
    },
    books
  );
}

/**
 * Ignore prior comparison history and start a fresh binary-insertion sort.
 * @param {Book[]} books
 * @returns {SortSession}
 */
export function createFreshSortSession(books) {
  if (books.length === 0) return emptySession();
  const seedId = pickSeedId(books);
  if (!seedId) return emptySession();
  return beginNextCandidate(
    {
      rankedIds: [seedId],
      candidateId: null,
      low: 0,
      high: 0,
      pivotIndex: null,
      boundStack: [],
      pending: {},
      lastPlacement: null,
      phase: "inserting",
    },
    books
  );
}

/** @returns {SortSession} */
function emptySession() {
  return {
    rankedIds: [],
    candidateId: null,
    low: 0,
    high: 0,
    pivotIndex: null,
    boundStack: [],
    pending: {},
    lastPlacement: null,
    phase: "done",
  };
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T | undefined}
 */
function pickRandom(items) {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * @param {number} low
 * @param {number} high
 * @returns {number | null}
 */
function randomPivot(low, high) {
  if (low >= high) return null;
  // Deterministic midpoint in tests; random opponent in the app for variety.
  if (
    typeof process !== "undefined" &&
    process.env?.SHELF_SHOWDOWN_TEST === "1"
  ) {
    return Math.floor((low + high) / 2);
  }
  return low + Math.floor(Math.random() * (high - low));
}

/**
 * @param {SortSession} session
 * @returns {SortSession}
 */
function withFreshPivot(session) {
  return {
    ...session,
    pivotIndex: randomPivot(session.low, session.high),
  };
}

/**
 * Normalize older sessionStorage payloads that predate pivot/pending fields.
 * @param {Partial<SortSession> & { rankedIds: string[] }} raw
 * @returns {SortSession}
 */
function normalizeSession(raw) {
  return {
    rankedIds: raw.rankedIds ?? [],
    candidateId: raw.candidateId ?? null,
    low: raw.low ?? 0,
    high: raw.high ?? 0,
    pivotIndex: raw.pivotIndex ?? null,
    boundStack: Array.isArray(raw.boundStack) ? raw.boundStack : [],
    pending: raw.pending && typeof raw.pending === "object" ? raw.pending : {},
    lastPlacement: raw.lastPlacement ?? null,
    phase: raw.phase === "done" ? "done" : "inserting",
  };
}

/**
 * @param {Book[]} books
 * @param {string | null} [avoidId]
 * @param {SortSession} session
 * @returns {string | null}
 */
function pickNextUnrankedId(session, books, avoidId = null) {
  const rankedSet = new Set(session.rankedIds);
  const pendingIds = Object.keys(session.pending ?? {}).filter(
    (id) => !rankedSet.has(id) && books.some((b) => b.id === id)
  );
  const freshIds = books
    .filter((b) => !rankedSet.has(b.id) && !(session.pending ?? {})[b.id])
    .map((b) => b.id);
  const pool = [...new Set([...pendingIds, ...freshIds])].filter(
    (id) => id !== avoidId
  );
  const fallback = [...new Set([...pendingIds, ...freshIds])];
  const choices = pool.length > 0 ? pool : fallback;
  if (choices.length === 0) return null;
  if (
    typeof process !== "undefined" &&
    process.env?.SHELF_SHOWDOWN_TEST === "1"
  ) {
    return choices.sort()[0] ?? null;
  }
  return pickRandom(choices) ?? null;
}

/**
 * @param {SortSession} session
 * @param {Book[]} books
 * @param {string | null} [avoidId]
 * @returns {SortSession}
 */
function beginNextCandidate(session, books, avoidId = null) {
  const pending = { ...(session.pending ?? {}) };
  const nextId = pickNextUnrankedId(
    { ...session, pending },
    books,
    avoidId
  );

  if (!nextId) {
    return {
      rankedIds: session.rankedIds,
      candidateId: null,
      low: 0,
      high: 0,
      pivotIndex: null,
      boundStack: [],
      pending: {},
      lastPlacement: session.lastPlacement ?? null,
      phase: "done",
    };
  }

  if (session.rankedIds.length === 0) {
    return beginNextCandidate(
      {
        rankedIds: [nextId],
        candidateId: null,
        low: 0,
        high: 0,
        pivotIndex: null,
        boundStack: [],
        pending: {},
        lastPlacement: null,
        phase: "inserting",
      },
      books,
      avoidId
    );
  }

  const saved = pending[nextId];
  delete pending[nextId];
  const low = saved?.low ?? 0;
  const high = saved?.high ?? session.rankedIds.length;
  const clampedLow = Math.max(0, Math.min(low, session.rankedIds.length));
  const clampedHigh = Math.max(
    clampedLow,
    Math.min(high, session.rankedIds.length)
  );

  return withFreshPivot({
    rankedIds: session.rankedIds,
    candidateId: nextId,
    low: clampedLow,
    high: clampedHigh,
    pivotIndex: null,
    boundStack: session.boundStack ?? [],
    pending,
    lastPlacement: session.lastPlacement ?? null,
    phase: "inserting",
  });
}

/**
 * Park the current candidate and open a different one (variety between titles).
 * @param {SortSession} session
 * @param {Book[]} books
 * @returns {SortSession}
 */
function rotateCandidate(session, books) {
  if (!session.candidateId) return session;
  const pending = {
    ...(session.pending ?? {}),
    [session.candidateId]: { low: session.low, high: session.high },
  };
  return beginNextCandidate(
    {
      ...session,
      pending,
      candidateId: null,
      pivotIndex: null,
    },
    books,
    session.candidateId
  );
}

/**
 * @param {SortSession} session
 * @param {Book[]} books
 * @returns {SortSession}
 */
export function syncSessionWithBooks(session, books) {
  const normalized = normalizeSession(session);
  const ids = new Set(books.map((b) => b.id));
  const rankedIds = normalized.rankedIds.filter((id) => ids.has(id));
  const pending = Object.fromEntries(
    Object.entries(normalized.pending ?? {}).filter(([id]) => ids.has(id))
  );

  if (rankedIds.length === 0 && books.length > 0) {
    return createSortSession(books);
  }

  let next = {
    ...normalized,
    rankedIds,
    pending,
  };

  if (next.candidateId && !ids.has(next.candidateId)) {
    next = beginNextCandidate(
      { ...next, candidateId: null, boundStack: [], pivotIndex: null },
      books
    );
  } else if (next.candidateId) {
    next = {
      ...next,
      high: Math.min(next.high, rankedIds.length),
      low: Math.min(next.low, rankedIds.length),
    };
    if (next.low > next.high) {
      next = { ...next, low: next.high };
    }
    if (next.low >= next.high && next.candidateId) {
      const rankedIdsWithCandidate = [...next.rankedIds];
      rankedIdsWithCandidate.splice(next.low, 0, next.candidateId);
      const { [next.candidateId]: _drop, ...restPending } = next.pending;
      next = beginNextCandidate(
        {
          rankedIds: rankedIdsWithCandidate,
          candidateId: null,
          low: 0,
          high: 0,
          pivotIndex: null,
          boundStack: [],
          pending: restPending,
          lastPlacement: null,
          phase: "inserting",
        },
        books
      );
    } else if (
      next.pivotIndex == null ||
      next.pivotIndex < next.low ||
      next.pivotIndex >= next.high
    ) {
      next = withFreshPivot(next);
    }
  } else if (next.phase !== "done") {
    next = beginNextCandidate(next, books);
  } else {
    const rankedSet = new Set(rankedIds);
    if (books.some((b) => !rankedSet.has(b.id))) {
      next = beginNextCandidate({ ...next, phase: "inserting" }, books);
    }
  }

  return next;
}

/**
 * Current matchup: candidate vs the session pivot inside the insertion range.
 * Pair order is shuffled so the same title is not always on the left.
 * @param {SortSession} session
 * @param {Book[]} books
 * @returns {[Book, Book] | null}
 */
export function pickPairFromSession(session, books) {
  if (session.phase !== "inserting" || !session.candidateId) return null;
  if (session.low >= session.high) return null;

  const pivot =
    session.pivotIndex != null &&
    session.pivotIndex >= session.low &&
    session.pivotIndex < session.high
      ? session.pivotIndex
      : null;
  if (pivot == null) return null;

  const opponentId = session.rankedIds[pivot];
  const candidate = books.find((b) => b.id === session.candidateId);
  const opponent = books.find((b) => b.id === opponentId);
  if (!candidate || !opponent) return null;

  return [candidate, opponent];
}

/**
 * Ensure the session has a valid pivot before showing/recording a matchup.
 * @param {SortSession} session
 * @returns {SortSession}
 */
export function ensureMatchupPivot(session) {
  if (session.phase !== "inserting" || !session.candidateId) return session;
  if (session.low >= session.high) return session;
  if (
    session.pivotIndex != null &&
    session.pivotIndex >= session.low &&
    session.pivotIndex < session.high
  ) {
    return session;
  }
  return withFreshPivot(session);
}

/**
 * Apply a pick to the binary-search bounds.
 * When the range collapses, the candidate is inserted into `rankedIds`.
 *
 * @param {SortSession} session
 * @param {string} winnerId
 * @param {Book[]} books
 * @returns {{
 *   session: SortSession,
 *   placed: boolean,
 *   placedId: string | null,
 *   placementIndex: number,
 *   rankedIdsBefore: string[],
 *   boundsBefore: { low: number, high: number },
 * }}
 */
export function applyInsertionPick(session, winnerId, books) {
  const noop = {
    session,
    placed: false,
    placedId: null,
    placementIndex: -1,
    rankedIdsBefore: session.rankedIds,
    boundsBefore: { low: session.low, high: session.high },
  };

  if (!session.candidateId || session.low >= session.high) {
    return noop;
  }

  const pivot =
    session.pivotIndex != null &&
    session.pivotIndex >= session.low &&
    session.pivotIndex < session.high
      ? session.pivotIndex
      : Math.floor((session.low + session.high) / 2);
  const opponentId = session.rankedIds[pivot];
  const candidateId = session.candidateId;
  const boundsBefore = { low: session.low, high: session.high };

  const boundStack = [
    ...session.boundStack,
    {
      low: session.low,
      high: session.high,
      pivotIndex: session.pivotIndex,
      candidateId: session.candidateId,
      pending: { ...(session.pending ?? {}) },
    },
  ];
  let low = session.low;
  let high = session.high;

  // Ranked is best → worst. If candidate wins, it belongs at or above pivot.
  if (winnerId === candidateId) {
    high = pivot;
  } else if (winnerId === opponentId) {
    low = pivot + 1;
  } else {
    return noop;
  }

  if (low < high) {
    let nextSession = withFreshPivot({
      ...session,
      low,
      high,
      boundStack,
      lastPlacement: null,
    });

    // Jump to another title often so the slate doesn't feel stuck on one book
    const unrankedCount = books.filter(
      (b) => !session.rankedIds.includes(b.id)
    ).length;
    if (Math.random() < ROTATE_CANDIDATE_CHANCE && unrankedCount > 1) {
      nextSession = rotateCandidate(nextSession, books);
    }

    return {
      session: nextSession,
      placed: false,
      placedId: null,
      placementIndex: -1,
      rankedIdsBefore: session.rankedIds,
      boundsBefore,
    };
  }

  const rankedIdsBefore = [...session.rankedIds];
  const rankedIds = [...session.rankedIds];
  rankedIds.splice(low, 0, candidateId);
  const pending = { ...(session.pending ?? {}) };
  delete pending[candidateId];

  /** @type {PlacementUndo} */
  const lastPlacement = {
    bookId: candidateId,
    rankedIdsBefore,
    low: boundsBefore.low,
    high: boundsBefore.high,
    priorRatings: [],
  };

  const placedSession = beginNextCandidate(
    {
      rankedIds,
      candidateId: null,
      low: 0,
      high: 0,
      pivotIndex: null,
      boundStack: [],
      pending,
      lastPlacement,
      phase: "inserting",
    },
    books
  );

  return {
    session: placedSession,
    placed: true,
    placedId: candidateId,
    placementIndex: low,
    rankedIdsBefore,
    boundsBefore,
  };
}

/**
 * Skip the current candidate; park it and open a random other unranked book.
 * @param {SortSession} session
 * @param {Book[]} books
 * @returns {SortSession}
 */
export function skipCandidate(session, books) {
  if (!session.candidateId) return session;
  const pending = {
    ...(session.pending ?? {}),
    [session.candidateId]: { low: session.low, high: session.high },
  };
  const next = beginNextCandidate(
    {
      ...session,
      pending,
      candidateId: null,
      boundStack: [],
      pivotIndex: null,
    },
    books,
    session.candidateId
  );
  // If only one book left, reset its search range for a fresh attempt
  if (next.candidateId === session.candidateId) {
    return withFreshPivot({
      ...session,
      low: 0,
      high: session.rankedIds.length,
      boundStack: [],
      pending: session.pending ?? {},
    });
  }
  return next;
}

/**
 * Undo the last bounds change, or undo a just-completed placement.
 * @param {SortSession} session
 * @returns {{ session: SortSession, kind: "bound" | "placement" } | null}
 */
export function undoInsertionStep(session) {
  if (session.boundStack.length > 0) {
    const boundStack = [...session.boundStack];
    const prev = boundStack.pop();
    if (!prev) return null;
    return {
      session: withFreshPivot({
        ...session,
        candidateId: prev.candidateId ?? session.candidateId,
        low: prev.low,
        high: prev.high,
        pivotIndex: prev.pivotIndex ?? null,
        pending: prev.pending ?? session.pending ?? {},
        boundStack,
        lastPlacement: null,
        phase: "inserting",
      }),
      kind: "bound",
    };
  }

  const placement = session.lastPlacement;
  if (!placement) return null;

  return {
    session: withFreshPivot({
      rankedIds: placement.rankedIdsBefore,
      candidateId: placement.bookId,
      low: placement.low,
      high: placement.high,
      pivotIndex: null,
      boundStack: [],
      pending: session.pending ?? {},
      lastPlacement: null,
      phase: "inserting",
    }),
    kind: "placement",
  };
}

/**
 * Attach prior ratings to the latest placement undo record.
 * @param {SortSession} session
 * @param {{ bookId: string, rating: number }[]} priorRatings
 * @returns {SortSession}
 */
export function withPlacementPriorRatings(session, priorRatings) {
  if (!session.lastPlacement) return session;
  return {
    ...session,
    lastPlacement: {
      ...session.lastPlacement,
      priorRatings,
    },
  };
}

/**
 * Ratings to write after inserting `placedId` into `rankedIds` (already includes it).
 * @param {string[]} rankedIds
 * @param {Book[]} books
 * @param {string} placedId
 * @returns {{ bookId: string, rating: number }[]}
 */
export function ratingUpdatesForPlacement(rankedIds, books, placedId) {
  const byId = new Map(books.map((b) => [b.id, b]));
  const i = rankedIds.indexOf(placedId);
  if (i < 0) return [];

  const above = i > 0 ? byId.get(rankedIds[i - 1])?.rating : RATING_CEILING;
  const below =
    i < rankedIds.length - 1 ? byId.get(rankedIds[i + 1])?.rating : 0;

  if (
    typeof above === "number" &&
    typeof below === "number" &&
    above - below > MIN_RATING_GAP
  ) {
    return [{ bookId: placedId, rating: Math.round((above + below) / 2) }];
  }

  return rebalanceRatings(rankedIds);
}

/**
 * Seed rating for the first book in a fresh sort.
 * @param {string} bookId
 * @returns {{ bookId: string, rating: number }[]}
 */
export function seedRatingUpdate(bookId) {
  return [{ bookId, rating: Math.round(RATING_CEILING / 2) }];
}

/**
 * @param {string[]} rankedIds
 * @returns {{ bookId: string, rating: number }[]}
 */
export function rebalanceRatings(rankedIds) {
  const n = rankedIds.length;
  if (n === 0) return [];
  if (n === 1) return [{ bookId: rankedIds[0], rating: Math.round(RATING_CEILING / 2) }];
  return rankedIds.map((bookId, idx) => ({
    bookId,
    rating: Math.round(RATING_CEILING - (RATING_CEILING * idx) / (n - 1)),
  }));
}

/**
 * @param {SortSession} session
 * @param {Book[]} books
 * @returns {{ placed: number, total: number, remaining: number, picksLeftApprox: number, done: boolean, candidateTitle: string | null }}
 */
export function sortProgress(session, books) {
  const total = books.length;
  const placed = session.rankedIds.length;
  const hasCandidate = Boolean(session.candidateId);
  const remaining = Math.max(0, total - placed);
  const range = Math.max(0, session.high - session.low);
  const picksLeftApprox = range <= 1 ? 0 : Math.ceil(Math.log2(range));
  const candidate = session.candidateId
    ? books.find((b) => b.id === session.candidateId)
    : null;

  return {
    placed,
    total,
    remaining: hasCandidate ? remaining : Math.max(0, total - placed),
    picksLeftApprox,
    done: session.phase === "done" || remaining === 0,
    candidateTitle: candidate?.title ?? null,
  };
}

/**
 * Estimated comparisons to fully sort n books via binary insertion.
 * @param {number} n
 */
export function estimatedSortComparisons(n) {
  if (n < 2) return 0;
  let total = 0;
  for (let k = 1; k < n; k++) {
    total += Math.ceil(Math.log2(k + 1));
  }
  return total;
}

/**
 * @param {SortSession} session
 */
export function saveSortSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * @param {Book[]} books
 * @returns {SortSession}
 */
export function loadSortSession(books) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return createSortSession(books);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rankedIds)) {
      return createSortSession(books);
    }
    return syncSessionWithBooks(normalizeSession(parsed), books);
  } catch {
    return createSortSession(books);
  }
}

export function clearSortSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
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
    winner.rating = last.ratingA;
    loser.rating = last.ratingB;
    winner.comparisons = Math.max(0, winner.comparisons - 1);
    loser.comparisons = Math.max(0, loser.comparisons - 1);
  }

  return { books, comparisons };
}

export { parseCsv } from "./tabular.js";
