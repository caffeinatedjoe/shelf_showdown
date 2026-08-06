/**
 * Node test suite for random handful + Bradley-Terry ranking.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_RATING } from "./storage.js";
import {
  createFreshHandfulSession,
  createHandfulSession,
  estimatedHandfulScreens,
  handfulProgress,
  pickRandomHandfulIds,
  submitHandful,
  undoHandful,
} from "./handful.js";
import {
  expectedScore,
  ratingUpdatesFromRanking,
} from "./ranking.js";

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

describe("Bradley-Terry ratingUpdatesFromRanking", () => {
  it("raises the top book and lowers the bottom", () => {
    const ids = ["a", "b", "c"];
    const ratings = new Map([
      ["a", 1500],
      ["b", 1500],
      ["c", 1500],
    ]);
    const updates = ratingUpdatesFromRanking(ids, ratings);
    const byId = Object.fromEntries(updates.map((u) => [u.bookId, u.rating]));
    assert.ok(byId.a > 1500);
    assert.ok(byId.c < 1500);
    assert.ok(byId.a > byId.b);
    assert.ok(byId.b > byId.c);
  });

  it("moves less when the favorite already looks stronger", () => {
    const ids = ["strong", "weak"];
    const even = ratingUpdatesFromRanking(
      ids,
      new Map([
        ["strong", 1500],
        ["weak", 1500],
      ])
    );
    const skewed = ratingUpdatesFromRanking(
      ids,
      new Map([
        ["strong", 1800],
        ["weak", 1200],
      ])
    );
    const evenDelta = even[0].rating - 1500;
    const skewedDelta = skewed[0].rating - 1800;
    assert.ok(Math.abs(evenDelta) > Math.abs(skewedDelta));
  });

  it("expectedScore is 0.5 for equal ratings", () => {
    assert.equal(expectedScore(1500, 1500), 0.5);
  });
});

describe("handful sorting (BT)", () => {
  it("deals a random-ish handful of up to five", () => {
    const books = makeBooks(12);
    const session = createFreshHandfulSession(books);
    assert.equal(session.phase, "ranking");
    assert.equal(session.handful.length, 5);
    // Not the first five titles in order (legacy alphabetical deal).
    assert.notDeepEqual(session.handful, ["b0", "b1", "b2", "b3", "b4"]);
  });

  it("pickRandomHandfulIds returns unique ids", () => {
    const books = makeBooks(20);
    const ids = pickRandomHandfulIds(books, [], 5);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
  });

  it("submit applies BT updates and deals again", () => {
    const books = makeBooks(10);
    let session = createHandfulSession(books);
    const ordered = [...session.handful];
    const result = submitHandful(session, ordered, books);
    assert.equal(result.ratingUpdates.length, ordered.length);
    assert.ok(result.session.handfulsCompleted >= 1);
    assert.ok(result.session.handful.length >= 2);
    assert.ok(result.pairs.length >= 1);

    const top = result.ratingUpdates.find((u) => u.bookId === ordered[0]);
    const bottom = result.ratingUpdates.find(
      (u) => u.bookId === ordered[ordered.length - 1]
    );
    assert.ok(top && bottom);
    assert.ok(top.rating > bottom.rating);
  });

  it("undo restores prior session", () => {
    const books = makeBooks(8);
    let session = createHandfulSession(books);
    const result = submitHandful(session, [...session.handful], books);
    const undone = undoHandful(result.session);
    assert.ok(undone);
    assert.equal(undone.session.handfulsCompleted, 0);
    assert.equal(undone.priorRatings.length, result.priorRatings.length);
  });

  it("progress tracks comparison warmth", () => {
    const books = makeBooks(6);
    const session = createHandfulSession(books);
    const progress = handfulProgress(session, books);
    assert.equal(progress.done, false);
    assert.equal(progress.placed, 0);
    assert.ok(progress.targetComparisons >= 6);
  });

  it("estimatedHandfulScreens grows with library size", () => {
    assert.ok(estimatedHandfulScreens(400) > estimatedHandfulScreens(50));
    assert.ok(estimatedHandfulScreens(1) === 0);
  });
});
