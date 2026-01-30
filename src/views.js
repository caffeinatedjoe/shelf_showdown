import { getAnalyticsRecords, getBooks } from "./state.js";
import { refreshRanking, recordPairPreference } from "./ranking.js";
import { onIngestionEvent } from "./events.js";

let rankingListEl;
let rankingSortSelect;
let rankingDirectionToggle;
let rankingGenreSelect;
let rankingSearchInput;
let rankingReadFilter;
let rerankButton;
let rankingStatusEl;
let bookTableBody;
let bookListStatus;
let analyticsGrid;
let pairwiseStatusEl;
let pairwiseSkipBtn;
let pairwiseSelectButtons = [];
let latestAllRecords = [];
let currentPair = [];
let pairwiseBusy = false;

function hydrateElements() {
  if (typeof document === "undefined") {
    return;
  }
  rankingListEl = document.getElementById("ranking-list");
  rankingSortSelect = document.getElementById("ranking-sort");
  rankingDirectionToggle = document.getElementById("ranking-direction-toggle");
  rankingGenreSelect = document.getElementById("ranking-genre");
  rankingSearchInput = document.getElementById("ranking-search");
  rankingReadFilter = document.getElementById("ranking-read-filter");
  rerankButton = document.getElementById("rerank-btn");
  rankingStatusEl = document.getElementById("ranking-status");
  bookTableBody = document.getElementById("book-table-body");
  bookListStatus = document.getElementById("book-list-status");
  analyticsGrid = document.getElementById("analytics-grid");
  pairwiseStatusEl = document.getElementById("pairwise-status");
  pairwiseSkipBtn = document.getElementById("pairwise-skip-btn");
  pairwiseSelectButtons = Array.from(document.querySelectorAll(".pairwise-select"));
}

const SORT_LABELS = {
  score: "Score",
  lastRead: "Most recent read",
  rereadCount: "Rereads",
  lengthMinutes: "Length"
};

const DIRECTION_LABELS = {
  desc: "Newest first",
  asc: "Oldest first"
};

const viewState = {
  sortKey: "score",
  direction: "desc",
  genre: "all",
  search: "",
  readFilter: "all"
};

let latestRender = 0;
let rerankInFlight = false;

export function collectGenreChoices(records = []) {
  const genres = new Set();
  records.forEach((record) => {
    const genre = (record?.genre ?? "Uncategorized").trim();
    if (genre) {
      genres.add(genre);
    }
  });
  return Array.from(genres).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export function summarizeAnalytics(records = []) {
  const summary = {
    totalRecords: 0,
    totalReads: 0,
    rereads: 0,
    genreCount: 0,
    averageLength: 0,
    topRecord: null,
    mostRecentRecord: null
  };

  if (!records.length) {
    return summary;
  }

  const genreSet = new Set();
  let lengthAccumulator = 0;
  records.forEach((record) => {
    const readsCount = Number.isFinite(record.readsCount) ? record.readsCount : 0;
    summary.totalReads += readsCount;
    if ((record.rereadCount ?? 0) > 1) {
      summary.rereads += 1;
    }
    const genre = (record.genre ?? "Uncategorized").trim() || "Uncategorized";
    genreSet.add(genre);

    if (!summary.topRecord || (record.score ?? 0) > (summary.topRecord.score ?? 0)) {
      summary.topRecord = record;
    }

    const candidateLastRead = record.lastRead ? Date.parse(record.lastRead) : null;
    const currentLatest = summary.mostRecentRecord?.lastRead
      ? Date.parse(summary.mostRecentRecord.lastRead)
      : null;
    if (candidateLastRead && (!currentLatest || candidateLastRead > currentLatest)) {
      summary.mostRecentRecord = record;
    }

    lengthAccumulator += Number.isFinite(record.lengthMinutes) ? record.lengthMinutes : 0;
  });

  summary.totalRecords = records.length;
  summary.genreCount = genreSet.size;
  summary.averageLength = Number((lengthAccumulator / records.length).toFixed(1));
  return summary;
}

function buildFilter() {
  const filter = {};
  if (viewState.genre !== "all") {
    filter.genre = viewState.genre;
  }
  const search = viewState.search.trim();
  if (search) {
    filter.search = search;
  }
  if (viewState.readFilter === "read") {
    filter.hasReads = true;
  } else if (viewState.readFilter === "unread") {
    filter.hasReads = false;
  }
  return filter;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return Math.round(value).toString();
}

function formatLength(minutes) {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) {
    return "—";
  }
  return `${Math.round(minutes)} min`;
}

