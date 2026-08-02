/**
 * Flexible tabular → book extraction without a rigid schema or LLM.
 * Finds title/author columns via header synonyms + content heuristics,
 * counts re-reads from duplicate rows (or an explicit read-count column),
 * then discards dates, lengths, tags, and other stats.
 */

/** @typedef {{ title: string, author: string, timesRead: number }} BookRow */

const TITLE_HEADER =
  /^(title|book|book\s*title|book\s*name|name|work|novel|story|album|item)$/i;
const AUTHOR_HEADER =
  /^(author|authors|writer|writers|by|creator|artist|composer)$/i;
/** Explicit per-book read counts — not yearly running totals like "Annual Count". */
const TIMES_READ_HEADER =
  /^(times?\s*read|read\s*count|#\s*reads?|number\s*of\s*reads?|reads)$/i;

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

    const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      if (fromColumn != null) {
        existing.timesRead = Math.max(existing.timesRead, fromColumn);
      } else {
        existing.timesRead += 1;
      }
    } else {
      byKey.set(key, { title, author, timesRead: Math.max(1, increment) });
    }
  }

  return Array.from(byKey.values());
}

/**
 * @param {(string | null)[]} headers
 * @param {string[][]} dataRows
 * @param {number} width
 * @returns {{ titleCol: number, authorCol: number, timesReadCol: number }}
 */
function resolveColumns(headers, dataRows, width) {
  let titleCol = -1;
  let authorCol = -1;
  let timesReadCol = -1;

  for (let i = 0; i < width; i++) {
    const h = headers[i];
    if (!h) continue;
    if (titleCol < 0 && TITLE_HEADER.test(h)) titleCol = i;
    if (authorCol < 0 && AUTHOR_HEADER.test(h)) authorCol = i;
    if (timesReadCol < 0 && TIMES_READ_HEADER.test(h)) timesReadCol = i;
  }

  // Softer header contains-match if exact synonyms missed
  if (titleCol < 0 || authorCol < 0) {
    for (let i = 0; i < width; i++) {
      const h = (headers[i] || "").toLowerCase();
      if (!h) continue;
      if (titleCol < 0 && /\btitle\b|\bbook\b/.test(h) && !/count|date|read/.test(h)) {
        titleCol = i;
      }
      if (authorCol < 0 && /\bauthor\b|\bwriter\b|\bby\b/.test(h)) {
        authorCol = i;
      }
    }
  }

  if (titleCol >= 0 && authorCol >= 0 && titleCol !== authorCol) {
    return { titleCol, authorCol, timesReadCol };
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

  return { titleCol, authorCol, timesReadCol };
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
    if (TITLE_HEADER.test(c) || AUTHOR_HEADER.test(c) || TIMES_READ_HEADER.test(c)) hits++;
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
