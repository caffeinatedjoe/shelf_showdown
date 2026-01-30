import { getAllBooks, getBookById as fetchBookById, SCHEMA_METADATA } from "./storage.js";

const DEFAULT_SORT_KEY = "score";
const DEFAULT_SORT_DIRECTION = "desc";

const SORT_VALUE_MAPPING = {
  score: (record) => record.rankingMetadata?.score ?? 0,
  lastRead: (record) => {
    const timestamp = record.rankingMetadata?.sortKeys?.lastRead;
    const numeric = timestamp ? Date.parse(timestamp) : NaN;
    return Number.isNaN(numeric) ? 0 : numeric;
  },
  rereadCount: (record) => record.rankingMetadata?.sortKeys?.rereadCount ?? (record.reads?.length ?? 0),
  lengthMinutes: (record) => record.lengthMinutes ?? 0,
  title: (record) => (record.title ?? "").toLowerCase(),
  author: (record) => (record.author ?? "").toLowerCase()
};

function resolveSortValue(record, key) {
  const resolver = SORT_VALUE_MAPPING[key] || SORT_VALUE_MAPPING.score;
  return resolver(record);
}

function compareValues(aValue, bValue) {
  if (aValue === bValue) {
    return 0;
  }
  if (typeof aValue === "string" || typeof bValue === "string") {
    return String(aValue ?? "").localeCompare(String(bValue ?? ""), undefined, { sensitivity: "base" });
  }
  const safeA =
    Number.isFinite(aValue) && typeof aValue === "number" ? aValue : Number(aValue ?? 0);
  const safeB =
    Number.isFinite(bValue) && typeof bValue === "number" ? bValue : Number(bValue ?? 0);
  const normalizedA = Number.isNaN(safeA) ? 0 : safeA;
  const normalizedB = Number.isNaN(safeB) ? 0 : safeB;
  return normalizedA - normalizedB;
}

export function sortRecords(records, options = {}) {
  const { sortedBy = DEFAULT_SORT_KEY, direction = DEFAULT_SORT_DIRECTION } = options;
  const directionFactor = direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    const aValue = resolveSortValue(a, sortedBy);
    const bValue = resolveSortValue(b, sortedBy);
    const comparison = compareValues(aValue, bValue);
    return directionFactor * comparison;
  });
}

function matchesFilter(record, filter = {}) {
  if (!filter || !Object.keys(filter).length) {
    return true;
  }

  if (filter.genre) {
    const genre = record.genre ?? "";
    if (genre.toLowerCase() !== filter.genre.toLowerCase()) {
      return false;
    }
  }

  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = `${record.title ?? ""} ${record.author ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  if (filter.hasReads === true && !(record.reads?.length)) {
    return false;
  }
  if (filter.hasReads === false && record.reads?.length) {
    return false;
  }

  if (typeof filter.minLength === "number") {
    if ((record.lengthMinutes ?? 0) < filter.minLength) {
      return false;
    }
  }

  if (typeof filter.maxLength === "number") {
    if ((record.lengthMinutes ?? 0) > filter.maxLength) {
      return false;
    }
  }

  return true;
}

export function filterRecords(records, filter = {}) {
  if (!filter || !Object.keys(filter).length) {
    return [...records];
  }
  return records.filter((record) => matchesFilter(record, filter));
}

export function deriveAnalyticsRecord(record) {
  const reads = record.reads ?? [];
  const lastRead = record.rankingMetadata?.sortKeys?.lastRead ?? null;
  const firstRead = reads.length ? reads[reads.length - 1]?.date ?? null : null;
  const pace = record.derivedPace ?? null;
  return {
    id: record.id,
    title: record.title,
    author: record.author,
    genre: record.genre,
    source: record.ingestionMetadata?.source ?? "unknown",
    readsCount: reads.length,
    hasReads: reads.length > 0,
    lastRead,
    firstRead,
    derivedPace: pace,
    score: record.rankingMetadata?.score ?? 0,
    rereadCount: record.rankingMetadata?.sortKeys?.rereadCount ?? reads.length,
    lengthMinutes: record.lengthMinutes ?? null,
    schemaVersion: record.ingestionMetadata?.schemaVersion ?? SCHEMA_METADATA.version
  };
}

export function deriveAnalyticsRecords(records) {
  return records.map((record) => deriveAnalyticsRecord(record));
}

export async function getBooks(options = {}) {
  const { sortedBy, direction, filter } = options;
  const records = await getAllBooks();
  const filtered = filterRecords(records, filter);
  return sortRecords(filtered, { sortedBy, direction });
}

export async function getAnalyticsRecords(options = {}) {
  const { filter } = options;
  const records = await getAllBooks();
  const filtered = filterRecords(records, filter);
  return deriveAnalyticsRecords(filtered);
}

export const getBookById = fetchBookById;
