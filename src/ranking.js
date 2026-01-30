import { getAllBooks, replaceBooks } from "./storage.js";
import { emitIngestionEvent } from "./events.js";

export const DEFAULT_BASE_SCORE = 1500;
export const DEFAULT_K_FACTOR = 32;
export const DEFAULT_FEATURE_WEIGHTS = Object.freeze({
  rereads: 1
});
export const DEFAULT_REREAD_WEIGHT = 25;

function getLatestReadDate(reads) {
  if (!Array.isArray(reads) || !reads.length) {
    return null;
  }
  return reads
    .map((entry) => entry?.date)
    .filter(Boolean)
    .reduce((latest, candidate) => (candidate && (!latest || candidate > latest) ? candidate : latest), null);
}

function mergeFeatureWeights(customWeights) {
  return {
    rereads: customWeights?.rereads ?? DEFAULT_FEATURE_WEIGHTS.rereads
  };
}

function ensureRankingMetadata(record, baseScore) {
  if (!record.rankingMetadata) {
    record.rankingMetadata = {
      score: baseScore,
      lastUpdated: new Date().toISOString(),
      sortKeys: {
        score: baseScore,
        lastRead: getLatestReadDate(record.reads) ?? null,
        rereadCount: record.reads?.length ?? 0
      }
    };
    return;
  }

  if (typeof record.rankingMetadata.score !== "number") {
    record.rankingMetadata.score = baseScore;
  }

  if (!record.rankingMetadata.sortKeys) {
    record.rankingMetadata.sortKeys = {};
  }

  if (typeof record.rankingMetadata.sortKeys.score !== "number") {
    record.rankingMetadata.sortKeys.score = record.rankingMetadata.score;
  }

  record.rankingMetadata.sortKeys.lastRead =
    getLatestReadDate(record.reads) ?? record.rankingMetadata.sortKeys.lastRead ?? null;
  record.rankingMetadata.sortKeys.rereadCount =
    typeof record.reads?.length === "number"
      ? record.reads.length
      : record.rankingMetadata.sortKeys.rereadCount ?? 0;

  if (!record.rankingMetadata.lastUpdated) {
    record.rankingMetadata.lastUpdated = new Date().toISOString();
  }
}

export function defaultCompare(recordA, recordB, options = {}) {
  const weights = mergeFeatureWeights(options.featureWeights);
  const rereadsA = recordA.reads?.length ?? 0;
  const rereadsB = recordB.reads?.length ?? 0;
  const delta = (rereadsA - rereadsB) * weights.rereads;
  if (delta === 0) {
    return 0;
  }
  return delta > 0 ? 1 : -1;
}

function applyElo(recordA, recordB, outcome, kFactor, precision) {
  const scoreA = recordA.rankingMetadata.score;
  const scoreB = recordB.rankingMetadata.score;
  const expectedA = 1 / (1 + Math.pow(10, (scoreB - scoreA) / 400));
  const expectedB = 1 - expectedA;
  const actualA = outcome === 1 ? 1 : outcome === -1 ? 0 : 0.5;
  const actualB = 1 - actualA;
  const updateA = scoreA + kFactor * (actualA - expectedA);
  const updateB = scoreB + kFactor * (actualB - expectedB);
  recordA.rankingMetadata.score = Math.max(0, Number(updateA.toFixed(precision)));
  recordB.rankingMetadata.score = Math.max(0, Number(updateB.toFixed(precision)));
}

export function rerankRecords(records, options = {}) {
  if (!Array.isArray(records)) {
    return [];
  }

  const now = options.now ?? Date.now();
  const baseScore = typeof options.baseScore === "number" ? options.baseScore : DEFAULT_BASE_SCORE;
  const weights = mergeFeatureWeights(options.featureWeights);

  records.forEach((record) => ensureRankingMetadata(record, baseScore));

  records.forEach((record) => {
    const rereads = record.reads?.length ?? 0;
    const bonus = Math.max(0, rereads - 1) * DEFAULT_REREAD_WEIGHT * weights.rereads;
    record.rankingMetadata.score = Math.max(0, baseScore + bonus);
    const lastUpdated = new Date(now).toISOString();
    stampMetadata(record, lastUpdated);
  });

  return records;
}

