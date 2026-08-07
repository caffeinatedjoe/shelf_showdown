import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractBooksFromMatrix,
  parseCsv,
  parseFinishedAt,
} from "./tabular.js";

describe("parseFinishedAt", () => {
  it("parses ISO dates", () => {
    const ts = parseFinishedAt("2024-01-15");
    assert.ok(ts != null);
    const d = new Date(ts);
    assert.equal(d.getFullYear(), 2024);
    assert.equal(d.getMonth(), 0);
    assert.equal(d.getDate(), 15);
  });

  it("parses Google Sheets Date(y,m,d)", () => {
    const ts = parseFinishedAt("Date(2024,2,5)");
    assert.ok(ts != null);
    const d = new Date(ts);
    assert.equal(d.getFullYear(), 2024);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 5);
  });

  it("parses US slash dates", () => {
    const ts = parseFinishedAt("3/2/2024");
    assert.ok(ts != null);
    const d = new Date(ts);
    assert.equal(d.getFullYear(), 2024);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 2);
  });

  it("rejects bare numbers", () => {
    assert.equal(parseFinishedAt("3"), null);
    assert.equal(parseFinishedAt("2024"), null);
  });
});

describe("extractBooksFromMatrix dates", () => {
  it("keeps finish dates from a Date Read column", () => {
    const books = extractBooksFromMatrix(
      [
        ["Title", "Author", "Date Read"],
        ["Neuromancer", "William Gibson", "2024-01-15"],
        ["Dune", "Frank Herbert", "2024-03-02"],
      ],
      { headers: ["Title", "Author", "Date Read"] }
    );
    assert.equal(books.length, 2);
    const neuro = books.find((b) => b.title === "Neuromancer");
    assert.ok(neuro);
    assert.equal(neuro.finishedAts.length, 1);
    assert.equal(new Date(neuro.finishedAts[0]).getMonth(), 0);
  });

  it("counts re-reads across months from duplicate rows", () => {
    const books = parseCsv(`Title,Author,Date Finished
Left Hand,Ursula K. Le Guin,2024-01-15
Neuromancer,William Gibson,2024-02-01
Left Hand,Ursula K. Le Guin,2024-06-10`);
    assert.equal(books.length, 2);
    const left = books.find((b) => b.title === "Left Hand");
    assert.ok(left);
    assert.equal(left.timesRead, 2);
    assert.equal(left.finishedAts.length, 2);
    assert.equal(new Date(left.finishedAts[0]).getMonth(), 0);
    assert.equal(new Date(left.finishedAts[1]).getMonth(), 5);
  });

  it("still works without a date column", () => {
    const books = parseCsv(`Title,Author
Dune,Frank Herbert`);
    assert.equal(books.length, 1);
    assert.deepEqual(books[0].finishedAts, []);
    assert.equal(books[0].timesRead, 1);
  });
});
