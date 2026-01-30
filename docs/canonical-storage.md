# Phase 2 · Canonical Storage & State Helpers

This document defines the Phase 2 contract: the storage schema metadata plus the helper API that lets every view re-derive sorted, filtered, and analytics-ready state directly from IndexedDB without hidden globals.

## Role & Objective
- **Role:** canonical state steward  
- **Objective:** keep the `books` IndexedDB store documented, versioned, and wrapped with helper APIs (`getBooks`, `getBookById`, `getAnalyticsRecords`) so downstream modules can rely on deterministic state.

## Inputs
1. IndexedDB `books` store populated by Phase 1 ingestion (`id`, `title`, `author`, `reads`, `derivedPace`, `rankingMetadata`, `ingestionMetadata`, etc.).
2. Filter/sort parameters supplied by consumer views (genre, search text, read presence, length bounds, sort key, direction).

## Outputs
- `SCHEMA_METADATA` describing the store name, tracked fields, and version (`1.0`).
- Public helpers:
  1. `getBooks({ sortedBy, direction, filter })` — returns a sorted, filtered copy of the canonical records.
  2. `getBookById(id)` — retrieves the persisted record for a given identifier.
  3. `getAnalyticsRecords({ filter })` — builds analytics-friendly payloads (reads count, pace, last read, schema version) from filtered data.
  4. Pure helpers (`sortRecords`, `filterRecords`, `deriveAnalyticsRecord`) so view code can reuse the same logic without hitting IndexedDB if it already has the data.

## Contract & Constraints
1. **Sorting** — sorts honor `rankingMetadata.sortKeys` (score, lastRead timestamp, rereadCount) and `lengthMinutes`. Defaults to descending score; direction may be `asc`/`desc`.
2. **Filtering** — `filter` object may include:
   - `genre` (case-insensitive match)
   - `search` (text match over title + author, case-insensitive)
   - `hasReads` (`true` requires read entries, `false` excludes them)
   - `minLength` / `maxLength` (minutes bounds)
3. **Analytics payloads** — include `readsCount`, `lastRead`, `firstRead`, `derivedPace`, `schemaVersion`, `source`, `score`, `lengthMinutes`, `hasReads`, and `rereadCount`.
4. **Immutability** — helpers return copies of the arrays so calling code cannot mutate the stored records.
5. **Schema metadata** — every helper consumes records that map to `SCHEMA_METADATA.version`; future migrations must update this constant and document changes in `DECISIONS.md`.

## Validation & Verification
1. Automated tests (`tests/state.test.js`) cover sort/filter behavior and analytics derivation logic.
2. `npm test` ensures the helper module builds without touching IndexedDB in Node.
3. Browser smoke test: import Phase 1 CSV, then call `getBooks`/`getAnalyticsRecords` (via the console) to confirm they return expected data shapes and honor filters.

## Next Steps
- Use these helpers in ranking, book list, and analytics views so every render re-queries IndexedDB.
- When altering schema fields, update `SCHEMA_METADATA`, `docs/canonical-storage.md`, and log the decision in `DECISIONS.md`.
