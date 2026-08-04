import {
  addBookRemote,
  clearLibraryRemote,
  importBooksRemote,
  INITIAL_RATING,
  loadState,
  removeBookRemote,
  setRatingsRemote,
} from "./modules/storage.js";
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
} from "./modules/handful.js";
import { parseCsv } from "./modules/tabular.js";
import { importBooksFromSheetUrl } from "./modules/sheets.js";
import {
  getCurrentUser,
  isSignedInLocally,
  passwordAuth,
  signOut,
} from "./modules/auth.js";

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
  authSignInBtn: /** @type {HTMLButtonElement} */ (document.getElementById("auth-sign-in-btn")),
  authSignUpBtn: /** @type {HTMLButtonElement} */ (document.getElementById("auth-sign-up-btn")),
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
  compareProgress: document.getElementById("compare-progress"),
  rankingsList: document.getElementById("rankings-list"),
  rankingsEmpty: document.getElementById("rankings-empty"),
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

    li.append(meta, remove);
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
    return;
  }

  ensureSortSession();
  const progress = handfulProgress(sortSession, state.books);

  if (progress.done) {
    els.compareEmpty.hidden = true;
    els.compareActive.hidden = true;
    if (els.compareDone) els.compareDone.hidden = false;
    return;
  }

  if (els.compareDone) els.compareDone.hidden = true;
  els.compareEmpty.hidden = true;
  els.compareActive.hidden = false;

  if (els.handfulPromptSub) {
    els.handfulPromptSub.textContent =
      sortSession.phase === "merge"
        ? "Merge step — drag the best remaining titles to the top, then submit."
        : "Drag to rearrange, then submit this handful.";
  }

  renderHandfulList();

  const estTotal = estimatedHandfulScreens(state.books.length);
  const phaseLabel =
    sortSession.phase === "merge" ? "Merging runs" : "Grouping";
  els.compareProgress.textContent = `${phaseLabel} · ${progress.placed} of ${progress.total} on the shelf · handful ${progress.handfulsCompleted + 1} · ~${estTotal} screens total`;
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

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "handful-handle";
    handle.setAttribute("aria-label", `Drag to reorder ${book.title}`);
    const rank = document.createElement("span");
    rank.className = "handful-rank";
    rank.textContent = String(index + 1);
    const grip = document.createElement("span");
    grip.className = "handful-grip";
    grip.setAttribute("aria-hidden", "true");
    grip.innerHTML = "<span></span><span></span><span></span>";
    handle.append(rank, grip);

    const meta = document.createElement("div");
    meta.className = "book-meta";
    const title = document.createElement("strong");
    title.textContent = book.title;
    const author = document.createElement("span");
    author.textContent = book.author;
    meta.append(title, author);

    li.append(handle, meta);
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

  renderMonthlyChart();
  renderRereadsList(rereadBooks);
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
  for (const book of state.books) {
    const d = new Date(book.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  const keys = [...byMonth.keys()].sort();
  if (keys.length === 0) {
    els.statsMonthly.hidden = true;
    return;
  }

  els.statsMonthly.hidden = false;
  const max = Math.max(...keys.map((k) => byMonth.get(k) ?? 0), 1);
  const monthFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
  });

  for (const key of keys) {
    const count = byMonth.get(key) ?? 0;
    const [y, m] = key.split("-").map(Number);
    const label = monthFmt.format(new Date(y, m - 1, 1));

    const li = document.createElement("li");
    li.className = "monthly-bar";

    const bar = document.createElement("div");
    bar.className = "monthly-bar-fill";
    bar.style.height = `${Math.max(8, Math.round((count / max) * 100))}%`;
    bar.title = `${count} book${count === 1 ? "" : "s"}`;

    const countEl = document.createElement("span");
    countEl.className = "monthly-count";
    countEl.textContent = String(count);

    const labelEl = document.createElement("span");
    labelEl.className = "monthly-label";
    labelEl.textContent = label;

    li.append(countEl, bar, labelEl);
    els.monthlyChart.append(li);
  }
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
    const { added, updated } = await importBooksRemote(rows);
    await refreshState();
    sortSession = syncHandfulWithBooks(
      sortSession ?? createHandfulSession(state.books),
      state.books
    );
    saveHandfulSession(sortSession);
    els.libraryStatus.textContent =
      added === 0 && updated === 0
        ? "No new books found in that CSV."
        : `Imported ${added} book${added === 1 ? "" : "s"}${updated ? ` · updated ${updated}` : ""}.`;
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
    const { added, updated } = await importBooksRemote(books);
    await refreshState();
    sortSession = syncHandfulWithBooks(
      sortSession ?? createHandfulSession(state.books),
      state.books
    );
    saveHandfulSession(sortSession);
    els.libraryStatus.textContent =
      added === 0 && updated === 0
        ? `Found ${books.length} book${books.length === 1 ? "" : "s"} — all already in your library.`
        : `Imported ${added} of ${books.length} book${books.length === 1 ? "" : "s"} from the sheet${updated ? ` · updated ${updated}` : ""}.`;
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

