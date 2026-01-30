# Shelf Showdown · Phase 1

Phase 1 of the Shelf Showdown AI agent backlog focuses on deterministic data intake and synchronization so the ranking engine can consume a single source of truth.

## What’s implemented
- CSV parser that understands quoted values, multi-line separators, and logs dedup behavior.
- Normalizer that enforces the canonical book schema (reads arrays, ranking metadata, ingestion metadata) and merges duplicate rows.
- IndexedDB persistence layer that wipes the old store on every import and exposes helpers for future views.
- UI with CSV upload, custom Google Sheet fetch, logs, counters, and clear-DB support.
- Ingestion event emitter (`records:updated`) so downstream modules rerun when data changes.
- Automated tests for the parser/normalizer that run via `npm test`.

## Phase 2 · Canonical Storage & State Helpers

Phase 2 codifies the IndexedDB schema and exposes composable helpers so every view or analytics module can re-derive sorting/filtering and derived metrics without caching a global snapshot. `src/storage.js` now publishes schema metadata (`SCHEMA_METADATA`) plus a `getBookById` helper, and `src/state.js` exposes `getBooks({ sortedBy, direction, filter })`, `getBookById`, and `getAnalyticsRecords({ filter })`, along with exported utilities like `sortRecords`, `filterRecords`, and `deriveAnalyticsRecord`.

The helpers honor the canonical schema (score, lastRead, rereadCount, lengthMinutes) and support filtering by genre, search text, read presence, and length bounds before returning sorted results or analytics-ready payloads. Refer to `docs/canonical-storage.md` for the Phase 2 contract, acceptance criteria, and verification checks before building ranking or analytics views.

## Phase 3 · Ranking Service Modularization

Phase 3 delivers `src/ranking.js`, a lightweight service that initializes with normalized records, compares every pair via a recency/reread/pace-weighted heuristic, and adjusts scores with an Elo-style update loop. The service exposes `initialize`, `compare`, `score`, and `refresh` helpers, automatically reruns whenever `records:updated` fires, and keeps each record's `rankingMetadata` (score, `sortKeys`, and `lastUpdated`) in sync with IndexedDB. Documentation and validation steps live in `docs/ranking-service.md`.

## Phase 4 · Accessibility-first views

Phase 4 introduces the accessible ranking, book list, analytics, and pairwise preference views described in `docs/views-accessibility.md`. Controls (sort/direction, genre, reads, search, rerank) re-derive the canonical state without caching, the ranking list highlights score/last read/rereads/length, the book table echoes the active filters, and the analytics grid surfaces top rank, most recent reads, reads totals, and genre diversity. The pairwise matchup lets you pick the preferred book between two candidates and immediately persists the outcome via the ranking service. The rerank action locks the button while `refreshRanking()` persists the new scores, and the helpers powering this layer are covered by `tests/views.test.js`.

## Run locally
1. Open `index.html` in a browser (no bundler required).
2. Import a CSV using the sample headers: `Title, Author, Date read, Length` (month/year values such as `Jan 2025` and even missing dates are supported; `Length` can be minutes or `HH:MM`/`HH:MM:SS`; pace is derived from the recorded reads).
3. Optional: paste a Google Sheet export URL and hit “Fetch sheet CSV”.
4. Use the logboard to inspect dedup merges, counts, and statuses.

## Tests
```bash
npm install
npm test
```

`npm test` now runs ingestion, state, and ranking suites so the parser/normalizer, canonical helpers, and the new ranking service all stay covered.
