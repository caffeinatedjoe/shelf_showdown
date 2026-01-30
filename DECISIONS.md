# Decisions Log

## 2026-01-28 · Phase 1 schema & ingestion approach
- **Decision:** Normalize every import (CSV or Google Sheet) into schema version 1.0 records (id/title/author/lengthMinutes/annualCount/genre/reads/rankingMetadata/ingestionMetadata) stored in IndexedDB and always replace the existing dataset, merging duplicate rows by a case-insensitive `title|author|lengthMinutes` key while recording all deduplication events.
- **Rationale:** Chunk 1 must deliver a deterministic single source of truth; clearing the store after each import avoids complex merge strategies while still capturing duplicated read history via merging logic that preserves pace metadata. The schema pairs with the ranking service contract and gives future phases a stable versioned baseline.
- **Alternatives considered:** Supporting incremental merges (rejected to keep ingestion deterministic) and deduping solely on title/author (rejected to avoid identical titles with different lengths being treated as duplicates).
- **Files affected:** `src/ingestion.js`, `src/storage.js`, `index.html`, `docs/data-intake.md`, `README.md`, `tests/ingestion.test.js`.
- **Agents involved:** Codex (implementer).

## 2026-01-30 · Import ranking driven solely by rereads
- **Decision:** Limit the automatic ranking recompute that runs on imports to only consider reread counts when scoring, removing recency, pace, and other momentum signals from the derived calculation.
- **Rationale:** Relying only on rereads keeps the import-driven scores stable and aligned with the engagement signal the team trusts, while still allowing pairwise Elo interactions to nudge the rankings afterward.
- **Alternatives considered:** Keep the full momentum formula that includes recency/pace (rejected because it caused dramatic score swings after each refresh) or disable recompute entirely (rejected because downstream views/filters still require normalized `rankingMetadata` after imports).
- **Files affected:** `src/ranking.js`, `tests/ranking.test.js`.
- **Agents involved:** Codex (implementer).

## 2026-01-29 Â· Phase 4 accessibility-first views
- **Decision:** Deliver `src/views.js`, updated layout (`index.html`), and refreshed styling (`styles.css`) so the rankings list, canonical book table, and analytics grid surface the canonical records with accessible controls (sort/direction, genre, reads, search, rerank) that listen to `records:updated`.
- **Rationale:** Phase 4 required presenting the derived analytics without hidden caches, ensuring every interactive control meets the 44×44 px/touch target rule, and documenting the view contract for human review; the dedicated view module keeps ingestion code separate while rerendering whenever the canonical store changes.
- **Alternatives considered:** Bake the new views directly inside the ingestion script (rejected because it conflates responsibilities) or leave the UI static and force manual refreshes (rejected because stakeholders need live insights and analytics after each import or rerank).
- **Files affected:** `index.html`, `styles.css`, `src/state.js`, `src/index.js`, `src/views.js`, `docs/views-accessibility.md`, `README.md`, `tests/views.test.js`, `package.json`.
- **Agents involved:** Codex (implementer).

## 2026-01-29 · Pairwise preference panel
- **Decision:** Add a dedicated pairwise matchup section and supporting logic so users can choose the preferred book between two candidates, the ranking service records the result via `recordMatch`, and the UI refreshes all dependent views after each selection.
- **Rationale:** Feedback required a human-guided head-to-head mode to tune the pairwise ranking; isolating the matchup panel keeps this workflow separate from the ingestion UX while ensuring the canonical state persists the updated scores and downstream views automatically rerender.
- **Alternatives considered:** Toggling the rerank panel to pairwise mode (rejected because the match interface needed its own layout) or keeping only globally reranked scores (rejected because interactive pairwise selection is the requested behavior).
- **Files affected:** `index.html`, `styles.css`, `src/views.js`, `src/ranking.js`, `docs/views-accessibility.md`, `README.md`, `tests/views.test.js`.
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

