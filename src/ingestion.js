const BASE_SCORE = 1500;
const SCHEMA_VERSION = "1.0";
const HEADER_ALIASES = {
  title: ["Title", "title", "Book Title"],
  author: ["Author", "author"],
  dateRead: ["Date read", "date read", "Date Read", "Date"],
  length: ["Length", "Length (mins)", "Audio Length"],
  genre: ["Genre", "genre"],
  context: ["Context", "context", "Notes"],
  sourceId: ["Source", "source"]
};

const MONTH_ALIAS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function getField(row, names) {
  const value = names.reduce((acc, key) => {
    if (acc) return acc;
    if (key in row && row[key]?.trim?.() !== "") {
      return row[key].trim();
    }
    return acc;
  }, "");
  return value;
}

function parseDuration(value) {
  const segments = value.split(":").map((segment) => segment.trim());
  const numbers = segments.map((segment) => Number(segment));
  if (numbers.some((segment) => Number.isNaN(segment))) {
    return null;
  }
  if (segments.length === 3) {
    const [hours, minutes, seconds] = numbers;
    return hours * 60 + minutes + seconds / 60;
  }
  if (segments.length === 2) {
    const [hours, minutes] = numbers;
    return hours * 60 + minutes;
  }
  return null;
}

function parseNumber(value) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.includes(":")) {
    return parseDuration(trimmed);
  }
  const cleaned = trimmed.replace(/[^\d.-]/g, "");
  if (!cleaned) {
    return null;
  }
  const numeric = Number(cleaned);
  return Number.isNaN(numeric) ? null : numeric;
}

function splitDateValues(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,;|]/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseMonthYear(value) {
  const normalized = value.trim().replace(/[.,]/g, "").toLowerCase();
  if (!normalized) {
    return null;
  }

  const dashMatch = normalized.match(/^(\d{4})[-/](\d{1,2})$/);
  if (dashMatch) {
    const year = dashMatch[1];
    const month = dashMatch[2].padStart(2, "0");
    return `${year}-${month}-01T00:00:00.000Z`;
  }

  const slashMatch = normalized.match(/^(\d{1,2})[-/](\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const year = slashMatch[2];
    return `${year}-${month}-01T00:00:00.000Z`;
  }

  const wordMatch = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (wordMatch) {
    const monthPart = MONTH_ALIAS[wordMatch[1]];
    if (!monthPart) {
      return null;
    }
    return `${wordMatch[2]}-${String(monthPart).padStart(2, "0")}-01T00:00:00.000Z`;
  }

  return null;
}

function expandTwoDigitYear(value) {
  const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/);
  if (!match) {
    return null;
  }
  const [, monthPart, dayPart, yearPart] = match;
  const yearNumber = Number(yearPart);
  const year = yearNumber > 68 ? 1900 + yearNumber : 2000 + yearNumber;
  const month = String(Number(monthPart)).padStart(2, "0");
  const day = String(Number(dayPart)).padStart(2, "0");
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function parseDateValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const partial = parseMonthYear(trimmed);
  if (partial) {
    return { date: partial, inferred: true };
  }
  const shortYear = expandTwoDigitYear(trimmed);
  if (shortYear) {
    return { date: shortYear, inferred: false };
  }
  const exact = toIsoDate(trimmed);
  if (exact) {
    return { date: exact, inferred: false };
  }
  return null;
}

function readSortKey(read) {
  if (!read?.date) {
    return 0;
  }
  return new Date(read.date).getTime();
}

function sortReadsByDateDesc(reads) {
  return reads.sort((a, b) => readSortKey(b) - readSortKey(a));
}

function createReadEntries(rawDates, context, source) {
  const dates = splitDateValues(rawDates);
  const entries = dates
    .map((value) => {
      const parsed = parseDateValue(value);
      if (!parsed) {
        return null;
      }
      return {
        date: parsed.date,
        context,
        source,
        inferred: parsed.inferred
      };
    })
    .filter(Boolean);

  if (!entries.length) {
    entries.push({
      date: null,
      context,
      source,
      inferred: true,
      missingDate: true
    });
  }

  return sortReadsByDateDesc(entries);
}

function mergeReads(target, incoming) {
  if (!incoming.length) {
    return 0;
  }
  target.push(...incoming);
  target.sort((a, b) => new Date(b.date) - new Date(a.date));
  return incoming.length;
}

function getLatestReadDate(reads) {
  const entry = reads.find((read) => read.date);
  return entry?.date ?? null;
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `book-${Math.random().toString(36).slice(2, 11)}`;
}