function clearChildren(container) {
  if (!container) {
    return;
  }
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

export function choosePair(records = [], previousPair = []) {
  if (!Array.isArray(records) || records.length < 2) {
    return [];
  }
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const firstIndex = Math.floor(Math.random() * records.length);
    let secondIndex = Math.floor(Math.random() * records.length);
    if (secondIndex === firstIndex) {
      secondIndex = (firstIndex + 1) % records.length;
    }
    const candidate = [records[firstIndex], records[secondIndex]];
    const prevIds = previousPair.map((record) => record?.id ?? "__");
    const candidateIds = candidate.map((record) => record?.id ?? "__");
    const isRepeat =
      previousPair.length === 2 &&
      prevIds.length === candidateIds.length &&
      prevIds.every((id) => candidateIds.includes(id));
    if (!isRepeat) {
      if (Math.random() > 0.5) {
        return candidate.reverse();
      }
      return candidate;
    }
  }
  return [records[0], records[1]];
}

function updatePairwiseStatus(message) {
  if (pairwiseStatusEl) {
    pairwiseStatusEl.textContent = message;
  }
}

function setPairwiseButtonsDisabled(disabled) {
  pairwiseSelectButtons.forEach((button) => {
    const slot = Number(button.dataset.slot);
    const hasRecord = Boolean(currentPair[slot]);
    button.disabled = disabled || !hasRecord;
  });
}

function renderPairwiseCards(pair = []) {
  currentPair = pair;
  for (let slot = 0; slot < 2; slot += 1) {
    const record = pair[slot] ?? null;
    const titleEl = document.getElementById(`pairwise-title-${slot}`);
    const authorEl = document.getElementById(`pairwise-author-${slot}`);
    const scoreEl = document.getElementById(`pairwise-score-${slot}`);
    const lastReadEl = document.getElementById(`pairwise-lastread-${slot}`);
    if (titleEl) {
      titleEl.textContent = record?.title ?? "Waiting for data";
    }
    if (authorEl) {
      authorEl.textContent = record ? `by ${record.author ?? "Unknown"}` : "—";
    }
    if (scoreEl) {
      scoreEl.textContent = record ? formatNumber(record.rankingMetadata?.score ?? null) : "—";
    }
    if (lastReadEl) {
      lastReadEl.textContent = record
        ? formatDate(record.rankingMetadata?.sortKeys?.lastRead)
        : "—";
    }
  }
  setPairwiseButtonsDisabled(pairwiseBusy);
  if (!pair.length) {
    const message =
      latestAllRecords.length === 0
        ? "Import at least two books to unlock pairwise comparisons."
        : "Preparing a new pair shortly.";
    updatePairwiseStatus(message);
  }
}

function refreshPairFromRecords(records = [], forceNew = false) {
  latestAllRecords = records;
  if (records.length < 2) {
    renderPairwiseCards([]);
    return;
  }
  const basePair = forceNew ? [] : currentPair;
  const pair = choosePair(records, basePair);
  renderPairwiseCards(pair);
}

async function handlePairSelection(slot) {
  if (pairwiseBusy) {
    return;
  }
  const winner = currentPair[slot];
  const loser = currentPair[slot === 0 ? 1 : 0];
  if (!winner || !loser) {
    return;
  }
  pairwiseBusy = true;
  setPairwiseButtonsDisabled(true);
  updatePairwiseStatus(`Applying preference for "${winner.title}"...`);
  try {
    await recordPairPreference(winner.id, loser.id);
    const updatedRecords = await getBooks({ sortedBy: "score", direction: "desc", filter: {} });
    refreshPairFromRecords(updatedRecords, true);
    updatePairwiseStatus(`Recorded preference for "${winner.title}".`);
  } catch (error) {
    console.error("Pairwise preference failed", error);
    updatePairwiseStatus("Pairwise update failed; try again.");
  } finally {
    pairwiseBusy = false;
    setPairwiseButtonsDisabled(false);
  }
}

function handlePairSkip() {
  if (pairwiseBusy) {
    return;
  }
  updatePairwiseStatus("Skipping this matchup…");
  refreshPairFromRecords(latestAllRecords, true);
}

function createStat(label, value) {
  const stat = document.createElement("div");
  const statLabel = document.createElement("p");
  statLabel.className = "ranking-stat-label";
  statLabel.textContent = label;
  const statValue = document.createElement("p");
  statValue.className = "ranking-stat-value";
  statValue.textContent = value;
  stat.append(statLabel, statValue);
  return stat;
}

