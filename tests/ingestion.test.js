import assert from "node:assert";
import { readFileSync } from "node:fs";
import { parseCsv, normalizeRows } from "../src/ingestion.js";

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

run("csv parser handles quotes and blank rows", () => {
  const csv = `Title,Author,Date read,Length\n"Great, Novel","Doe, Jane","2025-01-01;2025-02-01",8\n`;
  const rows = parseCsv(csv);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].Title, "Great, Novel");
  assert.strictEqual(rows[0]["Date read"], "2025-01-01;2025-02-01");
});

run("normalization dedup merges rows", () => {
  const csv = `Title,Author,Date read,Length\nBook A,Alex,2025-01-01,10\nBook A,Alex,2025-01-01,10`;
  const rows = parseCsv(csv);
  const normalized = normalizeRows(rows, { source: "test" });
  assert.strictEqual(normalized.records.length, 1);
  assert(normalized.log.some((entry) => entry.includes("Merged")));
  assert.strictEqual(normalized.records[0].reads.length, 2);
  assert(normalized.records[0].derivedPace?.booksPerWeek >= 2);
});

run("normalization handles missing dates", () => {
  const csv = `Title,Author,Date read,Length\nBook B,Alex,,9`;
  const rows = parseCsv(csv);
  const normalized = normalizeRows(rows);
  assert.strictEqual(normalized.records.length, 1);
  assert(Array.isArray(normalized.records[0].reads));
  assert.strictEqual(normalized.records[0].derivedPace, null);
});

run("supports month/year read dates", () => {
  const csv = `Title,Author,Date read,Length\nBook C,Alex,Jan 2025,11`;
  const rows = parseCsv(csv);
  const normalized = normalizeRows(rows);
  const record = normalized.records[0];
  assert(record.reads[0].date?.startsWith("2025-01"));
  assert.strictEqual(record.reads[0].inferred, true);
  assert(record.derivedPace);
});

run("records fallback entry when date missing", () => {
  const csv = `Title,Author,Date read,Length\nBook D,Alex,,12`;
  const rows = parseCsv(csv);
  const normalized = normalizeRows(rows);
  const firstRead = normalized.records[0].reads[0];
  assert.strictEqual(firstRead.missingDate, true);
  assert.strictEqual(firstRead.date, null);
  assert.strictEqual(normalized.records[0].derivedPace, null);
});

run("parses HH:MM:SS length", () => {
  const csv = `Title,Author,Date read,Length\nBook E,Alex,2025-01-01,01:30:00`;
  const rows = parseCsv(csv);
  const normalized = normalizeRows(rows);
  assert.strictEqual(normalized.records[0].lengthMinutes, 90);
});

run("parses HH:MM length", () => {
  const csv = `Title,Author,Date read,Length\nBook F,Alex,2025-01-01,12:24`;
  const rows = parseCsv(csv);
  const normalized = normalizeRows(rows);
  assert.strictEqual(normalized.records[0].lengthMinutes, 744);
});

run("sample import CSV loads full sheet", () => {
  const csv = readFileSync(new URL("../tests/sample-import.csv", import.meta.url), "utf-8");
  const rows = parseCsv(csv);
  assert(rows.length > 100, "expected sample sheet to include many books");
  const normalized = normalizeRows(rows);
  assert(
    normalized.records.length <= rows.length,
    "records should not exceed parsed rows after dedup"
  );
  assert(
    normalized.records.some((record) => record.reads.some((read) => read.date)),
    "expected at least one parsed read date"
  );
});
