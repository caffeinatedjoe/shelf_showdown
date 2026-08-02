import {
  addBookRemote,
  clearLibraryRemote,
  importBooksRemote,
  INITIAL_RATING,
  loadState,
  recordComparisonRemote,
  removeBookRemote,
  setRatingsRemote,
  undoLastComparisonRemote,
} from "./modules/storage.js";
import {
  applyInsertionPick,
  clearSortSession,
  createSortSession,
  estimatedSortComparisons,
  loadSortSession,
  parseCsv,
  pickPairFromSession,
  ratingUpdatesForPlacement,
  saveSortSession,
  seedRatingUpdate,
  skipCandidate,
  sortProgress,
  syncSessionWithBooks,
  undoInsertionStep,
  withPlacementPriorRatings,
  createFreshSortSession,
} from "./modules/comparisons.js";
import { importBooksFromSheetUrl } from "./modules/sheets.js";
import {
  getCurrentUser,
  isSignedInLocally,
  passwordAuth,
  signOut,
} from "./modules/auth.js";

/** @typedef {import("./modules/storage.js").AppState} AppState */
/** @typedef {import("./modules/storage.js").Book} Book */
/** @typedef {import("./modules/comparisons.js").SortSession} SortSession */
/** @typedef {"compare" | "rankings" | "stats" | "library"} ViewName */

/** @type {AppState} */
let state = { books: [], comparisons: [] };

/** @type {SortSession | null} */
let sortSession = null;

/** @type {[Book, Book] | null} */
let currentPair = null;

/** @type {boolean} */
let busy = false;

/** @type {boolean} */
let seedRatingApplied = false;

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
  choiceA: document.getElementById("choice-a"),
  choiceB: document.getElementById("choice-b"),
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
    sortSession = loadSortSession(state.books);
  } else {
    sortSession = syncSessionWithBooks(sortSession, state.books);
  }
  saveSortSession(sortSession);
}

function resetSortSession() {
  clearSortSession();
  sortSession = createSortSession(state.books);
  seedRatingApplied = false;
  saveSortSession(sortSession);
  currentPair = null;
}

/**
 * Ensure the seed book has a midpoint rating so later insertions have room.
 */
async function ensureSeedRating() {
  if (!sortSession || seedRatingApplied) return;
  if (sortSession.rankedIds.length !== 1) {
    seedRatingApplied = true;
    return;
  }
  if (state.comparisons.length > 0) {
    seedRatingApplied = true;
    return;
  }
  const seedId = sortSession.rankedIds[0];
  const seed = state.books.find((b) => b.id === seedId);
  if (!seed || seed.comparisons > 0) {
    seedRatingApplied = true;
    return;
  }
  if (seed.rating !== INITIAL_RATING) {
    seedRatingApplied = true;
    return;
  }
  try {
    await setRatingsRemote(seedRatingUpdate(seedId));
    await refreshState();
  } catch {
    // Non-fatal; midpoint insertion can still rebalance later
  } finally {
    seedRatingApplied = true;
  }
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
  if (name === "compare") void renderCompare();
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
    ? sortProgress(sortSession, state.books)
    : { placed: 0, total: books.length, done: false };
  els.libraryStatus.textContent =
    books.length === 0
      ? "No books yet — add a few or import a sheet to start sorting."
      : books.length === 1
        ? "1 book · add one more to start sorting."
        : progress.done
          ? `${books.length} books · shelf sorted`
          : `${books.length} books · ${progress.placed} placed · ~${estimatedSortComparisons(books.length)} picks to finish`;
}

async function renderCompare() {
  if (state.books.length < 2) {
    els.compareEmpty.hidden = false;
    els.compareActive.hidden = true;
    if (els.compareDone) els.compareDone.hidden = true;
    currentPair = null;
    return;
  }

  ensureSortSession();
  await ensureSeedRating();

  const progress = sortProgress(sortSession, state.books);

  if (progress.done) {
    els.compareEmpty.hidden = true;
    els.compareActive.hidden = true;
    if (els.compareDone) els.compareDone.hidden = false;
    currentPair = null;
    return;
  }

  if (els.compareDone) els.compareDone.hidden = true;
  els.compareEmpty.hidden = true;
  els.compareActive.hidden = false;

  currentPair = pickPairFromSession(sortSession, state.books);

  if (!currentPair) {
    els.compareProgress.textContent = "Placing book…";
    return;
  }

  const [a, b] = currentPair;
  fillChoice(els.choiceA, a);
  fillChoice(els.choiceB, b);

  const estTotal = estimatedSortComparisons(state.books.length);
  const picksDone = state.comparisons.length;
  const candidateLabel = progress.candidateTitle
    ? `Placing “${progress.candidateTitle}”`
    : "Placing next book";
  els.compareProgress.textContent = `${candidateLabel} · ${progress.placed} of ${progress.total} on the shelf · ~${progress.picksLeftApprox} pick${progress.picksLeftApprox === 1 ? "" : "s"} left for this book · ${picksDone}/${estTotal} total`;
  els.undoBtn.disabled =
    busy ||
    (state.comparisons.length === 0 &&
      !(sortSession?.boundStack.length || sortSession?.lastPlacement));
}

/**
 * @param {HTMLElement} el
 * @param {Book} book
 */
function fillChoice(el, book) {
  el.replaceChildren();
  const title = document.createElement("span");
  title.className = "choice-title";
  title.textContent = book.title;
  const author = document.createElement("span");
  author.className = "choice-author";
  author.textContent = book.author;
  el.append(title, author);
  el.dataset.bookId = book.id;
  el.setAttribute("aria-label", `Prefer ${book.title} by ${book.author}`);
}

