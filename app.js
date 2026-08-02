import {
  addBookRemote,
  clearLibraryRemote,
  importBooksRemote,
  loadState,
  recordComparisonRemote,
  removeBookRemote,
  undoLastComparisonRemote,
} from "./modules/storage.js";
import { parseCsv, pickPair } from "./modules/comparisons.js";
import { importBooksFromSheetUrl } from "./modules/sheets.js";
import {
  getCurrentUser,
  isSignedInLocally,
  passwordAuth,
  signOut,
} from "./modules/auth.js";

/** @typedef {import("./modules/storage.js").AppState} AppState */
/** @typedef {import("./modules/storage.js").Book} Book */

/** @type {AppState} */
let state = { books: [], comparisons: [] };

/** @type {[Book, Book] | null} */
let currentPair = null;

/** @type {boolean} */
let busy = false;

const els = {
  tabs: document.querySelectorAll(".tab"),
  views: {
    library: document.getElementById("view-library"),
    compare: document.getElementById("view-compare"),
    rankings: document.getElementById("view-rankings"),
    rereads: document.getElementById("view-rereads"),
  },
  rereadsList: document.getElementById("rereads-list"),
  rereadsEmpty: document.getElementById("rereads-empty"),
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
}

/**
 * @param {"library" | "compare" | "rankings" | "rereads"} name
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
  if (name === "library") renderLibrary();
  if (name === "rereads") renderRereads();
}

function renderLibrary() {
  els.bookList.replaceChildren();
  const books = [...state.books].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );

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

  els.libraryStatus.textContent =
    books.length === 0
      ? "No books yet."
      : `${books.length} book${books.length === 1 ? "" : "s"} · ${state.comparisons.length} comparison${state.comparisons.length === 1 ? "" : "s"}`;
}

function renderCompare() {
  if (state.books.length < 2) {
    els.compareEmpty.hidden = false;
    els.compareActive.hidden = true;
    currentPair = null;
    return;
  }

  els.compareEmpty.hidden = true;
  els.compareActive.hidden = false;

  if (!currentPair || !pairStillValid(currentPair)) {
    currentPair = pickPair(state.books, state.comparisons);
  }

  if (!currentPair) {
    els.compareEmpty.hidden = false;
    els.compareActive.hidden = true;
    return;
  }

  const [a, b] = currentPair;
  fillChoice(els.choiceA, a);
  fillChoice(els.choiceB, b);

  const totalPairs = (state.books.length * (state.books.length - 1)) / 2;
  const uniquePairs = new Set(
    state.comparisons.map((c) =>
      c.bookAId < c.bookBId
        ? `${c.bookAId}|${c.bookBId}`
        : `${c.bookBId}|${c.bookAId}`
    )
  ).size;
  els.compareProgress.textContent = `${uniquePairs} of ${totalPairs} unique pairs compared · ${state.comparisons.length} total picks`;
  els.undoBtn.disabled = state.comparisons.length === 0 || busy;
}

/**
 * @param {[Book, Book]} pair
 */
function pairStillValid(pair) {
  const ids = new Set(state.books.map((b) => b.id));
  return ids.has(pair[0].id) && ids.has(pair[1].id);
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
  for (const book of ranked) {
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
    score.textContent = String(book.rating);
    score.title = "Elo rating";

    li.append(badge, meta, score);
    els.rankingsList.append(li);
  }
}

