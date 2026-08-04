/**
 * Node test suite for handful (group-of-5) ranking.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_RATING } from "./storage.js";
import {
  createFreshHandfulSession,
  createHandfulSession,
  dealHandful,
  estimatedHandfulScreens,
  handfulProgress,
  rebalanceRatings,
  setHandfulOrder,
  submitHandful,
  undoHandful,
} from "./handful.js";

/**
 * @param {number} n
 */
function makeBooks(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    title: `Book ${String(i).padStart(2, "0")}`,
    author: "Author",
    rating: INITIAL_RATING,
    comparisons: 0,
    timesRead: 1,
    createdAt: 1_000 + i,
  }));
}

/**
 * Prefer lower id index as better (b0 best).
 * @param {string[]} ids
 */
function orderByIndex(ids) {
  return [...ids].sort((a, b) => {
    const na = Number(a.slice(1));
    const nb = Number(b.slice(1));
    return na - nb;
  });
}

/**
 * Drive a session to completion with a known total order.
 * @param {ReturnType<typeof makeBooks>} books
 */
function sortAll(books) {
  let session = createFreshHandfulSession(books);
  let guard = 0;
  while (session.phase !== "done" && guard < 5000) {
    guard += 1;
    if (session.handful.length === 0) {
      session = dealHandful(session);
      if (session.handful.length === 0) break;
    }
    const ordered = orderByIndex(session.handful);
    const result = submitHandful(session, ordered, books);
    session = result.session;
    for (const u of result.ratingUpdates) {
      const book = books.find((b) => b.id === u.bookId);
      if (book) book.rating = u.rating;
    }
  }
  return session;
}

describe("handful sorting", () => {
  it("deals up to five books in group phase", () => {
    const books = makeBooks(12);
    const session = createFreshHandfulSession(books);
    assert.equal(session.phase, "group");
    assert.equal(session.handful.length, 5);
    assert.equal(session.pool.length, 7);
  });

  it("produces a full total order for 12 books", () => {
    const books = makeBooks(12);
    const session = sortAll(books);
    assert.equal(session.phase, "done");
    assert.deepEqual(
      session.rankedIds,
      Array.from({ length: 12 }, (_, i) => `b${i}`)
    );
  });

  it("produces a full total order for 20 books", () => {
    const books = makeBooks(20);
    const session = sortAll(books);
    assert.equal(session.phase, "done");
    assert.deepEqual(
      session.rankedIds,
      Array.from({ length: 20 }, (_, i) => `b${i}`)
    );
  });

  it("handles libraries smaller than five", () => {
    const books = makeBooks(3);
    const session = sortAll(books);
    assert.equal(session.phase, "done");
    assert.deepEqual(session.rankedIds, ["b0", "b1", "b2"]);
  });

  it("setHandfulOrder rejects mismatched ids", () => {
    const books = makeBooks(5);
    const session = createFreshHandfulSession(books);
    const bad = setHandfulOrder(session, ["nope"]);
    assert.equal(bad, session);
  });

  it("undo restores prior session", () => {
    const books = makeBooks(5);
    let session = createFreshHandfulSession(books);
    const ordered = orderByIndex(session.handful);
    const result = submitHandful(session, ordered, books);
    assert.ok(result.session.handfulsCompleted >= 1);
    const undone = undoHandful(result.session);
    assert.ok(undone);
    assert.equal(undone.session.handfulsCompleted, 0);
    assert.equal(undone.session.phase, "group");
    assert.equal(undone.session.handful.length, 5);
  });

  it("resumes with already-ranked books as a run", () => {
    const books = makeBooks(8);
    books[0].rating = 900_000;
    books[1].rating = 800_000;
    books[2].rating = 700_000;
    const session = createHandfulSession(books);
    assert.equal(session.phase, "group");
    assert.ok(session.runs.length >= 1);
    assert.deepEqual(session.runs[0], ["b0", "b1", "b2"]);
    assert.equal(session.handful.length, 5);
  });

  it("rebalanceRatings spaces best to worst", () => {
    const updates = rebalanceRatings(["a", "b", "c"]);
    assert.equal(updates[0].rating, 1_000_000);
    assert.equal(updates[2].rating, 0);
    assert.ok(updates[1].rating < updates[0].rating);
  });

  it("estimatedHandfulScreens is far below pairwise n log n for large n", () => {
    const n = 400;
    const handful = estimatedHandfulScreens(n);
    let binary = 0;
    for (let k = 1; k < n; k++) binary += Math.ceil(Math.log2(k + 1));
    assert.ok(handful < binary / 3);
  });

  it("progress reports done when finished", () => {
    const books = makeBooks(4);
    const session = sortAll(books);
    const progress = handfulProgress(session, books);
    assert.equal(progress.done, true);
    assert.equal(progress.placed, 4);
  });
});