## 2026-01-29 · Canonical storage helpers and schema doc
- **Decision:** Introduce a canonical state helper module (`src/state.js`), export `getBookById` from the storage layer, and document the schema plus helper contract in `docs/canonical-storage.md` so downstream views can rely on `getBooks`, `filterRecords`, and `getAnalyticsRecords` instead of managing derived state themselves.
- **Rationale:** Chunk 2 (Phase 2) requires query helpers that re-derive sorting, filtering, and analytics directly from IndexedDB; centralizing this logic keeps derived state traceable, avoids hidden globals, and ensures schema metadata is explicit before ranking and analytics views render.
- **Alternatives considered:** Let each view implement its own IndexedDB queries and sorting (rejected because it would duplicate logic and risk hidden mutable caches) or rely on an in-memory snapshot (rejected because it violates the single source of truth and complicates schema migrations).
- **Files affected:** `src/storage.js`, `src/state.js`, `docs/canonical-storage.md`, `README.md`, `tests/state.test.js`.
- **Agents involved:** Codex (implementer).

## 2026-01-29 · Ranking service reranks via pairwise Elo
- **Decision:** Add `src/ranking.js`, which implements a configurable Elo-style comparator, exposes `initialize`, `compare`, `score`, and `refresh`, and automatically reranks whenever `records:updated` fires so `rankingMetadata` scores, sort keys, and `lastUpdated` stay fresh in IndexedDB.
- **Rationale:** Phase 3 requires a deterministic ranking API that can recompute scores after every import, exposes metadata to downstream views, and lets future comparators plug in without storage churn, so keeping the pairwise logic inside a dedicated service keeps responsibilities clear.
- **Alternatives considered:** Mixing ranking updates into ingestion (rejected because it couples pipelines and prevents reranking on-demand) or relying solely on derived sorting at render time (rejected because views need persisted `rankingMetadata` and metadata-driven filters).
- **Files affected:** `src/ranking.js`, `src/index.js`, `docs/ranking-service.md`, `README.md`, `tests/ranking.test.js`, `package.json`.
- **Agents involved:** Codex (implementer).

## 2026-01-30 · Guard import ranking behind pre-existing scores
- **Decision:** Move the read-count reranking out of the ingestion event listener and into the import workflow so `rerankRecords` runs only once per import (and only when the CSV doesn’t already provide a `Score`/`Ranking` column), while removing the automatic `records:updated` refresh so later updates don’t recompute scores again.
- **Rationale:** Customers demanded that untouched books stay at the default 1500 until a manual comparison occurs, so computing scores exactly once during import keeps results stable while still honoring any precomputed rankings shipped inside the CSV.
- **Alternatives considered:** Keeping the event-driven rerank (rejected because it reran on every update) or disabling import ranking entirely (rejected because derived analytics still need meaningful scores immediately after import).
- **Files affected:** `src/index.js`, `src/ingestion.js`, `src/ranking.js`.
- **Agents involved:** Codex (implementer).

## 2026-01-30 · Simplify import scoring to reread weight
- **Decision:** Replace the pairwise rerank loop with a simple score adjustment that sets each book’s score to 1500 plus `DEFAULT_REREAD_WEIGHT` per additional read (i.e., `max(0, reads - 1) * DEFAULT_REREAD_WEIGHT`), avoiding score propagation and keeping imports deterministic unless a manual `Score` value is provided.
- **Rationale:** The old rerank loop pushed some books below 1500 immediately because Elo redistributes points; a deterministic scalar adjustment keeps untouched imports at 1500 and only nudges rereads upward with a predictable coefficient.
- **Alternatives considered:** Keep the Elo loop but tune its parameters (rejected because it still produced downward movements) or drop scoring entirely (rejected because downstream views still expect ranking metadata after import).
- **Files affected:** `src/ranking.js`, `tests/ranking.test.js`.
- **Agents involved:** Codex (implementer).
