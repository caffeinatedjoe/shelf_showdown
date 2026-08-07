/**
 * Flexible tabular → book extraction without a rigid schema or LLM.
 * Finds title/author columns via header synonyms + content heuristics,
 * counts re-reads from duplicate rows (or an explicit read-count column),
 * and keeps finish/read dates for monthly reading stats.
 */

/**
 * @typedef {{ title: string, author: string, timesRead: number, finishedAts: number[] }} BookRow
 */

const TITLE_HEADER =
  /^(title|book|book\s*title|book\s*name|name|work|novel|story|album|item)$/i;
const AUTHOR_HEADER =
  /^(author|authors|writer|writers|by|creator|artist|composer)$/i;
/** Explicit per-book read counts — not yearly running totals like "Annual Count". */
const TIMES_READ_HEADER =
  /^(times?\s*read|read\s*count|#\s*reads?|number\s*of\s*reads?|reads)$/i;
/** Finish / date-read columns from reading logs (Goodreads, Sheets, etc.). */
const DATE_HEADER =
  /^(date(\s*(read|finished|finished\s*on|completed|completed\s*on))?|finished(\s*(on|date|at))?|read\s*date|date\s*read|completed(\s*(on|date))?|when\s*read|finish\s*date)$/i;

const DATE_RE =
  /^(?:\d{1,4}[\/\-.\s]\d{1,2}[\/\-.\s]\d{1,4}|\d{4}-\d{2}-\d{2}|Date\(\d)/i;
const DURATION_RE = /^\d{1,3}:\d{2}(?::\d{2})?$/;
const NUMERIC_RE = /^-?\d+(?:\.\d+)?%?$/;
const CODE_RE = /^[A-Za-z]$/;

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvToMatrix(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  return lines.map(splitCsvLine);
}

/**
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * @param {string} text
 * @returns {BookRow[]}
 */
export function parseCsv(text) {
  return extractBooksFromMatrix(parseCsvToMatrix(text));
}

/**
 * @param {string[][]} matrix raw rows (may include a header row)
 * @param {{ headers?: (string | null)[] }} [opts] optional pre-known headers (e.g. from gviz)
 * @returns {BookRow[]}
 */
export function extractBooksFromMatrix(matrix, opts = {}) {
  if (!matrix.length) return [];

  const width = Math.max(
    ...matrix.map((r) => r.length),
    opts.headers?.length ?? 0
  );
  if (width === 0) return [];

  /** @type {(string | null)[]} */
  const provided = (opts.headers ?? []).map((h) =>
    h == null ? null : String(h).trim()
  );

  const first = padRow(matrix[0], width);
  const firstLooksLikeHeader =
    provided.some(Boolean) || rowLooksLikeHeader(first);

  /** @type {(string | null)[]} */
  let headers = Array.from({ length: width }, (_, i) => provided[i] || null);
  let dataStart = 0;

  if (firstLooksLikeHeader) {
    for (let i = 0; i < width; i++) {
      const cell = first[i]?.trim() || "";
      if (cell && !headers[i]) headers[i] = cell;
    }
    dataStart = 1;
  }

  const dataRows = matrix
    .slice(dataStart)
    .map((r) => padRow(r, width))
    .filter((r) => r.some((c) => c.trim()));

  const mapping = resolveColumns(headers, dataRows, width);
  if (mapping.titleCol < 0) return [];

  /** @type {Map<string, BookRow>} */
  const byKey = new Map();

  for (const row of dataRows) {
    const title = (row[mapping.titleCol] || "").trim();
    if (!title || looksLikeHeaderLabel(title)) continue;

    let author =
      mapping.authorCol >= 0 ? (row[mapping.authorCol] || "").trim() : "";
    if (!author || looksLikeHeaderLabel(author)) author = "Unknown";

    const fromColumn =
      mapping.timesReadCol >= 0
        ? parseTimesRead(row[mapping.timesReadCol])
        : null;
    const increment = fromColumn ?? 1;
    const finishedAt =
      mapping.dateCol >= 0 ? parseFinishedAt(row[mapping.dateCol]) : null;

    const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      if (fromColumn != null) {
        existing.timesRead = Math.max(existing.timesRead, fromColumn);
      } else {
        existing.timesRead += 1;
      }
      if (finishedAt != null) {
        existing.finishedAts.push(finishedAt);
      }
    } else {
      byKey.set(key, {
        title,
        author,
        timesRead: Math.max(1, increment),
        finishedAts: finishedAt != null ? [finishedAt] : [],
      });
    }
  }

  return Array.from(byKey.values()).map((book) => ({
    ...book,
    timesRead: Math.max(book.timesRead, book.finishedAts.length || 1),
    finishedAts: dedupeFinishedAts(book.finishedAts),
  }));
}

/**
 * @param {(string | null)[]} headers
 * @param {string[][]} dataRows
 * @param {number} width
 * @returns {{ titleCol: number, authorCol: number, timesReadCol: number, dateCol: number }}
 */
function resolveColumns(headers, dataRows, width) {
  let titleCol = -1;
  let authorCol = -1;
  let timesReadCol = -1;
  let dateCol = -1;

  for (let i = 0; i < width; i++) {
    const h = headers[i];
    if (!h) continue;
    if (titleCol < 0 && TITLE_HEADER.test(h)) titleCol = i;
    if (authorCol < 0 && AUTHOR_HEADER.test(h)) authorCol = i;
    if (timesReadCol < 0 && TIMES_READ_HEADER.test(h)) timesReadCol = i;
    if (dateCol < 0 && DATE_HEADER.test(h)) dateCol = i;
  }

  // Softer header contains-match if exact synonyms missed
  if (titleCol < 0 || authorCol < 0 || dateCol < 0) {
    for (let i = 0; i < width; i++) {
      const h = (headers[i] || "").toLowerCase();
      if (!h) continue;
      if (titleCol < 0 && /\btitle\b|\bbook\b/.test(h) && !/count|date|read/.test(h)) {
        titleCol = i;
      }
      if (authorCol < 0 && /\bauthor\b|\bwriter\b|\bby\b/.test(h)) {
        authorCol = i;
      }
      if (
        dateCol < 0 &&
        /\bdate\b/.test(h) &&
        !/birth|publish|start|added|bought/.test(h)
      ) {
        dateCol = i;
      }
    }
  }

  if (dateCol < 0) {
    dateCol = detectDateColumn(dataRows, width, [
      titleCol,
      authorCol,
      timesReadCol,
    ]);
  }

  if (titleCol >= 0 && authorCol >= 0 && titleCol !== authorCol) {
    return { titleCol, authorCol, timesReadCol, dateCol };
  }

  const scores = scoreColumns(dataRows, width);

  if (titleCol < 0) {
    titleCol = bestIndex(scores, "title", authorCol);
  }
  if (authorCol < 0) {
    authorCol = bestIndex(scores, "author", titleCol);
  }

  // Prefer adjacent title→author when scores are close (common reading-log layout)
  if (titleCol >= 0 && (authorCol < 0 || authorCol === titleCol)) {
    const right = titleCol + 1;
    if (right < width && scores[right].author > 0.15) {
      authorCol = right;
    }
  }

  if (titleCol === authorCol) authorCol = -1;

  if (dateCol < 0) {
    dateCol = detectDateColumn(dataRows, width, [
      titleCol,
      authorCol,
      timesReadCol,
    ]);
  }

  return { titleCol, authorCol, timesReadCol, dateCol };
}

/**
 * @param {string | undefined} raw
 * @returns {number | null}
 */
function parseTimesRead(raw) {
  const text = (raw || "").trim();
  if (!text) return null;
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Parse a finish/read date cell into a unix timestamp (ms).
 * Accepts ISO, locale dates, and Google Sheets `Date(y,m,d)` values.
 *
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function parseFinishedAt(raw) {
  const text = (raw || "").trim();
  if (!text) return null;

  const gviz = text.match(
    /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*\d{1,2},\s*\d{1,2},\s*\d{1,2})?\)$/i
  );
  if (gviz) {
    const year = Number(gviz[1]);
    const monthIndex = Number(gviz[2]);
    const day = Number(gviz[3]);
    const dt = new Date(year, monthIndex, day);
    if (
      dt.getFullYear() === year &&
      dt.getMonth() === monthIndex &&
      dt.getDate() === day
    ) {
      return dt.getTime();
    }
    return null;
  }

  // Bare years / short numbers are not finish dates.
  if (/^\d{1,4}$/.test(text) || /^\d{5,}$/.test(text)) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const dt = new Date(year, month - 1, day);
    if (
      dt.getFullYear() === year &&
      dt.getMonth() === month - 1 &&
      dt.getDate() === day
    ) {
      return dt.getTime();
    }
    return null;
  }

  const slash = text.match(/^(\d{1,4})[\/\-.\s](\d{1,2})[\/\-.\s](\d{1,4})$/);
  if (slash) {
    let a = Number(slash[1]);
    let b = Number(slash[2]);
    let c = Number(slash[3]);
    /** @type {number} */
    let year;
    /** @type {number} */
    let month;
    /** @type {number} */
    let day;
    if (String(slash[1]).length === 4) {
      year = a;
      month = b;
      day = c;
    } else if (String(slash[3]).length === 4) {
      year = c;
      // Prefer MDY when first part > 12 would be invalid as month — else MDY (US reading logs).
      if (a > 12) {
        day = a;
        month = b;
      } else {
        month = a;
        day = b;
      }
    } else {
      return null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(year, month - 1, day);
    if (
      dt.getFullYear() === year &&
      dt.getMonth() === month - 1 &&
      dt.getDate() === day
    ) {
      return dt.getTime();
    }
    return null;
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  const dt = new Date(parsed);
  const year = dt.getFullYear();
  if (year < 1900 || year > 2100) return null;
  return dt.getTime();
}

/**
 * @param {number[]} timestamps
 * @returns {number[]}
 */
function dedupeFinishedAts(timestamps) {
  /** @type {Map<string, number>} */
  const byDay = new Map();
  for (const ts of timestamps) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(key)) byDay.set(key, ts);
  }
  return [...byDay.values()].sort((a, b) => a - b);
}

