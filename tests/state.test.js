import assert from "node:assert";
import { deriveAnalyticsRecord, filterRecords, sortRecords } from "../src/state.js";

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

run("sortRecords orders by score descending by default", () => {
  const records = [
    { id: "a", rankingMetadata: { score: 1200 }, reads: [] },
    { id: "b", rankingMetadata: { score: 1500 }, reads: [] },
    { id: "c", rankingMetadata: { score: 900 }, reads: [] }
  ];
  const sorted = sortRecords(records);
  assert.strictEqual(sorted[0].id, "b");
  assert.strictEqual(sorted[2].id, "c");
});

run("sortRecords respects ascending direction and lastRead key", () => {
  const records = [
    {
      id: "recent",
      rankingMetadata: { sortKeys: { lastRead: "2025-05-01T00:00:00.000Z" } },
      reads: []
    },
    {
      id: "old",
      rankingMetadata: { sortKeys: { lastRead: "2024-01-01T00:00:00.000Z" } },
      reads: []
    }
  ];
  const sorted = sortRecords(records, { sortedBy: "lastRead", direction: "asc" });
  assert.strictEqual(sorted[0].id, "old");
});

run("filterRecords matches genre and search criteria", () => {
  const records = [
    { title: "Alpha", author: "One", genre: "Fantasy", lengthMinutes: 100, reads: [] },
    { title: "Beta", author: "Two", genre: "Sci-Fi", lengthMinutes: 50, reads: [] },
    { title: "Gamma", author: "Three", genre: "Fantasy", lengthMinutes: 70, reads: [] }
  ];
  const filtered = filterRecords(records, { genre: "fantasy", search: "gamma" });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].title, "Gamma");
});

run("deriveAnalyticsRecord extracts metadata without mutation", () => {
  const record = {
    id: "x",
    title: "Record",
    author: "Author",
    genre: "Memoir",
    lengthMinutes: 90,
    reads: [
      { date: "2023-01-01T00:00:00.000Z" },
      { date: "2022-06-01T00:00:00.000Z" }
    ],
    rankingMetadata: {
      score: 1600,
      sortKeys: { lastRead: "2023-01-01T00:00:00.000Z", rereadCount: 2 }
    },
    derivedPace: { booksPerWeek: 0.5, booksPerMonth: 2 },
    ingestionMetadata: { schemaVersion: "1.0", source: "csv" }
  };
  const analytics = deriveAnalyticsRecord(record);
  assert.strictEqual(analytics.readsCount, 2);
  assert.strictEqual(analytics.lastRead, "2023-01-01T00:00:00.000Z");
  assert.strictEqual(analytics.schemaVersion, "1.0");
  assert.strictEqual(analytics.derivedPace.booksPerMonth, 2);
});

run("sortRecords orders titles alphabetically when requested", () => {
  const records = [
    { title: "Zulu", rankingMetadata: { score: 0 }, reads: [] },
    { title: "Alpha", rankingMetadata: { score: 0 }, reads: [] },
    { title: "Moon", rankingMetadata: { score: 0 }, reads: [] }
  ];
  const sorted = sortRecords(records, { sortedBy: "title", direction: "asc" });
  assert.strictEqual(sorted[0].title, "Alpha");
  assert.strictEqual(sorted[2].title, "Zulu");
});
