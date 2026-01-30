import assert from "node:assert";
import { readFileSync } from "node:fs";
import { normalizeRows, parseCsv } from "../src/ingestion.js";
import {
  DEFAULT_BASE_SCORE,
  DEFAULT_REREAD_WEIGHT,
  defaultCompare,
  pairwiseMatchRecords,
  rerankRecords,
  RankingService
} from "../src/ranking.js";

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

run("defaultCompare favors the record with more rereads", () => {
  const candidate = {
    reads: [{ date: "2024-01-01T00:00:00.000Z" }, { date: "2023-06-01T00:00:00.000Z" }],
    rankingMetadata: {
      score: DEFAULT_BASE_SCORE,
      sortKeys: { lastRead: "2024-01-01T00:00:00.000Z", rereadCount: 2 }
    }
  };
  const singleRead = {
    reads: [{ date: "2025-01-01T00:00:00.000Z" }],
    rankingMetadata: { score: DEFAULT_BASE_SCORE, sortKeys: { lastRead: "2025-01-01T00:00:00.000Z", rereadCount: 1 } }
  };
  assert.strictEqual(
    defaultCompare(candidate, singleRead, {
      featureWeights: { rereads: 1 }
    }),
    1
  );
});

run("rerankRecords seeds metadata and favors rereads", () => {
  const records = [
    {
      id: "multi",
      reads: [
        { date: "2024-01-01T00:00:00.000Z" },
        { date: "2023-06-01T00:00:00.000Z" }
      ]
    },
    { id: "single", reads: [{ date: "2025-01-01T00:00:00.000Z" }] }
  ];
  rerankRecords(records, {
    scorePrecision: 0,
    featureWeights: { rereads: 1 }
  });
  const multi = records.find((record) => record.id === "multi");
  const single = records.find((record) => record.id === "single");
  assert(multi?.rankingMetadata);
  assert(single?.rankingMetadata);
  assert.strictEqual(multi.rankingMetadata.sortKeys.rereadCount, 2);
  assert.strictEqual(single.rankingMetadata.sortKeys.rereadCount, 1);
  assert.strictEqual(
    multi.rankingMetadata.score,
    DEFAULT_BASE_SCORE + DEFAULT_REREAD_WEIGHT
  );
  assert.strictEqual(single.rankingMetadata.score, DEFAULT_BASE_SCORE);
});

run("RankingService honors overrides and exposes score fallback", () => {
  const service = new RankingService({
    baseScore: 1620,
    comparePair: () => -1
  });
  assert.strictEqual(service.score({}), 1620);
  const result = service.compare(
    { id: "a", rankingMetadata: { score: 1500, sortKeys: { lastRead: null } } },
    { id: "b", rankingMetadata: { score: 1600, sortKeys: { lastRead: null } } }
  );
  assert.strictEqual(result, -1);
});

run("pairwise match updates only the matched records", () => {
  const csv = readFileSync(new URL("../tests/sample-import.csv", import.meta.url), "utf-8");
  const normalized = normalizeRows(parseCsv(csv));
  const records = normalized.records.slice(0, 5);
  assert(records.length >= 5, "sample import should include at least five records");
  const baselineScore = DEFAULT_BASE_SCORE;
  const now = Date.parse("2025-01-01T00:00:00.000Z");

  records.forEach((record) => {
    assert.strictEqual(record.rankingMetadata.score, baselineScore);
  });

  const firstWinner = records[0];
  const firstLoser = records[1];
  const firstPair = pairwiseMatchRecords(records, firstWinner.id, firstLoser.id, {
    baseScore: baselineScore,
    now
  });

  assert(firstPair.winner.rankingMetadata.score > baselineScore);
  assert(firstPair.loser.rankingMetadata.score < baselineScore);
  records.slice(2).forEach((record) => {
    assert.strictEqual(record.rankingMetadata.score, baselineScore);
  });

  const secondWinner = records[2];
  const secondLoser = records[3];
  pairwiseMatchRecords(records, secondWinner.id, secondLoser.id, {
    baseScore: baselineScore,
    now
  });

  assert(secondWinner.rankingMetadata.score > baselineScore);
  assert(secondLoser.rankingMetadata.score < baselineScore);
  const untouched = records[4];
  assert.strictEqual(untouched.rankingMetadata.score, baselineScore);
});
