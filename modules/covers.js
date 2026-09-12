/**
 * Match library books to static JPEGs in covers/, named `Title -- Author.jpg`.
 * Paths stay relative to the site root so GitHub Pages can serve them as-is.
 */
import { COVER_FILES } from "./coverFiles.js";

export const COVER_DIR = "covers";

const LEADING_ARTICLE = /^(the|a|an)\s+/;
const SEPARATOR = " -- ";

/**
 * @typedef {{
 *   filename: string,
 *   title: string,
 *   author: string,
 *   titleKey: string,
 *   authorKey: string,
 *   authorLast: string,
 * }} CoverEntry
 */

/**
 * Lowercase, strip punctuation/diacritics, collapse whitespace.
 * @param {string} value
 */
export function normalizeCoverText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Drop a leading English article after normalization.
 * @param {string} value
 */
export function stripLeadingArticle(value) {
  return normalizeCoverText(value).replace(LEADING_ARTICLE, "");
}

/**
 * Collapse single-letter initials: "j r r tolkien" → "jrr tolkien".
 * @param {string} value
 */
export function compactInitials(value) {
  return normalizeCoverText(value).replace(/\b([a-z]) (?=[a-z]\b)/g, "$1");
}

/**
 * @param {string} title
 */
export function titleKey(title) {
  return stripLeadingArticle(title);
}

/**
 * @param {string} author
 */
export function authorKey(author) {
  return compactInitials(author);
}

/**
 * @param {string} key
 */
export function lastNameKey(key) {
  const parts = compactInitials(key).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * @param {string} filename
 * @returns {CoverEntry | null}
 */
export function parseCoverFilename(filename) {
  if (typeof filename !== "string" || !filename) return null;
  const base = filename.replace(/\.jpe?g$/i, "");
  const sep = base.lastIndexOf(SEPARATOR);
  if (sep <= 0 || sep + SEPARATOR.length >= base.length) return null;
  const title = base.slice(0, sep);
  const author = base.slice(sep + SEPARATOR.length);
  const tKey = titleKey(title);
  const aKey = authorKey(author);
  if (!tKey || !aKey) return null;
  return {
    filename,
    title,
    author,
    titleKey: tKey,
    authorKey: aKey,
    authorLast: lastNameKey(aKey),
  };
}

/**
 * @param {readonly string[]} [files]
 * @returns {CoverEntry[]}
 */
export function buildCoverEntries(files = COVER_FILES) {
  /** @type {CoverEntry[]} */
  const entries = [];
  for (const filename of files) {
    const entry = parseCoverFilename(filename);
    if (entry) entries.push(entry);
  }
  return entries;
}

const COVER_ENTRIES = buildCoverEntries();

/**
 * @param {CoverEntry} entry
 * @param {string} ak
 * @param {string} last
 */
function authorCompatible(entry, ak, last) {
  if (!ak) return false;
  if (entry.authorKey === ak) return true;
  if (last && entry.authorLast === last) return true;
  if (last && entry.authorKey.includes(last) && last.length >= 4) return true;
  if (entry.authorLast && ak.includes(entry.authorLast) && entry.authorLast.length >= 4) {
    return true;
  }
  return false;
}

/**
 * Resolve a cover filename for a book, or null when nothing matches.
 * @param {string} title
 * @param {string} author
 * @param {readonly CoverEntry[]} [entries]
 * @returns {string | null}
 */
export function coverFilenameFor(title, author, entries = COVER_ENTRIES) {
  const tk = titleKey(title);
  const ak = authorKey(author);
  const last = lastNameKey(ak);
  if (!tk) return null;

  /** @type {CoverEntry[]} */
  const exactTitle = [];
  /** @type {{ entry: CoverEntry, overlap: number }[]} */
  const prefixHits = [];

  for (const entry of entries) {
    if (entry.titleKey === tk) {
      exactTitle.push(entry);
      continue;
    }
    if (entry.titleKey.startsWith(tk) || tk.startsWith(entry.titleKey)) {
      prefixHits.push({
        entry,
        overlap: Math.min(entry.titleKey.length, tk.length),
      });
    }
  }

  const pickAuthor = (/** @type {CoverEntry[]} */ pool) => {
    if (pool.length === 0) return null;
    const withAuthor = pool.filter((entry) => authorCompatible(entry, ak, last));
    const chosen = withAuthor.length > 0 ? withAuthor : ak ? [] : pool;
    if (chosen.length === 0) return null;
    chosen.sort((a, b) => a.titleKey.length - b.titleKey.length);
    return chosen[0] ?? null;
  };

  const exact = pickAuthor(exactTitle);
  if (exact) return exact.filename;

  if (exactTitle.length === 1 && !ak) {
    return exactTitle[0].filename;
  }

  const meaningful = prefixHits
    .filter(({ overlap, entry }) => {
      if (overlap < 8 && !tk.includes(" ")) return false;
      if (overlap < 4) return false;
      return authorCompatible(entry, ak, last);
    })
    .sort(
      (a, b) =>
        b.overlap - a.overlap || a.entry.titleKey.length - b.entry.titleKey.length
    );

  return meaningful[0]?.entry.filename ?? null;
}

/**
 * Public URL for a cover file, relative to the site root (GitHub Pages safe).
 * @param {string} filename
 */
export function coverHref(filename) {
  const encoded = filename
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${COVER_DIR}/${encoded}`;
}

/**
 * @param {{ title?: string, author?: string } | null | undefined} book
 * @returns {string | null}
 */
export function coverHrefFor(book) {
  if (!book?.title) return null;
  const filename = coverFilenameFor(book.title, book.author ?? "");
  return filename ? coverHref(filename) : null;
}

/**
 * Stable fallback tone so the same book matches across lists.
 * @param {{ title?: string, author?: string } | null | undefined} book
 */
export function coverToneIndex(book) {
  const seed = `${book?.title ?? ""}\0${book?.author ?? ""}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 5;
}

/**
 * Cover slot: real image when matched, existing tone placeholder otherwise.
 * @param {{ title?: string, author?: string } | null | undefined} book
 * @param {{ extraClass?: string }} [opts]
 */
export function createCoverElement(book, opts = {}) {
  const tone = coverToneIndex(book);
  const el = document.createElement("div");
  el.className = `handful-cover handful-cover-tone-${tone}`;
  if (opts.extraClass) el.classList.add(opts.extraClass);
  el.setAttribute("aria-hidden", "true");

  const href = coverHrefFor(book);
  if (!href) return el;

  const img = document.createElement("img");
  img.src = href;
  img.alt = "";
  img.draggable = false;
  img.loading = "lazy";
  img.width = 56;
  img.height = 84;
  img.addEventListener("error", () => {
    img.remove();
  });
  el.append(img);
  return el;
}