/**
 * @param {string[][]} dataRows
 * @param {number} width
 * @param {number[]} exclude
 * @returns {number}
 */
function detectDateColumn(dataRows, width, exclude) {
  const sample = dataRows.slice(0, Math.min(40, dataRows.length));
  if (sample.length === 0) return -1;

  let best = -1;
  let bestRatio = 0;
  const excluded = new Set(exclude.filter((i) => i >= 0));

  for (let c = 0; c < width; c++) {
    if (excluded.has(c)) continue;
    let hits = 0;
    let usable = 0;
    for (const row of sample) {
      const raw = (row[c] || "").trim();
      if (!raw) continue;
      usable++;
      if (parseFinishedAt(raw) != null) hits++;
    }
    if (usable < 2) continue;
    const ratio = hits / usable;
    if (ratio >= 0.6 && ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  return best;
}

/**
 * @param {string[][]} dataRows
 * @param {number} width
 * @returns {{ title: number, author: number }[]}
 */
function scoreColumns(dataRows, width) {
  const sample = dataRows.slice(0, Math.min(40, dataRows.length));
  /** @type {{ title: number, author: number }[]} */
  const scores = Array.from({ length: width }, () => ({ title: 0, author: 0 }));
  if (sample.length === 0) return scores;

  for (let c = 0; c < width; c++) {
    let titlePts = 0;
    let authorPts = 0;
    let usable = 0;

    for (const row of sample) {
      const raw = (row[c] || "").trim();
      if (!raw) continue;
      usable++;

      if (isNonTextNoise(raw)) {
        titlePts -= 2;
        authorPts -= 2;
        continue;
      }

      const words = raw.split(/\s+/).filter(Boolean);
      const letters = (raw.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      const letterRatio = letters / raw.length;

      // Title: longer phrases, book-like
      if (raw.length >= 2 && raw.length <= 180 && letterRatio > 0.45) {
        titlePts += 1;
        if (raw.length >= 8) titlePts += 0.5;
        if (raw.length >= 20) titlePts += 0.5;
        if (/[:—–-]/.test(raw)) titlePts += 0.35;
        if (words.length >= 2 && words.length <= 12) titlePts += 0.4;
        if (words.length === 1 && raw.length < 6) titlePts -= 0.4;
      } else {
        titlePts -= 0.5;
      }

      // Author: person-name shaped
      if (raw.length >= 2 && raw.length <= 80 && letterRatio > 0.55) {
        authorPts += 1;
        if (words.length >= 2 && words.length <= 5) authorPts += 0.8;
        if (/^[A-ZÀ-ÿ]/.test(raw)) authorPts += 0.3;
        if (/\b(and|&|,)\b/i.test(raw)) authorPts += 0.35;
        if (/\b([A-Z]\.){1,3}/.test(raw)) authorPts += 0.5; // J.R.R.
        if (raw.length > 60) authorPts -= 0.8;
        if (words.length > 6) authorPts -= 0.6;
      } else {
        authorPts -= 0.5;
      }
    }

    const n = Math.max(usable, 1);
    scores[c] = {
      title: titlePts / n,
      author: authorPts / n,
    };
  }

  return scores;
}

/**
 * @param {{ title: number, author: number }[]} scores
 * @param {"title" | "author"} kind
 * @param {number} exclude
 */
function bestIndex(scores, kind, exclude) {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    if (i === exclude) continue;
    const s = scores[i][kind];
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  // Require a weakly positive signal so empty/noise columns aren't chosen
  return bestScore > 0.2 ? best : -1;
}

/**
 * @param {string} value
 */
function isNonTextNoise(value) {
  if (DATE_RE.test(value)) return true;
  if (DURATION_RE.test(value)) return true;
  if (NUMERIC_RE.test(value)) return true;
  if (CODE_RE.test(value)) return true;
  return false;
}

/**
 * @param {string[]} row
 */
function rowLooksLikeHeader(row) {
  const cells = row.map((c) => c.trim()).filter(Boolean);
  if (cells.length === 0) return false;
  let hits = 0;
  for (const c of cells) {
    if (
      TITLE_HEADER.test(c) ||
      AUTHOR_HEADER.test(c) ||
      TIMES_READ_HEADER.test(c) ||
      DATE_HEADER.test(c)
    ) {
      hits++;
    }
    if (/^(date|length|count|pages|rating|genre|status|notes?|isbn|year)/i.test(c)) {
      hits++;
    }
  }
  return hits >= 1 && hits >= Math.min(2, cells.length) * 0.35;
}

/**
 * @param {string} value
 */
function looksLikeHeaderLabel(value) {
  return TITLE_HEADER.test(value) || AUTHOR_HEADER.test(value);
}

/**
 * @param {string[]} row
 * @param {number} width
 */
function padRow(row, width) {
  const out = row.slice(0, width);
  while (out.length < width) out.push("");
  return out;
}
