# Decisions Log

## 2026-01-28 · Phase 1 schema & ingestion approach
- **Decision:** Normalize every import (CSV or Google Sheet) into schema version 1.0 records (id/title/author/lengthMinutes/annualCount/genre/reads/rankingMetadata/ingestionMetadata) stored in IndexedDB and always replace the existing dataset, merging duplicate rows by a case-insensitive `title|author|lengthMinutes` key while recording all deduplication events.
- **Rationale:** Chunk 1 must deliver a deterministic single source of truth; clearing the store after each import avoids complex merge strategies while still capturing duplicated read history via merging logic that preserves pace metadata. The schema pairs with the ranking service contract and gives future phases a stable versioned baseline.
- **Alternatives considered:** Supporting incremental merges (rejected to keep ingestion deterministic) and deduping solely on title/author (rejected to avoid identical titles with different lengths being treated as duplicates).
- **Files affected:** `src/ingestion.js`, `src/storage.js`, `index.html`, `docs/data-intake.md`, `README.md`, `tests/ingestion.test.js`.
- **Agents involved:** Codex (implementer).

## 2026-01-28 · Derived pace from read history
- **Decision:** Drop the imported “Annual Count” column; instead compute pace (`derivedPace.booksPerWeek`/`booksPerMonth`) from the span of parsed read dates and record it alongside each normalized book.
- **Rationale:** Weekly/monthly pace is derived data, so the CSV no longer needs to provide it. Deriving the metrics after the reads array is compiled keeps the schema portable and ensures rereads extend the pace calculation automatically.
- **Alternatives considered:** Keep the column and ignore it when present (rejected to simplify CSV contract) or estimate pace from a default value (rejected because historical reads now determine the pace in a measurable way).
- **Files affected:** `src/ingestion.js`, `src/storage.js`, `docs/data-intake.md`, `README.md`.
- **Agents involved:** Codex (implementer).

## 2026-01-28 · Partial and missing read dates
- **Decision:** Allow month/year or YYYY-MM input by turning them into inferred first-of-month timestamps while still attaching a “missingDate” read entry when no date is supplied, ensuring read counts grow even without datestamped analytics.
- **Rationale:** Users sometimes only log a month/year or forget to timestamp a reading; supporting these cases keeps records accurate, keeps derived analytics informed about gaps, and ensures later reads can increment the read array even if the original row lacked a date.
- **Alternatives considered:** Reject rows without full dates (rejected because it discards valid reads) and invent synthetic fallback dates (rejected because we now flag missing dates explicitly to avoid misleading analytics).
- **Files affected:** `src/ingestion.js`, `docs/data-intake.md`.
- **Agents involved:** Codex (implementer).