function renderRankingList(records) {
  if (!rankingListEl) {
    return;
  }
  clearChildren(rankingListEl);
  if (!records.length) {
    const placeholder = document.createElement("li");
    placeholder.className = "ranking-item";
    placeholder.textContent = "No records match the current filters.";
    rankingListEl.appendChild(placeholder);
    return;
  }
  records.forEach((record, index) => {
    const item = document.createElement("li");
    item.className = "ranking-item";
    const indexBadge = document.createElement("span");
    indexBadge.className = "ranking-index";
    indexBadge.textContent = String(index + 1);
    const content = document.createElement("div");
    content.className = "ranking-content";
    const title = document.createElement("p");
    title.className = "ranking-title";
    title.textContent = record.title ?? "Untitled";
    const author = document.createElement("p");
    author.className = "ranking-author";
    author.textContent = `by ${record.author ?? "Unknown"}`;
    content.append(title, author);
    const statsContainer = document.createElement("div");
    statsContainer.className = "ranking-stats";
    const score = record.rankingMetadata?.score ?? null;
    const lastRead = record.rankingMetadata?.sortKeys?.lastRead ?? null;
    const rereads = record.rankingMetadata?.sortKeys?.rereadCount ?? record.reads?.length ?? 0;
    const lengthMinutes = record.lengthMinutes ?? null;
    statsContainer.append(
      createStat("Score", formatNumber(score)),
      createStat("Last read", formatDate(lastRead)),
      createStat("Rereads", String(rereads)),
      createStat("Length", formatLength(lengthMinutes))
    );
    content.append(statsContainer);
    item.append(indexBadge, content);
    rankingListEl.appendChild(item);
  });
}

function renderBookTable(records) {
  if (!bookTableBody) {
    return;
  }
  clearChildren(bookTableBody);
  if (!records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "helper-text";
    cell.textContent = "No records match the current filters.";
    row.appendChild(cell);
    bookTableBody.appendChild(row);
    return;
  }
  records.forEach((record) => {
    const row = document.createElement("tr");
    const titleCell = document.createElement("td");
    titleCell.textContent = record.title ?? "Untitled";
    const authorCell = document.createElement("td");
    authorCell.textContent = record.author ?? "Unknown";
    const scoreCell = document.createElement("td");
    scoreCell.textContent = formatNumber(record.rankingMetadata?.score ?? null);
    const readsCell = document.createElement("td");
    readsCell.textContent = String(record.reads?.length ?? 0);
    const lengthCell = document.createElement("td");
    lengthCell.textContent = formatLength(record.lengthMinutes ?? null);
    const genreCell = document.createElement("td");
    genreCell.textContent = record.genre ?? "—";
    row.append(titleCell, authorCell, scoreCell, readsCell, lengthCell, genreCell);
    bookTableBody.appendChild(row);
  });
}

function renderAnalyticsGrid(records) {
  if (!analyticsGrid) {
    return;
  }
  clearChildren(analyticsGrid);
  const summary = summarizeAnalytics(records);
  const readsNote = summary.totalRecords
    ? `${summary.rereads} rereads · ${summary.totalRecords} books`
    : "Awaiting data";
  const genreNote = summary.totalRecords
    ? `Avg. length ${formatLength(summary.averageLength)}`
    : "Awaiting data";
  const cards = [
    {
      label: "Top ranked",
      value: summary.topRecord?.title ?? "—",
      note: summary.topRecord ? `Score ${formatNumber(summary.topRecord.score)}` : "No records yet"
    },
    {
      label: "Most recent read",
      value: summary.mostRecentRecord?.title ?? "—",
      note: summary.mostRecentRecord
        ? `Last read ${formatDate(summary.mostRecentRecord.lastRead)}`
        : "No reads logged"
    },
    {
      label: "Reads & rereads",
      value: `${summary.totalReads} reads`,
      note: readsNote
    },
    {
      label: "Genre diversity",
      value: `${summary.genreCount} genres`,
      note: genreNote
    }
  ];
  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "analytics-card";
    const label = document.createElement("p");
    label.className = "analytics-label";
    label.textContent = card.label;
    const value = document.createElement("p");
    value.className = "analytics-value";
    value.textContent = card.value;
    const note = document.createElement("p");
    note.className = "analytics-note";
    note.textContent = card.note;
    article.append(label, value, note);
    analyticsGrid.appendChild(article);
  });
}