function renderRankings() {
  els.rankingsList.replaceChildren();
  if (state.books.length === 0) {
    els.rankingsEmpty.hidden = false;
    return;
  }
  els.rankingsEmpty.hidden = true;

  const ranked = [...state.books].sort((a, b) => b.rating - a.rating);
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
    score.textContent = `#${i + 1}`;
    score.title = "Shelf position";

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
  const estTotal = estimatedSortComparisons(totalBooks);
  const progress = sortSession
    ? sortProgress(sortSession, state.books)
    : { placed: 0, done: totalBooks < 2 };

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
      label: "Sort picks",
      value: totalBooks < 2 ? "—" : `${state.comparisons.length}/${estTotal}`,
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
    sortSession = syncSessionWithBooks(
      sortSession ?? createSortSession(state.books),
      state.books
    );
    saveSortSession(sortSession);
    currentPair = null;
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
    sortSession = syncSessionWithBooks(
      sortSession ?? createSortSession(state.books),
      state.books
    );
    saveSortSession(sortSession);
    currentPair = null;
    renderLibrary();
  } catch (err) {
    els.libraryStatus.textContent =
      err instanceof Error ? err.message : "Could not remove that book.";
  } finally {
    busy = false;
  }
}

/**
 * @param {string} winnerId
 */
async function chooseWinner(winnerId) {
  if (!currentPair || !sortSession || busy) return;
  const loserId =
    currentPair[0].id === winnerId ? currentPair[1].id : currentPair[0].id;
  if (loserId === winnerId) return;

  const btn =
    els.choiceA.dataset.bookId === winnerId ? els.choiceA : els.choiceB;
  btn.classList.add("picked");
  busy = true;

  const previousSession = sortSession;

  try {
    const result = applyInsertionPick(sortSession, winnerId, state.books);
    if (!result.placed && result.session === sortSession) {
      throw new Error("Could not apply that pick — try again.");
    }

    /** @type {{ bookId: string, rating: number }[] | undefined} */
    let updates;
    /** @type {SortSession} */
    let nextSession = result.session;

    if (result.placed && result.placedId) {
      const rankedIds = [
        ...result.rankedIdsBefore.slice(0, result.placementIndex),
        result.placedId,
        ...result.rankedIdsBefore.slice(result.placementIndex),
      ];
      updates = ratingUpdatesForPlacement(
        rankedIds,
        state.books,
        result.placedId
      );
      const priorRatings = updates.map((u) => {
        const book = state.books.find((b) => b.id === u.bookId);
        return { bookId: u.bookId, rating: book?.rating ?? INITIAL_RATING };
      });
      nextSession = withPlacementPriorRatings(result.session, priorRatings);
    }

    // One mutation: log the pick and assign placement ratings atomically
    await recordComparisonRemote(winnerId, loserId, updates);

    sortSession = nextSession;
    saveSortSession(sortSession);
    await refreshState();

    window.setTimeout(() => {
      btn.classList.remove("picked");
      currentPair = null;
      busy = false;
      void renderCompare();
    }, 160);
  } catch (err) {
    sortSession = previousSession;
    saveSortSession(sortSession);
    btn.classList.remove("picked");
    busy = false;
    els.compareProgress.textContent =
      err instanceof Error ? err.message : "Could not save that pick.";
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
    "Start a fresh sort? Your current shelf order will be rebuilt from scratch (comparison history stays for stats)."
  );
  if (!ok) return;
  void (async () => {
    try {
      busy = true;
      sortSession = createFreshSortSession(state.books);
      seedRatingApplied = false;
      saveSortSession(sortSession);
      currentPair = null;
      const seedId = sortSession.rankedIds[0];
      if (seedId) {
        await setRatingsRemote(seedRatingUpdate(seedId));
        seedRatingApplied = true;
        await refreshState();
      }
      void renderCompare();
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
    sortSession = syncSessionWithBooks(
      sortSession ?? createSortSession(state.books),
      state.books
    );
    saveSortSession(sortSession);
    currentPair = null;
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
    sortSession = syncSessionWithBooks(
      sortSession ?? createSortSession(state.books),
      state.books
    );
    saveSortSession(sortSession);
    currentPair = null;
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

els.choiceA.addEventListener("click", () => {
  if (els.choiceA.dataset.bookId) void chooseWinner(els.choiceA.dataset.bookId);
});

els.choiceB.addEventListener("click", () => {
  if (els.choiceB.dataset.bookId) void chooseWinner(els.choiceB.dataset.bookId);
});

els.skipBtn.addEventListener("click", () => {
  if (!sortSession || state.books.length < 2) return;
  sortSession = skipCandidate(sortSession, state.books);
  saveSortSession(sortSession);
  currentPair = null;
  void renderCompare();
});

els.undoBtn.addEventListener("click", () => {
  void (async () => {
    if (!sortSession || busy) return;
    try {
      busy = true;
      const undone = undoInsertionStep(sortSession);
      if (!undone) {
        if (state.comparisons.length === 0) return;
        await undoLastComparisonRemote();
        await refreshState();
        currentPair = null;
        void renderCompare();
        return;
      }

      const prior =
        undone.kind === "placement"
          ? (sortSession.lastPlacement?.priorRatings ?? [])
          : [];
      await undoLastComparisonRemote();
      if (prior.length > 0) {
        await setRatingsRemote(prior);
      }
      sortSession = undone.session;
      saveSortSession(sortSession);
      await refreshState();

      currentPair = null;
      void renderCompare();
    } catch (err) {
      els.compareProgress.textContent =
        err instanceof Error ? err.message : "Could not undo.";
    } finally {
      busy = false;
    }
  })();
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
  currentPair = null;
  clearSortSession();
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
