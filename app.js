import {
  addBookRemote,
  clearLibraryRemote,
  importBooksRemote,
  INITIAL_RATING,
  loadState,
  removeBookRemote,
  setRatingsRemote,
} from "./modules/storage.js?v=20260810d";
import {
  clearHandfulSession,
  createFreshHandfulSession,
  createHandfulSession,
  estimatedHandfulScreens,
  handfulProgress,
  loadHandfulSession,
  resetAllRatings,
  saveHandfulSession,
  skipHandfulBook,
  submitHandful,
  syncHandfulWithBooks,
  undoHandful,
} from "./modules/handful.js?v=20260810d";
import { parseCsv } from "./modules/tabular.js?v=20260810d";
import { importBooksFromSheetUrl } from "./modules/sheets.js?v=20260810d";
import {
  getCurrentUser,
  isSignedInLocally,
  passwordAuth,
  signOut,
} from "./modules/auth.js?v=20260810d";

/** @typedef {import("./modules/storage.js").AppState} AppState */
/** @typedef {import("./modules/storage.js").Book} Book */
/** @typedef {import("./modules/handful.js").HandfulSession} HandfulSession */
/** @typedef {"compare" | "rankings" | "stats" | "library"} ViewName */

/** @type {AppState} */
let state = { books: [], comparisons: [] };

/** @type {HandfulSession | null} */
let sortSession = null;

/** @type {boolean} */
let busy = false;

/** @type {{
 *   item: HTMLElement,
 *   placeholder: HTMLElement,
 *   pointerId: number,
 *   grabOffsetY: number,
 *   height: number,
 * } | null} */
let drag = null;

/** Horizontal swipe vs vertical drag intent (mobile / app layout). */
const SWIPE_THRESHOLD = 40;
const GESTURE_ANGLE_RATIO = 1.05;
const GESTURE_INTENT_PX = 12;

/** Pull-to-refresh (replaces native browser PTR blocked by locked viewport). */
const PULL_INTENT_PX = 10;
const PULL_ACTIVATE_PX = 64;
const PULL_MAX_PX = 108;

/** @type {{
 *   mode: "pending" | "swipe" | "ignore",
 *   pointerId: number,
 *   startX: number,
 *   startY: number,
 *   lastX: number,
 *   lastY: number,
 *   item: HTMLElement | null,
 * } | null} */
let pointerGesture = null;

/** @type {number} */
let swipeToastTimer = 0;

/** @type {{
 *   pointerId: number,
 *   startX: number,
 *   startY: number,
 *   pullPx: number,
 *   armed: boolean,
 *   scrollEl: HTMLElement | null,
 *   priorOverflowY: string | null,
 * } | null} */
let pullGesture = null;

/** @type {boolean} */
let pullRefreshing = false;

const els = {
  tabs: document.querySelectorAll(".tab"),
  views: {
    compare: document.getElementById("view-compare"),
    rankings: document.getElementById("view-rankings"),
    stats: document.getElementById("view-stats"),
    library: document.getElementById("view-library"),
  },
  statsSummary: document.getElementById("stats-summary"),
  statsMonthly: document.getElementById("stats-monthly"),
  monthlyChart: document.getElementById("monthly-chart"),
  rereadsList: document.getElementById("rereads-list"),
  rereadsEmpty: document.getElementById("rereads-empty"),
  libraryReadyCta: document.getElementById("library-ready-cta"),
  libraryToCompare: document.getElementById("library-to-compare"),
  compareToLibrary: document.getElementById("compare-to-library"),
  authPanel: document.getElementById("auth-panel"),
  appShell: document.getElementById("app-shell"),
  accountBar: document.getElementById("account-bar"),
  accountEmail: document.getElementById("account-email"),
  signOutBtn: document.getElementById("sign-out-btn"),
  authForm: /** @type {HTMLFormElement} */ (document.getElementById("auth-form")),
  authEmail: /** @type {HTMLInputElement} */ (document.getElementById("auth-email")),
  authPassword: /** @type {HTMLInputElement} */ (document.getElementById("auth-password")),
  authTitle: document.getElementById("auth-title"),
  authLede: document.getElementById("auth-lede"),
  authSubmitBtn: /** @type {HTMLButtonElement} */ (document.getElementById("auth-submit-btn")),
  authSwitchPrompt: document.getElementById("auth-switch-prompt"),
  authSwitchBtn: /** @type {HTMLButtonElement} */ (document.getElementById("auth-switch-btn")),
  authStatus: document.getElementById("auth-status"),
  addForm: document.getElementById("add-book-form"),
  titleInput: /** @type {HTMLInputElement} */ (document.getElementById("book-title")),
  authorInput: /** @type {HTMLInputElement} */ (document.getElementById("book-author")),
  csvInput: /** @type {HTMLInputElement} */ (document.getElementById("csv-input")),
  sheetsForm: /** @type {HTMLFormElement} */ (document.getElementById("sheets-import-form")),
  sheetsUrl: /** @type {HTMLInputElement} */ (document.getElementById("sheets-url")),
  sheetsBtn: /** @type {HTMLButtonElement} */ (document.getElementById("sheets-import-btn")),
  clearBtn: document.getElementById("clear-library-btn"),
  bookList: document.getElementById("book-list"),
  libraryStatus: document.getElementById("library-status"),
  compareEmpty: document.getElementById("compare-empty"),
  compareActive: document.getElementById("compare-active"),
  compareDone: document.getElementById("compare-done"),
  compareToRankings: document.getElementById("compare-to-rankings"),
  resortBtn: document.getElementById("resort-btn"),
  handfulList: document.getElementById("handful-list"),
  handfulSubmit: /** @type {HTMLButtonElement | null} */ (
    document.getElementById("handful-submit")
  ),
  handfulPromptSub: document.getElementById("handful-prompt-sub"),
  skipBtn: document.getElementById("skip-btn"),
  undoBtn: document.getElementById("undo-btn"),
  swipeToast: document.getElementById("swipe-toast"),
  compareProgress: document.getElementById("compare-progress"),
  compareRoundLabel: document.getElementById("compare-round-label"),
  compareProgressFill: document.getElementById("compare-progress-fill"),
  compareProgressCount: document.getElementById("compare-progress-count"),
  rankingsList: document.getElementById("rankings-list"),
  rankingsEmpty: document.getElementById("rankings-empty"),
  pullRefresh: document.getElementById("pull-refresh"),
  pullRefreshLabel: document.getElementById("pull-refresh-label"),
  appRoot: document.getElementById("app"),
};

async function refreshState() {
  state = await loadState();
  ensureSortSession();
}

