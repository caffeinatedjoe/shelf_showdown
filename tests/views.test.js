import assert from "node:assert";
import { collectGenreChoices, summarizeAnalytics, choosePair } from "../src/views.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exit(1);
  }
}

run("collectGenreChoices returns alphabetized genres", () => {
  const records = [
    { genre: "Fantasy" },
    { genre: "Sci-Fi" },
    { genre: "Fantasy" },
    { genre: null }
  ];
  const options = collectGenreChoices(records);
  assert.deepStrictEqual(options, ["Fantasy", "Sci-Fi", "Uncategorized"]);
});

run("summarizeAnalytics identifies top and recent records", () => {
  const records = [
    {
      title: "Alpha",
      score: 1700,
      lastRead: "2025-01-10T00:00:00.000Z",
      readsCount: 2,
      rereadCount: 2,
      genre: "Fantasy",
      lengthMinutes: 180
    },
    {
      title: "Beta",
      score: 1500,
      lastRead: "2024-12-20T00:00:00.000Z",
      readsCount: 1,
      rereadCount: 1,
      genre: "Memoir",
      lengthMinutes: 120
    }
  ];
  const summary = summarizeAnalytics(records);
  assert.strictEqual(summary.topRecord.title, "Alpha");
  assert.strictEqual(summary.mostRecentRecord.title, "Alpha");
  assert.strictEqual(summary.totalRecords, 2);
  assert.strictEqual(summary.totalReads, 3);
  assert.strictEqual(summary.genreCount, 2);
  assert.strictEqual(summary.rereads, 1);
});

run("choosePair prefers a fresh pair before repeating", () => {
  const records = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" }
  ];
  const first = choosePair(records);
  const second = choosePair(records, first);
  assert.strictEqual(second.length, 2);
  assert.notDeepStrictEqual(second, first);
});
