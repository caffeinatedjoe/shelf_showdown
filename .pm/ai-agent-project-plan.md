# AI Agent Delivery Plan - Shelf Showdown

## Purpose
This plan translates `architecture.md` into a runnable backlog for AI coding agents. Each chunk is sized for focused implementation, includes explicit inputs, outputs, acceptance criteria, and validation steps, and references architectural expectations such as IndexedDB persistence, pairwise ranking, and WCAG compliance.

## Chunked Workstreams

1. **Data Intake & Sync Foundation**
   - **Objective:** Build deterministic ingestion that keeps IndexedDB as the single source of truth while supporting CSV and Google Sheet sources.
   - **Inputs:** Source metadata (Title, Author, Date read, Annual Count, Length, optional fields), sheet access/config, import preference (replace vs merge).
   - **Outputs:** Normalized JSON book records with versioned schema metadata persisted into IndexedDB.
   - **Tasks:**
     1. Define parser contract for multiple read dates, missing fields, duplicates, and reconciliation logging.
     2. Implement CSV import flow with dedup/merge behavior and import logging.
     3. Add Google Sheet refresh control (button or scheduled) that produces the same normalized records, with manual fallback if needed.
     4. Emit ingestion events so downstream ranking modules rerun when records change.
   - **Acceptance Criteria:** Imports finish in <1s for 30 books, records contain `id`, `reads`, ranking metadata, dedup rules documented, sheet import runs without crashing.
   - **Validation:** Run scripted CSV and sheet imports, inspect IndexedDB via query helpers, log results per AGENTS requirements.

2. **Canonical Storage & State Helpers**
   - **Objective:** Deliver schema plus query helpers that keep derived state traceable and view-friendly.
   - **Inputs:** Normalized records plus schema metadata.
   - **Outputs:** IndexedDB schema, helper module (`getBooks(sortedBy, filter)`, `getBookById`, `getAnalyticsRecords`), schema versioning docs.
   - **Tasks:**
     1. Define IndexedDB stores/migrations and tag each write with schema metadata (version tag, field map).
     2. Implement query helpers that re-derive sorting/filtering without global snapshots.
     3. Document the contract (field names, ranking metadata exposure) so ranking/views remain decoupled.
   - **Acceptance Criteria:** Helpers return consistent results for any view, schema metadata accessible, no hidden globals.
   - **Validation:** Run helper functions in isolation to confirm expected sorts/filters and backward compatibility with new schema versions.

3. **Ranking Service Modularization**
   - **Objective:** Provide a pluggable ranking API that calculates scores via pairwise comparisons and exposes metadata for views.
   - **Inputs:** Records from IndexedDB plus ranking metadata config (score weights, recency factors).
   - **Outputs:** Ranking service module with `initialize(records)`, `score(record)`, `compare(a, b)`, `refresh(bookId)`, and metadata updates persisted back to IndexedDB.
   - **Tasks:**
     1. Implement the base Elo-like pairwise algorithm and expose extension hooks for other approaches.
     2. Publish `rankingMetadata.score`, `rankingMetadata.lastUpdated`, and `rankingMetadata.sortKeys` for downstream views.
     3. Wire the service to ingestion events so reranking runs automatically after imports.
   - **Acceptance Criteria:** Reranking finishes in <1s for 50+ books, metadata persists, service swap does not require schema changes.
   - **Validation:** Run deterministic pairwise comparison tests, inspect metadata after rerank, confirm fallback path if reranking fails.

4. **Accessibility-first Views & Interactions**
   - **Objective:** Build static HTML/CSS scaffolds for Rankings, Book List, and Analysis views and hook them to live data.
   - **Inputs:** Ranking metadata per record, query helpers, UI state (filters, toggles).
   - **Outputs:** Responsive views that meet WCAG targets (touch targets >= 44px, visible focus outlines, keyboard operability) and read data from IndexedDB.
   - **Tasks:**
     1. Layout semantic markup (tables/lists) with accessible controls for filtering, sorting, reranking.
     2. Build vanilla JS connectors that fetch fresh data on view activation, avoid global caches, and trigger ranking updates.
     3. Implement toggles/filters/controls with explicit pointer targets and focus management.
   - **Acceptance Criteria:** Views render without script errors, resizing preserves layout, toggles keyboard-accessible, state re-derived per view activation.
   - **Validation:** Conduct keyboard-only walkthroughs, touch target audits, and reopen views after data changes to ensure re-derivation.

5. **Analytics, Reporting, & Instrumentation**
   - **Objective:** Deliver derived metrics (top rank, recent reads, rereads, pace, genre trends) using composition without mutating base data.
   - **Inputs:** Read history arrays, ranking metadata, genre fields.
   - **Outputs:** Analytics UI cells, timeline filters, instrumentation hooks triggered after imports or scheduled syncs.
   - **Tasks:**
     1. Create helper modules that compute each metric (e.g., pace from intervals, genre distribution) and expose standardized interfaces.
     2. Refresh analytics after imports or scheduled syncs.
     3. Provide accessible UI controls (range filters, expanders) for timeline exploration.
   - **Acceptance Criteria:** Analytics update automatically upon data refresh, timeline filters operate on derived stats, refresh instrumentation documented.
   - **Validation:** Run analytics helpers with synthetic data; confirm UI reflects recalculated stats without manual refresh.

6. **Quality & Verification Pipeline**
   - **Objective:** Ensure every delivery chunk is tested, documented, and validated per project expectations.
   - **Inputs:** Import coverage scenarios, ranking cases, view interactions, accessibility/performance criteria.
   - **Outputs:** Test logs (CSV + Google Sheet), ranking regression suites, accessibility checklist, performance benchmarks.
   - **Tasks:**
     1. Build automated import tests covering CSV, Google Sheet, and duplicate handling.
     2. Create ranking regression and edge-case suites.
     3. Perform manual keyboard/touch validations and document results.
     4. Record performance metrics (import-to-rerank timeline) and log failure states (offline, sheet fetch errors).
   - **Acceptance Criteria:** Tests pass, accessibility smoke tests completed, performance within budgets, documentation updated with results/fallbacks.
   - **Validation:** Attach evidence (logs, screenshots) to QA report and confirm new decisions recorded in `DECISIONS.md`.

## Cross-cutting Notes
- Every chunk logs compliance with AGENTS (progressive enhancement, no frameworks, small independent deliverables).
- Inputs/outputs rely on IndexedDB canonical records so there is no hidden global state.
- Outstanding questions from `architecture.md` should be resolved during Chunk 1 and documented before downstream work.

## Validation & Delivery Checklist
1. **Validation Steps** (covers all chunks): import credibility, ranking accuracy, view re-rendering, accessibility, performance targets, documentation update.
2. **Human Review Requirements:** QA for accessibility/performance and human sign-off on view UX.
3. **Next Actions for AI Agents:** implement sequential chunks, confirm acceptance per step, update plan and AGENTS/DECISIONS references with outcomes.