function ensureSortSession() {
  if (!sortSession) {
    sortSession = loadHandfulSession(state.books);
  } else {
    sortSession = syncHandfulWithBooks(sortSession, state.books);
  }
  saveHandfulSession(sortSession);
}

function resetSortSession() {
  clearHandfulSession();
  sortSession = createHandfulSession(state.books);
  saveHandfulSession(sortSession);
}

/** Library is ready to compare when it has at least two books. */
function canCompare() {
  return state.books.length >= 2;
}

/** Compare is the home screen once a library can support matchups. */
function homeView() {
  return canCompare() ? "compare" : "library";
}

/**
 * @param {ViewName} name
 */
function showView(name) {
  for (const [key, view] of Object.entries(els.views)) {
    if (!view) continue;
    const active = key === name;
    view.hidden = !active;
    view.classList.toggle("active", active);
  }
  els.tabs.forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (name === "compare") renderCompare();
  if (name === "rankings") renderRankings();
  if (name === "stats") renderStats();
  if (name === "library") renderLibrary();
}

/**
 * After auth or boot: land on Compare when ready, otherwise Library setup.
 */
function enterApp() {
  showView(homeView());
}

/**
 * After adding/importing books, prefer Compare when the library just became ready.
 * @param {number} previousCount
 */
function afterLibraryChange(previousCount) {
  if (canCompare() && previousCount < 2) {
    showView("compare");
    return;
  }
  renderLibrary();
}

function renderLibrary() {
  els.bookList.replaceChildren();
  const books = [...state.books].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );

  if (els.libraryReadyCta) {
    els.libraryReadyCta.hidden = !canCompare();
  }

  for (const book of books) {
    const li = document.createElement("li");
    const accent = document.createElement("div");
    accent.className = "list-accent";
    accent.setAttribute("aria-hidden", "true");

    const meta = document.createElement("div");
    meta.className = "book-meta";
    meta.innerHTML = `<strong></strong><span></span>`;
    meta.querySelector("strong").textContent = book.title;
    meta.querySelector("span").textContent = book.author;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-book";
    remove.setAttribute("aria-label", `Remove ${book.title}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => void removeBook(book.id));

    li.append(accent, meta, remove);
    els.bookList.append(li);
  }

  const progress = sortSession
    ? handfulProgress(sortSession, state.books)
    : { placed: 0, total: books.length, done: false };
  const est = estimatedHandfulScreens(books.length);
  els.libraryStatus.textContent =
    books.length === 0
      ? "No books yet — add a few or import a sheet to start sorting."
      : books.length === 1
        ? "1 book · add one more to start sorting."
        : progress.done
          ? `${books.length} books · shelf sorted`
          : `${books.length} books · ${progress.placed} on the shelf · ~${est} handfuls to finish`;
}

function renderCompare() {
  if (state.books.length < 2) {
    els.compareEmpty.hidden = false;
    els.compareActive.hidden = true;
    if (els.compareDone) els.compareDone.hidden = true;
    if (els.compareRoundLabel) {
      els.compareRoundLabel.textContent = "Round 1: Rank your top 5";
    }
    if (els.compareProgressFill) els.compareProgressFill.style.width = "0%";
    if (els.compareProgressCount) els.compareProgressCount.textContent = "0/0";
    return;
  }

  ensureSortSession();
  const progress = handfulProgress(sortSession, state.books);

  if (progress.done) {
    els.compareEmpty.hidden = true;
    els.compareActive.hidden = true;
    if (els.compareDone) els.compareDone.hidden = false;
    if (els.compareRoundLabel) {
      els.compareRoundLabel.textContent = "Shelf sorted";
    }
    if (els.compareProgressFill) els.compareProgressFill.style.width = "100%";
    if (els.compareProgressCount) {
      els.compareProgressCount.textContent = `${progress.total}/${progress.total}`;
    }
    return;
  }

  if (els.compareDone) els.compareDone.hidden = true;
  els.compareEmpty.hidden = true;
  els.compareActive.hidden = false;

  const promptTouch = els.handfulPromptSub?.querySelector(".prompt-touch");
  const promptDesktop = els.handfulPromptSub?.querySelector(".prompt-desktop");
  if (sortSession.phase === "merge") {
    if (promptTouch) {
      promptTouch.textContent =
        "Merge step — drag the best remaining to the top. Swipe left to undo.";
    }
    if (promptDesktop) {
      promptDesktop.textContent =
        "Merge step — drag the best remaining titles to the top, then lock in.";
    }
  } else {
    if (promptTouch) {
      promptTouch.textContent =
        "Drag to rearrange. Swipe right to skip, left to undo.";
    }
    if (promptDesktop) {
      promptDesktop.textContent = "Drag to rearrange, then lock in your ranks.";
    }
  }

  renderHandfulList();

  const estTotal = estimatedHandfulScreens(state.books.length);
  const phaseLabel =
    sortSession.phase === "merge" ? "Merging runs" : "Grouping";
  const roundNum = progress.handfulsCompleted + 1;
  const handfulSize = Math.max(sortSession.handful.length, 1);
  if (els.compareRoundLabel) {
    els.compareRoundLabel.textContent =
      sortSession.phase === "merge"
        ? `Round ${roundNum}: Merge your top picks`
        : `Round ${roundNum}: Rank your top ${handfulSize}`;
  }
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.placed / progress.total) * 100))
      : 0;
  if (els.compareProgressFill) {
    els.compareProgressFill.style.width = `${pct}%`;
  }
  if (els.compareProgressCount) {
    els.compareProgressCount.textContent = `${progress.placed}/${progress.total}`;
  }
  els.compareProgress.textContent = `${phaseLabel} · ${progress.placed} of ${progress.total} on the shelf · handful ${roundNum} · ~${estTotal} screens total`;
  if (els.handfulSubmit) els.handfulSubmit.disabled = busy || sortSession.handful.length === 0;
  els.undoBtn.disabled = busy || !(sortSession?.undoStack.length > 0);
  els.skipBtn.disabled =
    busy ||
    sortSession.phase !== "group" ||
    sortSession.handful.length === 0;
}

function renderHandfulList() {
  if (!els.handfulList || !sortSession) return;
  els.handfulList.replaceChildren();

  sortSession.handful.forEach((id, index) => {
    const book = state.books.find((b) => b.id === id);
    if (!book) return;

    const li = document.createElement("li");
    li.className = "handful-item";
    li.dataset.id = book.id;
    if (index === 0) li.classList.add("is-first");

    const handle = document.createElement("div");
    handle.className = "handful-handle";
    handle.setAttribute("role", "img");
    handle.setAttribute("aria-label", `Rank ${index + 1}, drag to reorder`);
    const rank = document.createElement("span");
    rank.className = "handful-rank";
    rank.textContent = String(index + 1);
    handle.append(rank);

    const cover = document.createElement("div");
    cover.className = `handful-cover handful-cover-tone-${index % 5}`;
    cover.setAttribute("aria-hidden", "true");

    const meta = document.createElement("div");
    meta.className = "book-meta";
    const title = document.createElement("strong");
    title.textContent = book.title;
    const authorRow = document.createElement("span");
    authorRow.className = "meta-row";
    authorRow.innerHTML = `<span class="meta-label">Author:</span> `;
    authorRow.append(document.createTextNode(book.author));
    meta.append(title, authorRow);
    const times = book.timesRead ?? 1;
    if (times > 1) {
      const reread = document.createElement("span");
      reread.className = "meta-row";
      reread.innerHTML = `<span class="meta-label">Reads:</span> ${times}`;
      meta.append(reread);
    }

    li.append(handle, cover, meta);
    els.handfulList.append(li);
  });
}

function syncHandfulOrderFromDom() {
  if (!els.handfulList || !sortSession) return;
  const ids = [...els.handfulList.querySelectorAll(".handful-item")]
    .map((el) => el.dataset.id)
    .filter(Boolean);
  sortSession = {
    ...sortSession,
    handful: ids,
  };
  saveHandfulSession(sortSession);
  updateHandfulRanks();
}

function updateHandfulRanks() {
  if (!els.handfulList) return;
  const items = [...els.handfulList.querySelectorAll(".handful-item")];
  items.forEach((item, index) => {
    const rank = item.querySelector(".handful-rank");
    if (rank) rank.textContent = String(index + 1);
    item.classList.toggle("is-first", index === 0);
  });
}

function renderRankings() {
  els.rankingsList.replaceChildren();
  if (state.books.length === 0) {
    els.rankingsEmpty.hidden = false;
    return;
  }
  els.rankingsEmpty.hidden = true;

  const placed = [...state.books]
    .filter((b) => b.rating !== INITIAL_RATING)
    .sort((a, b) => b.rating - a.rating);
  const unplaced = [...state.books]
    .filter((b) => b.rating === INITIAL_RATING)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  const ranked = [...placed, ...unplaced];

  for (let i = 0; i < ranked.length; i++) {
    const book = ranked[i];
    const li = document.createElement("li");
    const badge = document.createElement("div");
    badge.className = "rank-badge";
    badge.setAttribute("aria-hidden", "true");

    const meta = document.createElement("div");
    meta.className = "book-meta";
    meta.innerHTML = `<strong></strong><span></span>`;
    meta.querySelector("strong").textContent = book.title;
    meta.querySelector("span").textContent = book.author;

    const score = document.createElement("div");
    score.className = "rank-score";
    if (book.rating === INITIAL_RATING) {
      score.textContent = "—";
      score.title = "Not placed yet";
    } else {
      score.textContent = `#${placed.indexOf(book) + 1}`;
      score.title = "Shelf position";
    }

    li.append(badge, meta, score);
    els.rankingsList.append(li);
  }
}