function updateGenreOptions(records) {
  if (!rankingGenreSelect) {
    return;
  }
  const available = collectGenreChoices(records);
  const previousGenre = viewState.genre;
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = "All genres";
  fragment.appendChild(defaultOption);
  available.forEach((genre) => {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    fragment.appendChild(option);
  });
  rankingGenreSelect.innerHTML = "";
  rankingGenreSelect.appendChild(fragment);
  if (previousGenre !== "all" && available.includes(previousGenre)) {
    rankingGenreSelect.value = previousGenre;
  } else {
    viewState.genre = "all";
    rankingGenreSelect.value = "all";
  }
}

function showRankingStatus(message) {
  if (rankingStatusEl) {
    rankingStatusEl.textContent = message;
  }
}

function showBookStatus(message) {
  if (bookListStatus) {
    bookListStatus.textContent = message;
  }
}

async function renderAllViews() {
  latestRender += 1;
  const renderToken = latestRender;
  const filter = buildFilter();
  try {
    const [rankingRecords, bookRecords, analyticsRecords, allRecords] = await Promise.all([
      getBooks({ sortedBy: viewState.sortKey, direction: viewState.direction, filter }),
      getBooks({ sortedBy: "title", direction: "asc", filter }),
      getAnalyticsRecords({ filter }),
      getBooks({ sortedBy: "score", direction: "desc", filter: {} })
    ]);
    if (renderToken !== latestRender) {
      return;
    }
    renderRankingList(rankingRecords);
    renderBookTable(bookRecords);
    renderAnalyticsGrid(analyticsRecords);
    updateGenreOptions(allRecords);
    refreshPairFromRecords(allRecords);
    const sortLabel = SORT_LABELS[viewState.sortKey] ?? viewState.sortKey;
    showRankingStatus(
      `Showing ${rankingRecords.length} records sorted by ${sortLabel} (${viewState.direction}).`
    );
    showBookStatus(`${bookRecords.length} records visible.`);
  } catch (error) {
    console.error("View rendering failed", error);
    showRankingStatus("Unable to load records; check the console.");
    showBookStatus("Unable to render table.");
    clearChildren(rankingListEl);
    clearChildren(bookTableBody);
    clearChildren(analyticsGrid);
  }
}

async function handleRerank() {
  if (rerankInFlight || !rerankButton) {
    return;
  }
  rerankInFlight = true;
  rerankButton.disabled = true;
  rerankButton.textContent = "Reranking…";
  showRankingStatus("Reranking records…");
  try {
    await refreshRanking();
    await renderAllViews();
  } catch (error) {
    console.error("Rerank failed", error);
    showRankingStatus("Rerank failed; try again.");
  } finally {
    rerankInFlight = false;
    rerankButton.disabled = false;
    rerankButton.textContent = "Rerank now";
  }
}

function updateDirectionButton() {
  if (!rankingDirectionToggle) {
    return;
  }
  rankingDirectionToggle.textContent = DIRECTION_LABELS[viewState.direction] ?? "Sort direction";
  rankingDirectionToggle.setAttribute("aria-pressed", String(viewState.direction === "asc"));
}

function attachHandlers() {
  if (rankingSortSelect) {
    rankingSortSelect.addEventListener("change", (event) => {
      viewState.sortKey = event.target.value;
      renderAllViews();
    });
  }

  if (rankingDirectionToggle) {
    rankingDirectionToggle.addEventListener("click", () => {
      viewState.direction = viewState.direction === "desc" ? "asc" : "desc";
      updateDirectionButton();
      renderAllViews();
    });
  }

  if (rankingGenreSelect) {
    rankingGenreSelect.addEventListener("change", (event) => {
      viewState.genre = event.target.value;
      renderAllViews();
    });
  }

  if (rankingSearchInput) {
    rankingSearchInput.addEventListener("input", (event) => {
      viewState.search = event.target.value;
      renderAllViews();
    });
  }

  if (rankingReadFilter) {
    rankingReadFilter.addEventListener("change", (event) => {
      viewState.readFilter = event.target.value;
      renderAllViews();
    });
  }

  if (rerankButton) {
    rerankButton.addEventListener("click", () => {
      handleRerank();
    });
  }

  pairwiseSelectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const slot = Number(button.dataset.slot);
      handlePairSelection(slot);
    });
  });

  if (pairwiseSkipBtn) {
    pairwiseSkipBtn.addEventListener("click", () => {
      handlePairSkip();
    });
  }

  onIngestionEvent("records:updated", () => {
    renderAllViews();
  });
}

export function initializeViews() {
  hydrateElements();
  updateDirectionButton();
  attachHandlers();
  updatePairwiseStatus("Choose a winner to update their score.");
  renderAllViews();
}