function stampMetadata(record, lastUpdatedTimestamp) {
  if (!record.rankingMetadata) {
    return;
  }
  record.rankingMetadata.lastUpdated = lastUpdatedTimestamp;
  record.rankingMetadata.sortKeys.score = record.rankingMetadata.score;
  record.rankingMetadata.sortKeys.rereadCount =
    record.reads?.length ?? record.rankingMetadata.sortKeys.rereadCount ?? 0;
  record.rankingMetadata.sortKeys.lastRead =
    getLatestReadDate(record.reads) ?? record.rankingMetadata.sortKeys.lastRead ?? null;
}

export function pairwiseMatchRecords(records, winnerId, loserId, options = {}) {
  const now = options.now ?? Date.now();
  const baseScore = typeof options.baseScore === "number" ? options.baseScore : DEFAULT_BASE_SCORE;
  const kFactor = typeof options.kFactor === "number" ? options.kFactor : DEFAULT_K_FACTOR;
  const precision =
    typeof options.scorePrecision === "number" ? options.scorePrecision : 2;

  const winner = records.find((record) => record.id === winnerId) ?? null;
  const loser = records.find((record) => record.id === loserId) ?? null;
  if (!winner || !loser) {
    throw new Error("Winner or loser record not found for pairwise match.");
  }

  ensureRankingMetadata(winner, baseScore);
  ensureRankingMetadata(loser, baseScore);
  applyElo(winner, loser, 1, kFactor, precision);

  const lastUpdated = new Date(now).toISOString();
  stampMetadata(winner, lastUpdated);
  stampMetadata(loser, lastUpdated);

  return { winner, loser };
}

class RankingService {
  constructor(config = {}) {
    this.config = {
      baseScore: config.baseScore ?? DEFAULT_BASE_SCORE,
      kFactor: config.kFactor ?? DEFAULT_K_FACTOR,
      scorePrecision: typeof config.scorePrecision === "number" ? config.scorePrecision : 2,
      featureWeights: mergeFeatureWeights(config.featureWeights),
      comparePair: config.comparePair ?? defaultCompare,
      onError: config.onError ?? ((error) => console.error("Ranking refresh failed", error))
    };
  }

  initialize(records = [], options = {}) {
    if (!Array.isArray(records)) {
      return [];
    }
    return rerankRecords(records, {
      baseScore: this.config.baseScore,
      comparePair: this.config.comparePair,
      featureWeights: options.featureWeights ?? this.config.featureWeights,
      kFactor: this.config.kFactor,
      scorePrecision: this.config.scorePrecision,
      now: options.now
    });
  }

  score(record) {
    return record?.rankingMetadata?.score ?? this.config.baseScore;
  }

  compare(recordA, recordB, options = {}) {
    return (options.comparePair ?? this.config.comparePair)(recordA, recordB, {
      now: options.now,
      featureWeights: options.featureWeights ?? this.config.featureWeights
    });
  }

  async refresh(bookId = null, options = {}) {
    const now = options.now ?? Date.now();
    try {
      const books = await getAllBooks();
      if (!books.length) {
        return bookId ? null : [];
      }
      rerankRecords(books, {
        baseScore: this.config.baseScore,
        comparePair: this.config.comparePair,
        featureWeights: options.featureWeights ?? this.config.featureWeights,
        kFactor: this.config.kFactor,
        scorePrecision: this.config.scorePrecision,
        now
      });
      await replaceBooks(books);
      return bookId ? books.find((record) => record.id === bookId) ?? null : books;
    } catch (error) {
      this.config.onError(error);
      return bookId ? null : [];
    }
  }

  async recordMatch(winnerId, loserId, options = {}) {
    const now = options.now ?? Date.now();
    const books = await getAllBooks();

    const pairwise = pairwiseMatchRecords(books, winnerId, loserId, {
      baseScore: this.config.baseScore,
      kFactor: this.config.kFactor,
      scorePrecision: this.config.scorePrecision,
      now
    });

    await replaceBooks(books);
    emitIngestionEvent("records:updated", {
      source: "pairwise",
      skipRankingRefresh: true,
      count: books.length,
      duration: Math.max(0, Date.now() - now)
    });

    return pairwise;
  }
}

const rankingService = new RankingService();

export const initializeRanking = rankingService.initialize.bind(rankingService);
export const compareRanking = rankingService.compare.bind(rankingService);
export const scoreRanking = rankingService.score.bind(rankingService);
export const refreshRanking = rankingService.refresh.bind(rankingService);
export const recordPairPreference = rankingService.recordMatch.bind(rankingService);
export { RankingService };
