/**
 * Node test suite for binary-insertion ranking.
 * Run: node --test modules/comparisons.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyInsertionPick,
  createFreshSortSession,
  createSortSession,
  estimatedSortComparisons,
  pickPairFromSession,
  ratingUpdatesForPlacement,
  skipCandidate,
  syncSessionWithBooks,
  undoInsertionStep,
} from "./comparisons.js";
import { INITIAL_RATING } from "./storage.js";

/**
 * @param {number} n
 * @param {{ rating?: number }} [opts]
 */
function makeBooks(n, opts = {}) {
  const rating = opts.rating ?? INITIAL_RATING;
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    title: `Book ${String(i).padStart(3, "0")}`,
    author: "A",
    rating,
    comparisons: 0,
    timesRead: 1,
    createdAt: i,
  }));
}

/**
 * @param {{ id: string }} a
 * @param {{ id: string }} b
 */
function preferLowerId(a, b) {
  return Number(a.id.slice(1)) < Number(b.id.slice(1)) ? a.id : b.id;
}

/**
 * @param {number} n
 * @param {(a: {id:string}, b: {id:string}) => string} [prefer]
 */
function sortLibrary(n, prefer = preferLowerId) {
  const books = makeBooks(n);
  let session = createFreshSortSession(books);
  const seed = books.find((b) => b.id === session.rankedIds[0]);
  if (seed) seed.rating = 500_000;

  let picks = 0;
  while (session.phase !== "done") {
    const pair = pickPairFromSession(session, books);
    assert.ok(pair, `stuck after ${picks} picks`);
    const winnerId = prefer(pair[0], pair[1]);
    const result = applyInsertionPick(session, winnerId, books);
    if (result.placed && result.placedId) {
      const rankedIds = [
        ...result.rankedIdsBefore.slice(0, result.placementIndex),
        result.placedId,
        ...result.rankedIdsBefore.slice(result.placementIndex),
      ];
      for (const u of ratingUpdatesForPlacement(
        rankedIds,
        books,
        result.placedId
      )) {
        const book = books.find((b) => b.id === u.bookId);
        if (book) book.rating = u.rating;
      }
    }
    session = result.session;
    picks += 1;
    assert.ok(picks <= n * 20, "too many picks");
  }
  return { session, picks, books };
}

describe("binary insertion sort", () => {
  for (const n of [2, 3, 5, 10, 20, 50]) {
    it(`sorts ${n} books correctly`, () => {
      const { session, picks } = sortLibrary(n);
      const expected = Array.from({ length: n }, (_, i) => `b${i}`);
      assert.deepEqual(session.rankedIds, expected);
      assert.ok(picks <= estimatedSortComparisons(n) + 2);
    });
  }

  it("matches an arbitrary total order", () => {
    const n = 40;
    const rank = Array.from({ length: n }, (_, i) => `b${i}`).sort(
      () => Math.random() - 0.5
    );
    const prefer = (a, b) =>
      rank.indexOf(a.id) < rank.indexOf(b.id) ? a.id : b.id;
    const { session } = sortLibrary(n, prefer);
    assert.deepEqual(session.rankedIds, rank);
  });

  it("completes a 200-book library under budget", () => {
    const { session, picks } = sortLibrary(200);
    assert.equal(session.rankedIds.length, 200);
    assert.ok(picks < estimatedSortComparisons(200) + 50);
  });

  it("skips to another candidate", () => {
    const books = makeBooks(5);
    let session = createFreshSortSession(books);
    const first = session.candidateId;
    session = skipCandidate(session, books);
    assert.notEqual(session.candidateId, first);
  });

  it("resumes from non-default ratings", () => {
    const books = makeBooks(5);
    books[0].rating = 900_000;
    books[1].rating = 700_000;
    books[2].rating = 500_000;
    const session = createSortSession(books);
    assert.deepEqual(session.rankedIds, ["b0", "b1", "b2"]);
    assert.ok(session.candidateId === "b3" || session.candidateId === "b4");
  });

  it("assigns midpoint ratings when there is room", () => {
    const ranked = ["a", "b", "c"];
    const books = [
      {
        id: "a",
        rating: 1000,
        title: "",
        author: "",
        comparisons: 0,
        timesRead: 1,
        createdAt: 0,
      },
      {
        id: "b",
        rating: INITIAL_RATING,
        title: "",
        author: "",
        comparisons: 0,
        timesRead: 1,
        createdAt: 0,
      },
      {
        id: "c",
        rating: 0,
        title: "",
        author: "",
        comparisons: 0,
        timesRead: 1,
        createdAt: 0,
      },
    ];
    const updates = ratingUpdatesForPlacement(ranked, books, "b");
    assert.deepEqual(updates, [{ bookId: "b", rating: 500 }]);
  });

  it("rebalances when rating gaps are too small", () => {
    const ranked = ["a", "b", "c"];
    const books = [
      {
        id: "a",
        rating: 5,
        title: "",
        author: "",
        comparisons: 0,
        timesRead: 1,
        createdAt: 0,
      },
      {
        id: "b",
        rating: INITIAL_RATING,
        title: "",
        author: "",
        comparisons: 0,
        timesRead: 1,
        createdAt: 0,
      },
      {
        id: "c",
        rating: 4,
        title: "",
        author: "",
        comparisons: 0,
        timesRead: 1,
        createdAt: 0,
      },
    ];
    const updates = ratingUpdatesForPlacement(ranked, books, "b");
    assert.equal(updates.length, 3);
  });

  it("undoes a placement step", () => {
    const session = {
      rankedIds: ["b0", "b1"],
      candidateId: "b2",
      low: 0,
      high: 2,
      boundStack: [],
      lastPlacement: {
        bookId: "b1",
        rankedIdsBefore: ["b0"],
        low: 0,
        high: 1,
        priorRatings: [],
      },
      phase: /** @type {"inserting"} */ ("inserting"),
    };
    const undone = undoInsertionStep(session);
    assert.ok(undone);
    assert.equal(undone.kind, "placement");
    assert.equal(undone.session.candidateId, "b1");
    assert.deepEqual(undone.session.rankedIds, ["b0"]);
  });

  it("sync drops removed books and stays usable", () => {
    const books = makeBooks(5);
    books[0].rating = 800_000;
    books[1].rating = 600_000;
    let session = createSortSession(books);
    while (session.rankedIds.length < 3 && session.phase !== "done") {
      const pair = pickPairFromSession(session, books);
      if (!pair) break;
      const result = applyInsertionPick(session, pair[0].id, books);
      if (result.placed && result.placedId) {
        const rankedIds = [
          ...result.rankedIdsBefore.slice(0, result.placementIndex),
          result.placedId,
          ...result.rankedIdsBefore.slice(result.placementIndex),
        ];
        for (const u of ratingUpdatesForPlacement(
          rankedIds,
          books,
          result.placedId
        )) {
          const book = books.find((b) => b.id === u.bookId);
          if (book) book.rating = u.rating;
        }
      }
      session = result.session;
    }
    const removed = session.rankedIds[0];
    const remaining = books.filter((b) => b.id !== removed);
    session = syncSessionWithBooks(session, remaining);
    assert.ok(!session.rankedIds.includes(removed));
    assert.ok(
      pickPairFromSession(session, remaining) ||
        session.phase === "done" ||
        session.candidateId
    );
  });
});
