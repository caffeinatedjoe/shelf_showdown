import { parseCsv, normalizeRows } from "./ingestion.js";
import { replaceBooks, clearBooks, getAllBooks } from "./storage.js";
import { emitIngestionEvent } from "./events.js";
import { rerankRecords } from "./ranking.js";
import { initializeViews } from "./views.js";

const csvInput = document.getElementById("csv-file");
const csvButton = document.getElementById("csv-import-btn");
const sheetInput = document.getElementById("sheet-url");
const sheetButton = document.getElementById("sheet-import-btn");
const clearButton = document.getElementById("clear-db-btn");
const recordCountEl = document.getElementById("record-count");
const lastImportEl = document.getElementById("last-import");
const lastSourceEl = document.getElementById("last-source");
const statusPill = document.getElementById("import-status");
const logOutput = document.getElementById("event-log");

const state = {
  recordCount: 0,
  lastImport: null,
  lastSource: null
};

function formatTimestamp(ts) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function addLog(message, tone = "info") {
  const entry = document.createElement("p");
  entry.className = "log-entry";
  entry.dataset.tone = tone;
  entry.textContent = message;
  logOutput.prepend(entry);
}

function updateSummary(source, count) {
  state.recordCount = count;
  state.lastImport = new Date().toISOString();
  state.lastSource = source;
  recordCountEl.textContent = String(count);
  lastImportEl.textContent = formatTimestamp(state.lastImport);
  lastSourceEl.textContent = source;
  statusPill.textContent = `Last import: ${source} · ${count} records`;
}

async function reloadCounters() {
  try {
    const books = await getAllBooks();
    updateSummary(state.lastSource ?? "database", books.length);
  } catch (error) {
    addLog(`Unable to refresh counters: ${error.message}`, "warning");
  }
}

async function runImport(sourceText, sourceLabel) {
  const parseStart = performance.now ? performance.now() : Date.now();
  const rows = parseCsv(sourceText);
  if (!rows.length) {
    addLog(`No records found in ${sourceLabel}.`, "warning");
    statusPill.textContent = "Import skipped · no rows";
    return;
  }

  const normalized = normalizeRows(rows, { source: sourceLabel });
  if (!normalized.records.length) {
    addLog(`Parsed ${rows.length} rows but no normalized records available.`, "warning");
    statusPill.textContent = "Import skipped · normalization failure";
    return;
  }

  addLog(`Normalized ${normalized.records.length} records from ${rows.length} rows.`, "info");
  normalized.log.forEach((line) => addLog(line, "info"));

  const hasProvidedRankings = normalized.records.some(
    (record) => record.ingestionMetadata?.rankingProvided === true
  );
  if (!hasProvidedRankings) {
    rerankRecords(normalized.records, {
      featureWeights: { rereads: 1 }
    });
  }

  try {
    await replaceBooks(normalized.records);
    const duration = (performance.now ? performance.now() : Date.now()) - parseStart;
    updateSummary(sourceLabel, normalized.records.length);
    emitIngestionEvent("records:updated", {
      source: sourceLabel,
      count: normalized.records.length,
      duration
    });
    addLog(
      `Persisted ${normalized.records.length} records (source: ${sourceLabel}) in ${duration.toFixed(1)}ms.`,
      "info"
    );
  } catch (error) {
    addLog(`Storage failure: ${error.message}`, "error");
    statusPill.textContent = "Import failed · see log";
  }
}

csvButton.addEventListener("click", async () => {
  const file = csvInput.files?.[0];
  if (!file) {
    addLog("Choose a CSV file before importing.", "warning");
    return;
  }

  try {
    const text = await file.text();
    await runImport(text, "CSV");
  } catch (error) {
    addLog(`File read error: ${error.message}`, "error");
  }
});

sheetButton.addEventListener("click", async () => {
  const url = sheetInput.value.trim();
  if (!url) {
    addLog("Provide the shared Google Sheet CSV URL.", "warning");
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    const text = await response.text();
    await runImport(text, "Sheet CSV");
  } catch (error) {
    addLog(`Sheet fetch failed (${error.message}). Download the CSV manually if CORS blocks the request.`, "error");
  }
});

clearButton.addEventListener("click", async () => {
  try {
    await clearBooks();
    addLog("IndexedDB cleared; ready for next import.", "info");
    state.recordCount = 0;
    recordCountEl.textContent = "0";
    statusPill.textContent = "Database cleared";
  } catch (error) {
    addLog(`Unable to clear data: ${error.message}`, "error");
  }
});

reloadCounters();
initializeViews();