const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

function derivePaceFromReads(reads) {
  const datedReads = reads.filter((read) => read.date);
  if (!datedReads.length) {
    return null;
  }
  const latest = readSortKey(datedReads[0]);
  const earliest = readSortKey(datedReads[datedReads.length - 1]);
  const spanWeeks = Math.max(1, (latest - earliest) / MS_PER_WEEK || 1);
  const spanMonths = Math.max(1, (latest - earliest) / MS_PER_MONTH || 1);
  const pace = {
    booksPerWeek: Number((datedReads.length / spanWeeks).toFixed(2)),
    booksPerMonth: Number((datedReads.length / spanMonths).toFixed(2))
  };
  return pace;
}

function buildMetadata(reads) {
  const latestRead = getLatestReadDate(reads);
  return {
    score: BASE_SCORE,
    lastUpdated: new Date().toISOString(),
    sortKeys: {
      score: BASE_SCORE,
      lastRead: latestRead,
      rereadCount: reads.length
    }
  };
}

function buildRecord(row, options) {
  const title = getField(row, HEADER_ALIASES.title) || "Untitled";
  const author = getField(row, HEADER_ALIASES.author) || "Unknown";
  const lengthMinutes = parseNumber(getField(row, HEADER_ALIASES.length));
  const genre = getField(row, HEADER_ALIASES.genre) || null;
  const context = getField(row, HEADER_ALIASES.context) || "imported";
  const rawSource = getField(row, HEADER_ALIASES.sourceId) || options.source;

  const reads = createReadEntries(getField(row, HEADER_ALIASES.dateRead), context, rawSource);

  const derivedPace = derivePaceFromReads(reads);
  const record = {
    id: row.id || generateId(),
    title,
    author,
    lengthMinutes,
    genre,
    reads,
    derivedPace,
    rankingMetadata: buildMetadata(reads),
    ingestionMetadata: {
      schemaVersion: SCHEMA_VERSION,
      source: rawSource,
      importedAt: new Date().toISOString(),
      originalRow: row.__rowIndex ?? null
    }
  };

  return record;
}

export function normalizeRows(rows, options = {}) {
  const { source = "csv" } = options;
  const dedupLog = [];
  const keyed = new Map();
  const baseIndex = new Map();

  rows.forEach((row, index) => {
    const record = buildRecord(row, { source, index });
    const key = `${record.title.toLowerCase()}|${record.author.toLowerCase()}|${record.lengthMinutes ?? "nil"}`;

    const baseKey = `${record.title.toLowerCase()}|${record.author.toLowerCase()}`;
    const existingKey = keyed.has(key) ? key : baseIndex.get(baseKey);
    if (existingKey) {
      const existing = keyed.get(existingKey);
      const added = mergeReads(existing.reads, record.reads);
      if (added) {
        existing.rankingMetadata.sortKeys.rereadCount = existing.reads.length;
        existing.rankingMetadata.lastUpdated = new Date().toISOString();
        existing.derivedPace = derivePaceFromReads(existing.reads);
        dedupLog.push(
          `Merged ${added} read${added === 1 ? "" : "s"} for "${existing.title}" (row ${row.__rowIndex ?? index + 2}).`
        );
      } else {
        dedupLog.push(`Row ${row.__rowIndex ?? index + 2} for "${existing.title}" had no parsed read dates.`);
      }
    } else {
      keyed.set(key, record);
      if (!baseIndex.has(baseKey)) {
        baseIndex.set(baseKey, key);
      }
      return;
    }

    if (!baseIndex.has(baseKey)) {
      baseIndex.set(baseKey, existingKey);
    }
  });

  return {
    records: Array.from(keyed.values()),
    log: dedupLog,
    schemaVersion: SCHEMA_VERSION,
    contract: {
      dedupKey: "title|author|lengthMinutes",
      multiReadSeparator: "comma/semicolon/pipe"
    }
  };
}

export function parseCsv(csvText) {
  if (!csvText) {
    return [];
  }

  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\uFEFF") {
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const header = rows.shift().map((value) => value.trim());
  if (!header.length) {
    return [];
  }

  return rows
    .map((cells, rowIndex) => {
      const record = {};
      header.forEach((title, index) => {
        record[title || `column${index}`] = (cells[index] ?? "").trim();
      });
      record.__rowIndex = rowIndex + 2;
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value?.trim?.()));
}

export const DEDUP_RULE = "merge on case-insensitive title|author|lengthMinutes, keep newest reads.";
