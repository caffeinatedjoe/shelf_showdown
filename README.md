# Shelf Showdown · Phase 1

Phase 1 of the Shelf Showdown AI agent backlog focuses on deterministic data intake and synchronization so the ranking engine can consume a single source of truth.

## What’s implemented
- CSV parser that understands quoted values, multi-line separators, and logs dedup behavior.
- Normalizer that enforces the canonical book schema (reads arrays, ranking metadata, ingestion metadata) and merges duplicate rows.
- IndexedDB persistence layer that wipes the old store on every import and exposes helpers for future views.
- UI with CSV upload, custom Google Sheet fetch, logs, counters, and clear-DB support.
- Ingestion event emitter (`records:updated`) so downstream modules rerun when data changes.
- Automated tests for the parser/normalizer that run via `npm test`.

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

The test suite verifies that `parseCsv` can handle quoted rows and that normalization merges duplicates cleanly while keeping schema metadata intact.