els.skipBtn.addEventListener("click", () => {
  if (!sortSession || state.books.length < 2 || busy) return;
  const first = sortSession.handful[sortSession.handful.length - 1];
  if (!first) return;
  sortSession = skipHandfulBook(sortSession, first);
  saveHandfulSession(sortSession);
  renderCompare();
});

els.undoBtn.addEventListener("click", () => {
  void (async () => {
    if (!sortSession || busy) return;
    try {
      busy = true;
      const undone = undoHandful(sortSession);
      if (!undone) return;
      if (undone.priorRatings.length > 0) {
        await setRatingsRemote(undone.priorRatings);
      }
      sortSession = undone.session;
      saveHandfulSession(sortSession);
      await refreshState();
      renderCompare();
    } catch (err) {
      els.compareProgress.textContent =
        err instanceof Error ? err.message : "Could not undo.";
    } finally {
      busy = false;
    }
  })();
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
  item.releasePointerCapture?.(pointerId);

  document.removeEventListener("pointermove", onHandfulPointerMove);
  document.removeEventListener("pointerup", endHandfulDrag);
  document.removeEventListener("pointercancel", endHandfulDrag);

  els.handfulList.classList.remove("is-reordering");
  drag = null;
  syncHandfulOrderFromDom();
}

function startHandfulDrag(event, item) {
  if (!els.handfulList || busy) return;
  if (event.button != null && event.button !== 0) return;
  event.preventDefault();

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
    grabOffsetY: event.clientY - rect.top,
    height: rect.height,
  };

  item.style.width = `${rect.width}px`;
  item.style.height = `${rect.height}px`;
  item.style.left = `${rect.left - listRect.left}px`;
  item.style.top = `${rect.top - listRect.top}px`;
  item.classList.add("is-dragging");
  els.handfulList.classList.add("is-reordering");
  item.setPointerCapture?.(event.pointerId);

  document.addEventListener("pointermove", onHandfulPointerMove);
  document.addEventListener("pointerup", endHandfulDrag);
  document.addEventListener("pointercancel", endHandfulDrag);
}

els.handfulList?.addEventListener("pointerdown", (event) => {
  const item = event.target.closest(".handful-item");
  if (!item || !els.handfulList.contains(item)) return;
  startHandfulDrag(event, item);
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
  state = { books: [], comparisons: [] };
  sortSession = null;
  clearHandfulSession();
}

/**
 * @param {"signIn" | "signUp"} flow
 */
async function handleAuth(flow) {
  const email = els.authEmail.value;
  const password = els.authPassword.value;
  els.authStatus.textContent =
    flow === "signUp" ? "Creating account…" : "Signing in…";
  els.authSignInBtn.disabled = true;
  els.authSignUpBtn.disabled = true;
  try {
    const user = await passwordAuth(flow, email, password);
    showSignedIn(user);
    els.libraryStatus.textContent = "Loading your library…";
    await refreshState();
    enterApp();
    els.authStatus.textContent = "";
    els.authForm.reset();
  } catch (err) {
    els.authStatus.textContent =
      err instanceof Error ? err.message : "Authentication failed.";
  } finally {
    els.authSignInBtn.disabled = false;
    els.authSignUpBtn.disabled = false;
  }
}

els.authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void handleAuth("signUp");
});

els.authSignInBtn.addEventListener("click", () => {
  void handleAuth("signIn");
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