function renderStats() {
  if (!els.statsSummary || !els.rereadsList || !els.rereadsEmpty) return;

  const totalBooks = state.books.length;
  const totalReads = state.books.reduce((sum, b) => sum + (b.timesRead ?? 1), 0);
  const rereadBooks = state.books.filter((b) => (b.timesRead ?? 1) > 1);
  const rereadCount = rereadBooks.length;
  const extraReads = Math.max(0, totalReads - totalBooks);
  const datedBooks = state.books.filter(
    (b) => Array.isArray(b.finishedAts) && b.finishedAts.length > 0
  ).length;
  const estTotal = estimatedHandfulScreens(totalBooks);
  const progress = sortSession
    ? handfulProgress(sortSession, state.books)
    : { placed: 0, done: totalBooks < 2, handfulsCompleted: 0 };

  els.statsSummary.replaceChildren();
  const stats = [
    { label: "Titles", value: String(totalBooks) },
    { label: "Total reads", value: String(totalReads) },
    { label: "Re-read titles", value: String(rereadCount) },
    { label: "Extra reads", value: String(extraReads) },
    {
      label: "Books placed",
      value:
        totalBooks < 2
          ? "—"
          : progress.done
            ? `${totalBooks}/${totalBooks}`
            : `${progress.placed}/${totalBooks}`,
    },
    {
      label: "Handfuls",
      value:
        totalBooks < 2
          ? "—"
          : `${progress.handfulsCompleted}/${estTotal}`,
    },
  ];
  for (const stat of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";
    const value = document.createElement("div");
    value.className = "stat-value";
    value.textContent = stat.value;
    const label = document.createElement("div");
    label.className = "stat-label";
    label.textContent = stat.label;
    card.append(value, label);
    els.statsSummary.append(card);
  }

  const hint = document.getElementById("stats-monthly-hint");
  if (hint) {
    if (totalBooks > 0 && datedBooks === 0) {
      hint.hidden = false;
      hint.textContent =
        "No read dates yet. Re-import your Google Sheet or CSV that includes a Date Read / Date Finished column — the chart does not use the date you added the book to Shelf Showdown.";
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }

  // Keep the monthly section visible when we need to show the missing-dates hint.
  if (els.statsMonthly) {
    els.statsMonthly.hidden = totalBooks === 0;
  }

  renderMonthlyChart();
  renderRereadsList(rereadBooks);
}

/**
 * @param {{ source: string, total: number, added: number, updated: number, dated: number, datesStored: "convex" | "local" | "none" }} result
 */
function formatImportStatus(result) {
  const { source, total, added, updated, dated, datesStored } = result;
  if (added === 0 && updated === 0 && dated === 0) {
    return source === "sheet"
      ? `Found ${total} book${total === 1 ? "" : "s"} — all already in your library.`
      : "No new books found in that CSV.";
  }

  const parts = [];
  if (added > 0 || updated > 0) {
    parts.push(
      source === "sheet"
        ? `Imported ${added} of ${total} book${total === 1 ? "" : "s"} from the sheet${updated ? ` · updated ${updated}` : ""}`
        : `Imported ${added} book${added === 1 ? "" : "s"}${updated ? ` · updated ${updated}` : ""}`
    );
  } else if (dated > 0) {
    parts.push(
      `Matched ${total} book${total === 1 ? "" : "s"} already in your library`
    );
  }

  if (dated > 0 && datesStored === "convex") {
    parts.push(`read dates saved for ${dated}`);
  } else if (dated > 0 && datesStored === "local") {
    parts.push(
      `read dates saved for Stats (${dated}) — deploy Convex (npx convex deploy) to store them in the cloud`
    );
  } else if (dated === 0 && (added > 0 || updated > 0)) {
    parts.push("no Date Read column found");
  }

  return `${parts.join(" · ")}.`;
}

function renderMonthlyChart() {
  if (!els.monthlyChart || !els.statsMonthly) return;
  els.monthlyChart.replaceChildren();

  if (state.books.length === 0) {
    els.statsMonthly.hidden = true;
    return;
  }

  /** @type {Map<string, number>} */
  const byMonth = new Map();
  let datedReads = 0;
  for (const book of state.books) {
    if (!Array.isArray(book.finishedAts) || book.finishedAts.length === 0) {
      continue;
    }
    for (const ts of book.finishedAts) {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
      datedReads++;
    }
  }

  const rawKeys = [...byMonth.keys()].sort();
  if (rawKeys.length === 0 || datedReads === 0) {
    els.monthlyChart.replaceChildren();
    return;
  }

  const firstKey = rawKeys[0];
  const lastKey = rawKeys[rawKeys.length - 1];
  if (!firstKey || !lastKey) {
    els.monthlyChart.replaceChildren();
    return;
  }

  // Fill every month from first → last so the line shows pacing, not only busy months.
  const keys = fillMonthKeys(firstKey, lastKey);
  const values = keys.map((k) => byMonth.get(k) ?? 0);
  const max = Math.max(...values, 1);
  const monthFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
  });

  const n = keys.length;
  const padL = 28;
  const padR = 12;
  const padT = 18;
  const padB = 36;
  const plotH = 220;
  const step = n <= 1 ? 48 : Math.max(18, Math.min(42, Math.floor(520 / Math.max(n - 1, 1))));
  const plotW = n <= 1 ? 48 : step * (n - 1);
  const width = padL + plotW + padR;
  const height = padT + plotH + padB;

  /** @type {{ x: number, y: number, key: string, count: number, label: string }[]} */
  const points = keys.map((key, i) => {
    const count = values[i] ?? 0;
    const [y, m] = key.split("-").map(Number);
    const label = monthFmt.format(new Date(y, m - 1, 1));
    const x = padL + (n <= 1 ? plotW / 2 : i * step);
    const yPix = padT + plotH - (count / max) * plotH;
    return { x, y: yPix, key, count, label };
  });

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "monthly-line-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
  svg.setAttribute("role", "presentation");

  // Horizontal gridlines
  for (let g = 0; g <= 4; g++) {
    const gy = padT + (plotH * g) / 4;
    const grid = document.createElementNS(svgNS, "line");
    grid.setAttribute("class", "monthly-grid");
    grid.setAttribute("x1", String(padL));
    grid.setAttribute("x2", String(padL + plotW));
    grid.setAttribute("y1", String(gy));
    grid.setAttribute("y2", String(gy));
    svg.append(grid);

    const tickVal = Math.round(max * (1 - g / 4));
    if (g === 0 || g === 4 || tickVal > 0) {
      const tick = document.createElementNS(svgNS, "text");
      tick.setAttribute("class", "monthly-y-label");
      tick.setAttribute("x", String(padL - 6));
      tick.setAttribute("y", String(gy + 3));
      tick.setAttribute("text-anchor", "end");
      tick.textContent = String(tickVal);
      svg.append(tick);
    }
  }

  if (points.length >= 2) {
    const lineD = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const areaD = `${lineD} L${points[points.length - 1].x.toFixed(1)} ${padT + plotH} L${points[0].x.toFixed(1)} ${padT + plotH} Z`;

    const area = document.createElementNS(svgNS, "path");
    area.setAttribute("class", "monthly-area");
    area.setAttribute("d", areaD);
    svg.append(area);

    const line = document.createElementNS(svgNS, "path");
    line.setAttribute("class", "monthly-line");
    line.setAttribute("d", lineD);
    line.setAttribute("fill", "none");
    svg.append(line);
  }

  // Dots + x labels (thin out labels when dense)
  const labelEvery = n > 24 ? Math.ceil(n / 12) : n > 12 ? 2 : 1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("class", "monthly-dot");
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    dot.setAttribute("r", n > 40 ? "2.5" : "3.5");
    dot.setAttribute(
      "aria-label",
      `${p.label}: ${p.count} book${p.count === 1 ? "" : "s"} read`
    );
    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${p.label}: ${p.count} book${p.count === 1 ? "" : "s"} read`;
    dot.append(title);
    svg.append(dot);

    if (i % labelEvery === 0 || i === points.length - 1) {
      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("class", "monthly-x-label");
      label.setAttribute("x", String(p.x));
      label.setAttribute("y", String(padT + plotH + 16));
      label.setAttribute("text-anchor", "end");
      label.setAttribute(
        "transform",
        `rotate(-40 ${p.x} ${padT + plotH + 16})`
      );
      label.textContent = p.label;
      svg.append(label);
    }
  }

  els.monthlyChart.append(svg);
  els.monthlyChart.setAttribute(
    "aria-label",
    `Books read per month, ${datedReads} dated reads across ${rawKeys.length} months`
  );
}

/**
 * Inclusive YYYY-MM range with every month filled.
 * @param {string} startKey
 * @param {string} endKey
 * @returns {string[]}
 */
function fillMonthKeys(startKey, endKey) {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  /** @type {string[]} */
  const keys = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    // Safety cap (~40 years)
    if (keys.length > 500) break;
  }
  return keys;
}

/**
 * @param {Book[]} rereads
 */
function renderRereadsList(rereads) {
  els.rereadsList.replaceChildren();
  const sorted = [...rereads].sort(
    (a, b) => (b.timesRead ?? 1) - (a.timesRead ?? 1)
  );
  if (sorted.length === 0) {
    els.rereadsEmpty.hidden = false;
    return;
  }
  els.rereadsEmpty.hidden = true;
  for (const book of sorted) {
    const li = document.createElement("li");
    const badge = document.createElement("div");
    badge.className = "rank-badge";
    badge.setAttribute("aria-hidden", "true");
    const meta = document.createElement("div");
    meta.className = "book-meta";
    meta.innerHTML = `<strong></strong><span></span>`;
    meta.querySelector("strong").textContent = book.title;
    meta.querySelector("span").textContent = book.author;
    const score = document.createElement("div");
    score.className = "rank-score";
    score.textContent = String(book.timesRead ?? 1);
    score.title = "Times read";
    li.append(badge, meta, score);
    els.rereadsList.append(li);
  }
}

/**
 * @param {string} title
 * @param {string} author
 */
async function addBook(title, author) {
  const trimmedTitle = title.trim();
  const trimmedAuthor = author.trim();
  if (!trimmedTitle || !trimmedAuthor) return;

  const previousCount = state.books.length;
  try {
    busy = true;
    const book = await addBookRemote(trimmedTitle, trimmedAuthor);
    await refreshState();
    sortSession = syncHandfulWithBooks(
      sortSession ?? createHandfulSession(state.books),
      state.books
    );
    saveHandfulSession(sortSession);
    els.libraryStatus.textContent = `Added “${book.title}”.`;
    afterLibraryChange(previousCount);
  } catch (err) {
    els.libraryStatus.textContent =
      err instanceof Error ? err.message : "Could not add that book.";
  } finally {
    busy = false;
  }
}

/**
 * @param {string} id
 */
async function removeBook(id) {
  try {
    busy = true;
    await removeBookRemote(id);
    await refreshState();
    sortSession = syncHandfulWithBooks(
      sortSession ?? createHandfulSession(state.books),
      state.books
    );
    saveHandfulSession(sortSession);
    renderLibrary();
  } catch (err) {
    els.libraryStatus.textContent =
      err instanceof Error ? err.message : "Could not remove that book.";
  } finally {
    busy = false;
  }
}

/**
 * Submit the current handful order.
 */
async function submitCurrentHandful() {
  if (!sortSession || busy || sortSession.handful.length === 0) return;
  busy = true;
  if (els.handfulSubmit) els.handfulSubmit.disabled = true;

  syncHandfulOrderFromDom();
  const previousSession = sortSession;

  try {
    const result = submitHandful(sortSession, sortSession.handful, state.books);
    if (result.ratingUpdates.length > 0) {
      await setRatingsRemote(result.ratingUpdates);
    }
    sortSession = result.session;
    saveHandfulSession(sortSession);
    await refreshState();
    renderCompare();
  } catch (err) {
    sortSession = previousSession;
    saveHandfulSession(sortSession);
    els.compareProgress.textContent =
      err instanceof Error ? err.message : "Could not save that order.";
  } finally {
    busy = false;
    if (els.handfulSubmit) {
      els.handfulSubmit.disabled = !sortSession || sortSession.handful.length === 0;
    }
  }
}

// Events
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    showView(/** @type {ViewName} */ (tab.dataset.view));
  });
});

els.libraryToCompare?.addEventListener("click", () => {
  showView("compare");
});

els.compareToLibrary?.addEventListener("click", () => {
  showView("library");
});

els.compareToRankings?.addEventListener("click", () => {
  showView("rankings");
});

els.resortBtn?.addEventListener("click", () => {
  if (state.books.length < 2) return;
  const ok = window.confirm(
    "Start a fresh sort? Your current shelf order will be rebuilt from scratch."
  );
  if (!ok) return;
  void (async () => {
    try {
      busy = true;
      await setRatingsRemote(resetAllRatings(state.books));
      await refreshState();
      clearHandfulSession();
      sortSession = createFreshHandfulSession(state.books);
      saveHandfulSession(sortSession);
      renderCompare();
    } catch (err) {
      els.compareProgress.textContent =
        err instanceof Error ? err.message : "Could not restart sort.";
    } finally {
      busy = false;
    }
  })();
});

els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void addBook(els.titleInput.value, els.authorInput.value).then(() => {
    els.addForm.reset();
    els.titleInput.focus();
  });
});

els.csvInput.addEventListener("change", async () => {
  const file = els.csvInput.files?.[0];
  if (!file) return;

  const previousCount = state.books.length;
  try {
    busy = true;
    const text = await file.text();
    const rows = parseCsv(text);
    const { added, updated, dated, datesStored } = await importBooksRemote(rows);
    await refreshState();
    sortSession = syncHandfulWithBooks(
      sortSession ?? createHandfulSession(state.books),
      state.books
    );
    saveHandfulSession(sortSession);
    els.libraryStatus.textContent = formatImportStatus({
      source: "CSV",
      total: rows.length,
      added,
      updated,
      dated,
      datesStored,
    });
    afterLibraryChange(previousCount);
  } catch {
    els.libraryStatus.textContent = "Could not read that CSV file.";
  } finally {
    busy = false;
    els.csvInput.value = "";
  }
});

els.sheetsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = els.sheetsUrl.value.trim();
  if (!url) {
    els.libraryStatus.textContent = "Paste a Google Sheets URL to import.";
    return;
  }

  const previousCount = state.books.length;
  els.sheetsBtn.disabled = true;
  els.libraryStatus.textContent = "Loading sheet…";

  try {
    busy = true;
    const { books } = await importBooksFromSheetUrl(url);
    const { added, updated, dated, datesStored } = await importBooksRemote(books);
    await refreshState();
    sortSession = syncHandfulWithBooks(
      sortSession ?? createHandfulSession(state.books),
      state.books
    );
    saveHandfulSession(sortSession);
    els.libraryStatus.textContent = formatImportStatus({
      source: "sheet",
      total: books.length,
      added,
      updated,
      dated,
      datesStored,
    });
    afterLibraryChange(previousCount);
  } catch (err) {
    els.libraryStatus.textContent =
      err instanceof Error ? err.message : "Could not import that sheet.";
  } finally {
    busy = false;
    els.sheetsBtn.disabled = false;
  }
});

els.clearBtn.addEventListener("click", () => {
  if (state.books.length === 0) return;
  const ok = window.confirm("Clear your entire library and comparison history?");
  if (!ok) return;
  void (async () => {
    try {
      busy = true;
      await clearLibraryRemote();
      await refreshState();
      resetSortSession();
      renderLibrary();
      els.libraryStatus.textContent = "Library cleared.";
    } catch (err) {
      els.libraryStatus.textContent =
        err instanceof Error ? err.message : "Could not clear library.";
    } finally {
      busy = false;
    }
  })();
});

els.handfulSubmit?.addEventListener("click", () => {
  void submitCurrentHandful();
});

function isDesktopLayout() {
  return window.matchMedia("(min-width: 640px)").matches;
}

/**
 * Active tab panel, if any.
 * @returns {HTMLElement | null}
 */
function activeViewEl() {
  for (const view of Object.values(els.views)) {
    if (view && !view.hidden) return view;
  }
  return null;
}

/**
 * @returns {ViewName | null}
 */
function activeViewName() {
  for (const [key, view] of Object.entries(els.views)) {
    if (view && !view.hidden) return /** @type {ViewName} */ (key);
  }
  return null;
}

/**
 * Scroll container for the active panel (or null when the view doesn't scroll).
 * @returns {HTMLElement | null}
 */
function activeScrollEl() {
  const view = activeViewEl();
  if (!view) return null;
  const style = window.getComputedStyle(view);
  if (style.overflowY === "auto" || style.overflowY === "scroll") return view;
  return null;
}

/**
 * True for controls that should not start pull-to-refresh.
 * Book rows own vertical drag / horizontal swipe instead.
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function isPullBlockedTarget(target) {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, .handful-item, .handful-list"
    )
  );
}

/**
 * True for controls that should not start Showdown swipe/drag.
 * Rank handles are plain divs (not buttons) so they remain eligible.
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function isGestureBlockedTarget(target) {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest("button, a, input, textarea, select, label")
  );
}

/**
 * @param {number} pullPx
 * @param {boolean} [refreshing]
 */
function updatePullIndicator(pullPx, refreshing = false) {
  const el = els.pullRefresh;
  const label = els.pullRefreshLabel;
  if (!el) return;

  if (pullPx <= 0 && !refreshing) {
    el.hidden = true;
    el.classList.remove("is-visible", "is-refreshing");
    el.style.transform = "translate(-50%, -110%)";
    el.setAttribute("aria-hidden", "true");
    if (label) label.textContent = "Pull to refresh";
    return;
  }

  const clamped = Math.min(PULL_MAX_PX, Math.max(0, pullPx));
  const reveal = refreshing ? PULL_ACTIVATE_PX : clamped;
  el.hidden = false;
  el.classList.add("is-visible");
  el.classList.toggle("is-refreshing", refreshing);
  el.style.transform = `translate(-50%, ${Math.max(0, reveal - 44)}px)`;
  el.setAttribute("aria-hidden", "false");
  if (label) {
    label.textContent = refreshing
      ? "Refreshing…"
      : clamped >= PULL_ACTIVATE_PX
        ? "Release to refresh"
        : "Pull to refresh";
  }
}

function unlockPullScroll() {
  if (!pullGesture?.scrollEl) return;
  const el = pullGesture.scrollEl;
  if (pullGesture.priorOverflowY != null) {
    el.style.overflowY = pullGesture.priorOverflowY;
  }
}

function resetPullGesture() {
  unlockPullScroll();
  pullGesture = null;
  if (!pullRefreshing) updatePullIndicator(0);
}

/** Cancel an in-progress Showdown swipe so pull-to-refresh can take over. */
function cancelPointerGesture() {
  if (!pointerGesture) return;
  detachGestureListeners();
  clearSwipeClass();
  pointerGesture = null;
}

async function runPullRefresh() {
  if (pullRefreshing) return;
  pullRefreshing = true;
  updatePullIndicator(PULL_ACTIVATE_PX, true);

  try {
    if (!els.appShell || els.appShell.hidden) {
      window.location.reload();
      return;
    }
    await refreshState();
    const view = activeViewName();
    if (view) showView(view);
    else enterApp();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not refresh.";
    if (els.libraryStatus && els.views.library && !els.views.library.hidden) {
      els.libraryStatus.textContent = message;
    } else if (els.compareProgress) {
      els.compareProgress.textContent = message;
    }
  } finally {
    pullRefreshing = false;
    updatePullIndicator(0);
  }
}

function detachPullListeners() {
  document.removeEventListener("pointermove", onPullPointerMove);
  document.removeEventListener("pointerup", onPullPointerUp);
  document.removeEventListener("pointercancel", onPullPointerUp);
}

/**
 * @param {PointerEvent} event
 */
function onPullPointerMove(event) {
  if (!pullGesture || event.pointerId !== pullGesture.pointerId) return;

  const dx = event.clientX - pullGesture.startX;
  const dy = event.clientY - pullGesture.startY;

  if (!pullGesture.armed) {
    if (Math.abs(dx) < PULL_INTENT_PX && Math.abs(dy) < PULL_INTENT_PX) {
      /* Hold the scroll container still until we know intent (down = pull). */
      if (dy > 0 && pullGesture.scrollEl && event.cancelable) {
        event.preventDefault();
      }
      return;
    }

    /* Horizontal or upward motion — abandon pull (swipe / scroll can proceed). */
    if (dy <= Math.abs(dx) * GESTURE_ANGLE_RATIO) {
      resetPullGesture();
      detachPullListeners();
      return;
    }

    if (pullGesture.scrollEl && pullGesture.scrollEl.scrollTop > 0) {
      resetPullGesture();
      detachPullListeners();
      return;
    }

    /* Lock scroll so the list can't steal the gesture before we arm. */
    if (pullGesture.scrollEl && pullGesture.priorOverflowY == null) {
      pullGesture.priorOverflowY = pullGesture.scrollEl.style.overflowY;
      pullGesture.scrollEl.style.overflowY = "hidden";
    }

    /* Vertical pull wins over pending Showdown swipe tracking. */
    cancelPointerGesture();
    pullGesture.armed = true;
  }

  if (pullGesture.scrollEl && pullGesture.scrollEl.scrollTop > 0) {
    resetPullGesture();
    detachPullListeners();
    return;
  }

  const raw = Math.max(0, dy);
  const resisted = Math.min(PULL_MAX_PX, raw * 0.55);
  pullGesture.pullPx = resisted;

  if (event.cancelable) event.preventDefault();
  updatePullIndicator(resisted);
}

/**
 * @param {PointerEvent} event
 */
function onPullPointerUp(event) {
  if (!pullGesture || event.pointerId !== pullGesture.pointerId) return;
  const shouldRefresh = pullGesture.armed && pullGesture.pullPx >= PULL_ACTIVATE_PX;
  unlockPullScroll();
  detachPullListeners();
  pullGesture = null;

  if (shouldRefresh) {
    void runPullRefresh();
    return;
  }
  updatePullIndicator(0);
}

els.appRoot?.addEventListener(
  "pointerdown",
  (event) => {
    if (isDesktopLayout() || pullRefreshing || busy || drag) return;
    if (event.pointerType === "mouse") return;
    if (event.button != null && event.button !== 0) return;
    if (isPullBlockedTarget(event.target)) return;

    const scrollEl = activeScrollEl();
    if (scrollEl && scrollEl.scrollTop > 0) return;

    pullGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pullPx: 0,
      armed: false,
      scrollEl,
      priorOverflowY: null,
    };

    document.addEventListener("pointermove", onPullPointerMove, { passive: false });
    document.addEventListener("pointerup", onPullPointerUp);
    document.addEventListener("pointercancel", onPullPointerUp);
  },
  true
);

function canSkipBook() {
  return Boolean(
    !busy &&
      sortSession &&
      state.books.length >= 2 &&
      sortSession.phase === "group" &&
      sortSession.handful.length > 0
  );
}

function canUndoHandful() {
  return Boolean(!busy && sortSession && sortSession.undoStack.length > 0);
}

/** @returns {boolean} */
function skipCurrentBook() {
  if (!canSkipBook() || !sortSession) return false;
  const target = sortSession.handful[sortSession.handful.length - 1];
  if (!target) return false;
  const before = sortSession.handful.join("|");
  sortSession = skipHandfulBook(sortSession, target);
  const after = sortSession.handful.join("|");
  if (before === after) return false;
  saveHandfulSession(sortSession);
  renderCompare();
  return true;
}

/** @returns {Promise<boolean>} */
async function undoLastHandful() {
  if (!canUndoHandful() || !sortSession) return false;
  try {
    busy = true;
    const undone = undoHandful(sortSession);
    if (!undone) return false;
    if (undone.priorRatings.length > 0) {
      await setRatingsRemote(undone.priorRatings);
    }
    sortSession = undone.session;
    saveHandfulSession(sortSession);
    await refreshState();
    renderCompare();
    return true;
  } catch (err) {
    els.compareProgress.textContent =
      err instanceof Error ? err.message : "Could not undo.";
    return false;
  } finally {
    busy = false;
  }
}

/**
 * @param {"left" | "right"} direction
 * @param {string} [label]
 */
function showSwipeToast(direction, label) {
  const toast = els.swipeToast;
  if (!toast || isDesktopLayout()) return;
  window.clearTimeout(swipeToastTimer);
  const isLeft = direction === "left";
  toast.hidden = false;
  toast.textContent = label ?? (isLeft ? "Undo" : "Skip");
  toast.classList.toggle("is-undo", isLeft);
  toast.classList.toggle("is-skip", !isLeft);
  toast.classList.remove("is-visible");
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  swipeToastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    swipeToastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 220);
  }, 850);
}

function clearSwipeClass() {
  els.compareActive?.classList.remove("is-swiping-left", "is-swiping-right");
}

/**
 * @param {number} dx
 * @param {number} dy
 */
function updateSwipeClass(dx, dy) {
  clearSwipeClass();
  if (Math.abs(dx) < GESTURE_INTENT_PX || Math.abs(dx) < Math.abs(dy) * GESTURE_ANGLE_RATIO) {
    return;
  }
  if (dx < 0) {
    if (!canUndoHandful()) return;
    els.compareActive?.classList.add("is-swiping-left");
    return;
  }
  if (!canSkipBook()) return;
  els.compareActive?.classList.add("is-swiping-right");
}

els.skipBtn.addEventListener("click", () => {
  skipCurrentBook();
});

els.undoBtn.addEventListener("click", () => {
  void undoLastHandful();
});

/* —— Drag reorder for the current handful —— */
function movePlaceholderTo(clientY) {
  if (!drag || !els.handfulList) return;
  const slots = [...els.handfulList.children].filter(
    (el) => el !== drag.item && el !== drag.placeholder
  );
  let insertAt = slots.length;
  for (let i = 0; i < slots.length; i++) {
    const rect = slots[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertAt = i;
      break;
    }
  }
  const reference = slots[insertAt] ?? null;
  if (reference) els.handfulList.insertBefore(drag.placeholder, reference);
  else els.handfulList.append(drag.placeholder);
}

function onHandfulPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId || !els.handfulList) return;
  if (event.cancelable) event.preventDefault();
  const listRect = els.handfulList.getBoundingClientRect();
  const y = event.clientY - listRect.top - drag.grabOffsetY;
  const maxY = Math.max(0, listRect.height - drag.height);
  drag.item.style.top = `${Math.max(0, Math.min(maxY, y))}px`;
  movePlaceholderTo(event.clientY);
  updateHandfulRanks();
}

function endHandfulDrag(event) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  if (!els.handfulList) return;

  const { item, placeholder, pointerId } = drag;
  els.handfulList.insertBefore(item, placeholder);
  placeholder.remove();
  item.classList.remove("is-dragging");
  item.style.top = "";
  item.style.left = "";
  item.style.width = "";
  item.style.height = "";
  try {
    item.releasePointerCapture(pointerId);
  } catch {
    /* already released */
  }

  document.removeEventListener("pointermove", onHandfulPointerMove);
  document.removeEventListener("pointerup", endHandfulDrag);
  document.removeEventListener("pointercancel", endHandfulDrag);

  els.handfulList.classList.remove("is-reordering");
  drag = null;
  syncHandfulOrderFromDom();
}

/**
 * @param {PointerEvent} event
 * @param {HTMLElement} item
 * @param {number} [grabClientY]
 */
function startHandfulDrag(event, item, grabClientY = event.clientY) {
  if (!els.handfulList || busy) return;
  if (event.button != null && event.button !== 0) return;
  if (event.cancelable) event.preventDefault();

  const rect = item.getBoundingClientRect();
  const listRect = els.handfulList.getBoundingClientRect();
  const placeholder = document.createElement("li");
  placeholder.className = "handful-placeholder";
  placeholder.style.height = `${rect.height}px`;
  placeholder.setAttribute("aria-hidden", "true");
  els.handfulList.insertBefore(placeholder, item.nextSibling);

  drag = {
    item,
    placeholder,
    pointerId: event.pointerId,
    grabOffsetY: grabClientY - rect.top,
    height: rect.height,
  };

  item.style.width = `${rect.width}px`;
  item.style.height = `${rect.height}px`;
  item.style.left = `${rect.left - listRect.left}px`;
  item.style.top = `${rect.top - listRect.top}px`;
  item.classList.add("is-dragging");
  els.handfulList.classList.add("is-reordering");
  try {
    item.setPointerCapture(event.pointerId);
  } catch {
    /* Pointer may already be released (or synthetic); document listeners still work. */
  }

  document.addEventListener("pointermove", onHandfulPointerMove, { passive: false });
  document.addEventListener("pointerup", endHandfulDrag);
  document.addEventListener("pointercancel", endHandfulDrag);
}

function detachGestureListeners() {
  document.removeEventListener("pointermove", onGesturePointerMove);
  document.removeEventListener("pointerup", onGesturePointerUp);
  document.removeEventListener("pointercancel", onGesturePointerUp);
}

function onGesturePointerMove(event) {
  if (!pointerGesture || event.pointerId !== pointerGesture.pointerId) return;
  pointerGesture.lastX = event.clientX;
  pointerGesture.lastY = event.clientY;
  const dx = pointerGesture.lastX - pointerGesture.startX;
  const dy = pointerGesture.lastY - pointerGesture.startY;

  if (pointerGesture.mode === "pending") {
    if (Math.abs(dx) < GESTURE_INTENT_PX && Math.abs(dy) < GESTURE_INTENT_PX) {
      return;
    }

    if (Math.abs(dx) > Math.abs(dy) * GESTURE_ANGLE_RATIO) {
      /* Horizontal swipe wins — drop any pending pull tracking. */
      resetPullGesture();
      detachPullListeners();
      pointerGesture.mode = "swipe";
      try {
        els.compareActive?.setPointerCapture(event.pointerId);
      } catch {
        /* ignore — document listeners still receive moves */
      }
      if (event.cancelable) event.preventDefault();
      updateSwipeClass(dx, dy);
      return;
    }

    if (pointerGesture.item) {
      const item = pointerGesture.item;
      const grabY = pointerGesture.startY;
      resetPullGesture();
      detachPullListeners();
      detachGestureListeners();
      pointerGesture = null;
      clearSwipeClass();
      startHandfulDrag(event, item, grabY);
      return;
    }

    pointerGesture.mode = "ignore";
    clearSwipeClass();
    return;
  }

  if (pointerGesture.mode === "swipe") {
    if (event.cancelable) event.preventDefault();
    updateSwipeClass(dx, dy);
  }
}

function onGesturePointerUp(event) {
  if (!pointerGesture || event.pointerId !== pointerGesture.pointerId) return;
  const gesture = pointerGesture;
  const upDx = Math.abs(event.clientX - gesture.startX);
  const lastDx = Math.abs(gesture.lastX - gesture.startX);
  if (upDx >= lastDx) {
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  }
  const dx = gesture.lastX - gesture.startX;
  const dy = gesture.lastY - gesture.startY;
  const mode = gesture.mode;

  try {
    els.compareActive?.releasePointerCapture?.(event.pointerId);
  } catch {
    /* capture may already be released */
  }
  detachGestureListeners();
  pointerGesture = null;
  clearSwipeClass();

  if (mode !== "swipe") return;
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * GESTURE_ANGLE_RATIO) {
    return;
  }

  if (dx < 0) {
    if (!canUndoHandful()) {
      showSwipeToast("left", "Nothing to undo");
      return;
    }
    void (async () => {
      const ok = await undoLastHandful();
      showSwipeToast("left", ok ? "Undo" : "Couldn't undo");
    })();
    return;
  }

  if (!canSkipBook()) {
    showSwipeToast("right", "Can't skip");
    return;
  }
  showSwipeToast("right", skipCurrentBook() ? "Skip" : "Can't skip");
}

els.compareActive?.addEventListener("pointerdown", (event) => {
  if (!els.compareActive || els.compareActive.hidden || busy || drag) return;
  if (event.button != null && event.button !== 0) return;
  if (isGestureBlockedTarget(event.target)) return;

  const itemEl = event.target.closest(".handful-item");
  const item =
    itemEl instanceof HTMLElement && els.handfulList?.contains(itemEl)
      ? itemEl
      : null;

  /* Desktop: buttons for Skip/Undo; list drag stays immediate. */
  if (isDesktopLayout()) {
    if (item) startHandfulDrag(event, item);
    return;
  }

  pointerGesture = {
    mode: "pending",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    item,
  };

  document.addEventListener("pointermove", onGesturePointerMove, { passive: false });
  document.addEventListener("pointerup", onGesturePointerUp);
  document.addEventListener("pointercancel", onGesturePointerUp);
});

/**
 * @param {import("./modules/auth.js").AuthUser | null} user
 */
function showSignedIn(user) {
  els.authPanel.hidden = true;
  els.appShell.hidden = false;
  els.accountBar.hidden = false;
  els.accountEmail.textContent = user?.email || user?.name || "Signed in";
}

function showSignedOut() {
  els.authPanel.hidden = false;
  els.appShell.hidden = true;
  els.accountBar.hidden = true;
  els.accountEmail.textContent = "";
  setAuthMode("signIn");
  state = { books: [], comparisons: [] };
  sortSession = null;
  clearHandfulSession();
}

/**
 * @param {"signIn" | "signUp"} mode
 */
function setAuthMode(mode) {
  const isSignUp = mode === "signUp";
  els.authPanel.dataset.authMode = mode;
  els.authTitle.textContent = isSignUp ? "Create account" : "Sign in";
  els.authLede.textContent = isSignUp
    ? "You’ll need an account to save your library and rankings across devices."
    : "Welcome back. Sign in to pick up your library and rankings.";
  els.authSubmitBtn.textContent = isSignUp ? "Create account" : "Sign in";
  els.authSwitchPrompt.textContent = isSignUp
    ? "Already have an account?"
    : "New here?";
  els.authSwitchBtn.textContent = isSignUp ? "Sign in" : "Create account";
  els.authPassword.autocomplete = isSignUp ? "new-password" : "current-password";
  els.authPassword.placeholder = isSignUp
    ? "At least 8 characters"
    : "Your password";
  els.authStatus.textContent = "";
}

/**
 * @param {"signIn" | "signUp"} flow
 */
async function handleAuth(flow) {
  const email = els.authEmail.value;
  const password = els.authPassword.value;
  els.authStatus.textContent =
    flow === "signUp" ? "Creating account…" : "Signing in…";
  els.authSubmitBtn.disabled = true;
  els.authSwitchBtn.disabled = true;
  try {
    const user = await passwordAuth(flow, email, password);
    showSignedIn(user);
    els.libraryStatus.textContent = "Loading your library…";
    await refreshState();
    enterApp();
    els.authStatus.textContent = "";
    els.authForm.reset();
    setAuthMode("signIn");
  } catch (err) {
    els.authStatus.textContent =
      err instanceof Error ? err.message : "Authentication failed.";
  } finally {
    els.authSubmitBtn.disabled = false;
    els.authSwitchBtn.disabled = false;
  }
}

els.authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const mode =
    els.authPanel.dataset.authMode === "signUp" ? "signUp" : "signIn";
  void handleAuth(mode);
});

els.authSwitchBtn.addEventListener("click", () => {
  const nextMode =
    els.authPanel.dataset.authMode === "signUp" ? "signIn" : "signUp";
  setAuthMode(nextMode);
});

els.signOutBtn.addEventListener("click", () => {
  void (async () => {
    await signOut();
    showSignedOut();
    els.authStatus.textContent = "Signed out.";
  })();
});

async function boot() {
  if (!isSignedInLocally()) {
    showSignedOut();
    return;
  }

  els.authStatus.textContent = "Checking session…";
  try {
    const user = await getCurrentUser();
    if (!user) {
      await signOut();
      showSignedOut();
      els.authStatus.textContent = "Please create an account or sign in.";
      return;
    }
    showSignedIn(user);
    els.libraryStatus.textContent = "Loading your library…";
    await refreshState();
    enterApp();
  } catch (err) {
    await signOut();
    showSignedOut();
    els.authStatus.textContent =
      err instanceof Error
        ? `Could not restore session: ${err.message}`
        : "Could not restore session.";
  }
}

void boot();
