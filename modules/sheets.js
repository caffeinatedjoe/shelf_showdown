/**
 * Load books from a public Google Sheets URL.
 * Uses the Visualization API (JSONP) so the browser can read shared sheets
 * without a backend or CORS proxy.
 */

import { extractBooksFromMatrix } from "./tabular.js";

/** @typedef {{ title: string, author: string, timesRead: number, finishedAts: number[] }} BookRow */

const SHEET_ID_RE =
  /(?:docs\.google\.com\/spreadsheets\/d\/|\/d\/)([a-zA-Z0-9-_]+)/;

/**
 * @param {string} urlOrId
 * @returns {string | null}
 */
export function extractSpreadsheetId(urlOrId) {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(SHEET_ID_RE);
  return match ? match[1] : null;
}

/**
 * Optional gid from #gid= or ?gid=
 * @param {string} url
 * @returns {string | null}
 */
export function extractGid(url) {
  const match = url.match(/[?#&]gid=([0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch a public Google Sheet and extract title/author rows.
 * Sheet must be shared so "Anyone with the link" can view.
 *
 * @param {string} urlOrId
 * @returns {Promise<{ books: BookRow[], spreadsheetId: string }>}
 */
export async function importBooksFromSheetUrl(urlOrId) {
  const spreadsheetId = extractSpreadsheetId(urlOrId);
  if (!spreadsheetId) {
    throw new Error("That doesn’t look like a Google Sheets link.");
  }

  const gid = extractGid(urlOrId);
  const table = await fetchSheetTable(spreadsheetId, gid);
  const books = booksFromGvizTable(table);

  if (books.length === 0) {
    throw new Error(
      "Couldn’t find title/author columns in that sheet. Check sharing is “Anyone with the link”, then try again."
    );
  }

  return { books, spreadsheetId };
}

/**
 * @typedef {{ label?: string, type?: string }} GvizCol
 * @typedef {{ v?: unknown, f?: string }} GvizCell
 * @typedef {{ c: (GvizCell | null)[] }} GvizRow
 * @typedef {{ cols: GvizCol[], rows: GvizRow[] }} GvizTable
 */

/**
 * @param {string} spreadsheetId
 * @param {string | null} gid
 * @returns {Promise<GvizTable>}
 */
function fetchSheetTable(spreadsheetId, gid) {
  return new Promise((resolve, reject) => {
    const callbackName = `__shelfSheet_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const params = new URLSearchParams({
      tqx: `responseHandler:${callbackName}`,
    });
    if (gid) params.set("gid", gid);

    const src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${params}`;
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timer);
      // @ts-expect-error dynamic JSONP callback
      delete window[callbackName];
      script.remove();
    };

    /**
     * @param {string} message
     */
    const fail = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    /**
     * @param {{ table?: GvizTable, status?: string, errors?: { detailed_message?: string }[] }} response
     */
    // @ts-expect-error dynamic JSONP callback
    window[callbackName] = (response) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (!response || response.status === "error" || !response.table) {
        const detail = response?.errors?.[0]?.detailed_message;
        fail(
          detail ||
            "Couldn’t read that sheet. Make sure it’s shared with “Anyone with the link”."
        );
        return;
      }
      resolve(response.table);
    };

    script.onerror = () => {
      fail(
        "Network error loading the sheet. Check the URL and that the sheet is publicly viewable."
      );
    };

    const timer = window.setTimeout(() => {
      fail("Timed out waiting for Google Sheets. Try again in a moment.");
    }, 20000);

    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  });
}

/**
 * @param {GvizTable} table
 * @returns {BookRow[]}
 */
function booksFromGvizTable(table) {
  const cols = table.cols || [];
  const headers = cols.map((col) =>
    col.label != null && String(col.label).trim() !== ""
      ? String(col.label).trim()
      : null
  );

  const width = Math.max(
    headers.length,
    ...(table.rows || []).map((r) => (r.c || []).length),
    0
  );

  while (headers.length < width) headers.push(null);

  const matrix = (table.rows || []).map((row) => {
    const cells = row.c || [];
    /** @type {string[]} */
    const out = [];
    for (let i = 0; i < width; i++) {
      const colType = (cols[i]?.type || "").toLowerCase();
      out.push(cellToString(cells[i], colType));
    }
    return out;
  });

  return extractBooksFromMatrix(matrix, { headers });
}

/**
 * @param {GvizCell | null | undefined} cell
 * @param {string} [colType]
 */
function cellToString(cell, colType = "") {
  if (!cell) return "";
  // Prefer raw Date(y,m,d) for date columns — more reliable than locale `f`.
  if (
    (colType === "date" || colType === "datetime") &&
    cell.v != null &&
    String(cell.v).trim() !== ""
  ) {
    return String(cell.v).trim();
  }
  if (cell.f != null && String(cell.f).trim() !== "") return String(cell.f).trim();
  if (cell.v == null) return "";
  return String(cell.v).trim();
}
