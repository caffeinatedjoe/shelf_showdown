# Phase 1 · Data Intake & Sync Foundation

This document explains the import contract and synchronization behaviors implemented in Phase 1 so future chunks have a stable foundation.

## Role & Objective
- **Role:** data ingest steward
- **Objective:** populate IndexedDB with normalized book records derived solely from ingested CSV or Google Sheet exports.

## Inputs
1. **CSV file:** headers (Title, Author, Date read, Length), optional Genre/Context/Source columns; extra fields are ignored. Length may be provided as total minutes or as `HH:MM`/`HH:MM:SS` (hours/minutes), and the parser still supports quoted values, BOM removal, and multi-date cells.
2. **Google Sheet URL:** publicly published CSV export (manual trigger only, no scheduled sync).

## Outputs
- normalized JSON book records stored into the `books` IndexedDB store (schema version 1.0).
- ingestion logs emitted into UI and event bus detailing dedup actions and import duration.
- `records:updated` event dispatched for downstream services to rerun ranking pipelines.

## Contract & Constraints
1. **Parser contract:**
   - Splits fields on commas, semicolons, or pipes but respects quoted strings.
   - Trims whitespace, ignores blank rows, and attaches `__rowIndex` metadata for traceability.
   - Date read values may include multiple entries (e.g., `2024-01-01 | 2023-05-12`); invalid dates are dropped.
2. **Normalization rules:**
   - Dedupe on case-insensitive `title|author|lengthMinutes`.
   - Reads arrays capture each appearance with context/source metadata and are timestamped even when the source only supplies a month and year (e.g., `Jan 2025` or `2025-01`); these become inferred dates for ranking and analytics.
   - When no date is available, the importer still records a read entry marked as `missingDate: true` so read counts grow while analytics know there is no timestamp to include.
   - Derived pace metrics (`derivedPace.booksPerWeek` and `booksPerMonth`) are computed from the date span of the accumulated reads that actually have timestamps, so there is no imported Annual Count required.
   - Every record includes `rankingMetadata` (score 1500, lastUpdated timestamp, sort keys) and `ingestionMetadata` (schema version, source label, row origin).
3. **Data replacement strategy:**
   - Each import clears the existing IndexedDB store before persisting new records to keep the dataset deterministic.
   - Duplicate rows in the same import merge reads without creating new records, and each merge adds a log entry.
4. **Ingestion logging:**
   - Logs surface the normalization summary, dedup merges, and storage duration; they populate the UI and help trace any anomalies.
5. **Events:**
   - Every successful persist fires `records:updated` (via `EventTarget`) with the imported count/duration so ranking modules can listen and refresh.

## Validation & Verification
1. **Automated tests:** `tests/ingestion.test.js` covers CSV parsing, normalization, and dedup logic using Node's built-in test runner.
2. **Manual introspection:** open the UI in a browser, import a sample CSV, and watch the logboard, record counts, and status pill.
3. **IndexedDB inspection:** use browser devtools to confirm the `books` store contains normalized records that match the schema metadata documented above.

## Next Steps
- Hook event listeners in ranking modules to the `records:updated` event before Phase 2.
- Capture any schema adjustments or ingestion edge cases in `DECISIONS.md` if they deviate from the current contract.