function renderRereads() {
  if (!els.rereadsList || !els.rereadsEmpty) return;
  els.rereadsList.replaceChildren();
  const rereads = state.books
    .filter((b) => (b.timesRead ?? 1) > 1)
    .sort((a, b) => (b.timesRead ?? 1) - (a.timesRead ?? 1));
  if (rereads.length === 0) {
    els.rereadsEmpty.hidden = false;
    return;
  }
  els.rereadsEmpty.hidden = true;
  for (const book of rereads) {
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

  try {
    busy = true;
    const book = await addBookRemote(trimmedTitle, trimmedAuthor);
    await refreshState();
    currentPair = null;
    renderLibrary();
    els.libraryStatus.textContent = `Added “${book.title}”.`;
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
  if (!currentPair || busy) return;
  const loserId =
    currentPair[0].id === winnerId ? currentPair[1].id : currentPair[0].id;
  if (loserId === winnerId) return;

  const btn =
    els.choiceA.dataset.bookId === winnerId ? els.choiceA : els.choiceB;
  btn.classList.add("picked");
  busy = true;

  try {
    await recordComparisonRemote(winnerId, loserId);
    await refreshState();
    window.setTimeout(() => {
      btn.classList.remove("picked");
      currentPair = pickPair(state.books, state.comparisons);
      busy = false;
      renderCompare();
    }, 160);
  } catch (err) {
    btn.classList.remove("picked");
    busy = false;
    els.compareProgress.textContent =
      err instanceof Error ? err.message : "Could not save that pick.";
  }
}

// Events
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    showView(
      /** @type {"library" | "compare" | "rankings" | "rereads"} */ (
        tab.dataset.view
      )
    );
  });
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

  try {
    busy = true;
    const text = await file.text();
    const rows = parseCsv(text);
    const { added, updated } = await importBooksRemote(rows);
    await refreshState();
    currentPair = null;
    renderLibrary();
    els.libraryStatus.textContent =
      added === 0 && updated === 0
        ? "No new books found in that CSV."
        : `Imported ${added} book${added === 1 ? "" : "s"}${updated ? ` · updated ${updated}` : ""}.`;
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

  els.sheetsBtn.disabled = true;
  els.libraryStatus.textContent = "Loading sheet…";

  try {
    busy = true;
    const { books } = await importBooksFromSheetUrl(url);
    const { added, updated } = await importBooksRemote(books);
    await refreshState();
    currentPair = null;
    renderLibrary();
    els.libraryStatus.textContent =
      added === 0 && updated === 0
        ? `Found ${books.length} book${books.length === 1 ? "" : "s"} — all already in your library.`
        : `Imported ${added} of ${books.length} book${books.length === 1 ? "" : "s"} from the sheet${updated ? ` · updated ${updated}` : ""}.`;
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
      currentPair = null;
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
  if (!currentPair || state.books.length < 2) return;
  const skipped = pairKey(currentPair[0].id, currentPair[1].id);
  const fakeCompared = [
    ...state.comparisons,
    {
      id: "skip",
      bookAId: currentPair[0].id,
      bookBId: currentPair[1].id,
      winnerId: currentPair[0].id,
      ratingA: 0,
      ratingB: 0,
      timestamp: 0,
    },
  ];
  let next = pickPair(state.books, fakeCompared);
  if (!next || pairKey(next[0].id, next[1].id) === skipped) {
    const others = state.books.filter((b) => b.id !== currentPair[0].id);
    const a = state.books[Math.floor(Math.random() * state.books.length)];
    let b = others[Math.floor(Math.random() * others.length)];
    if (a && b && a.id !== b.id) next = [a, b];
  }
  currentPair = next;
  renderCompare();
});

els.undoBtn.addEventListener("click", () => {
  void (async () => {
    try {
      busy = true;
      await undoLastComparisonRemote();
      await refreshState();
      currentPair = null;
      renderCompare();
    } catch (err) {
      els.compareProgress.textContent =
        err instanceof Error ? err.message : "Could not undo.";
    } finally {
      busy = false;
    }
  })();
});

/**
 * @param {string} a
 * @param {string} b
 */
function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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
  currentPair = null;
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
    showView("library");
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
  void handleAuth("signIn");
});

els.authSignUpBtn.addEventListener("click", () => {
  void handleAuth("signUp");
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
      els.authStatus.textContent = "Please sign in again.";
      return;
    }
    showSignedIn(user);
    els.libraryStatus.textContent = "Loading your library…";
    await refreshState();
    showView("library");
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
