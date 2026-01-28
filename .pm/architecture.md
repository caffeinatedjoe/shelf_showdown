# Architecture Framework for Shelf Showdown

## Role & Objective
- **Role:** software architect translating the MVP overview into a structured implementation plan.
- **Objective:** provide a project-ready architecture brief that guides a project manager through ingestion, persistence, ranking, views, analytics, and verification obligations for the audiobook ranking tool.

## Vision Alignment & Success Criteria
- Bring the lightweight ranking experience to the forefront while surfacing supporting analytics such as pace, rereads, and genre trends.
- Validate success when users can import data, see accurate pairwise rankings, and explore consistent analytics across desktop and mobile with WCAG-compliant interactions.
- Acceptance metrics: import-to-view latency below 1s for 30 books, ≥44×44 touch targets, keyboard navigation for every interactive element, IndexedDB persistence across reloads.

## Data Ingestion & Sync Strategy
Actionable responsibilities:
1. **CSV Import Pipeline**
   - Define mandatory columns (Title, Author, Date read, Annual Count, Length) with optional additional metadata.
   - Architect parser that handles multiple read dates per book, missing values, and duplicate rows via reconciliation logic before persisting.
   - Decide whether imports replace the IndexedDB dataset or merge incrementally; if merging, log dedup rules and conflict resolution steps.
2. **Google Sheet Sync**
   - Treat the shared sheet as a secondary CSV source; document the refresh trigger (manual button, scheduled job, or both) and how credentials/URLs are stored.
   - Provide fallback for manual download if automation is unavailable.
3. **Canonical Storage**
   - Import results become normalized JSON records that store identifiers, metadata, and read history arrays.
   - Ensure each record exposes metadata used by ranking and views (e.g., last-read timestamp, reread count, length).
   - IndexedDB is the single source of truth—every view reads directly from it and re-queries on demand rather than caching state globally.

## Persistence & State Management
- **Schema Guidance**
  - Record fields: `id` (stable GUID), `title`, `author`, `length`, `reads` (array of {date, pace, context}), `annualCount`, `genre`, `rankingMetadata` (current score, last updated).
  - Include explicit versioning or schema metadata so ranking modules know how to interpret records even if the schema evolves.
- **State Propagation**
  - Keep derived state traceable: every view should re-derive sorting/filtering from IndexedDB queries instead of stored snapshots.
  - Expose query helpers (e.g., `getBooks(sortedBy, filter)`) that accept ranking metadata without mutating source data.

## Ranking Engine Modularization
- **Modular API**
  - Define a pluggable “ranking service” interface with methods such as `initialize(records)`, `score(record)`, and `compare(recordA, recordB)` to allow swapping algorithms without touching IndexedDB schema.
  - Provide hooks for metadata updates (e.g., recalculating `rankingMetadata.score`) so views automatically re-render.
  - Document default ranking method(s) for MVP (e.g., Elo-like pairwise comparisons plus recency weighting) and highlight extension points for future algorithms.
- **Metadata Exposure**
  - Ranking metadata must include sort keys (score, recency, reread count, length) so the book list view can present alternative orderings without recalculating the ranking from scratch.

## Views & Interaction Blueprint
1. **Rankings View**
   - Primary interaction: pairwise comparisons culminating in full ranking.
   - Present current ranking, allow users to filter by genre or time window, and offer a “rerank” action when new data arrives.
2. **Book List View**
   - Provide sortable columns (title, author, last read, score, rereads) driven by ranking metadata exposed from each record.
   - Implement accessible table/list semantics with keyboard focus outlines and responsive design for mobile.
3. **Analysis View**
   - Surface metrics such as top-ranked book, most recent reads, most reread titles, and pace (weekly/monthly/yearly).
   - Allow timeline exploration by expanding date buckets or filtering by read history.
4. **Interaction Standards**
   - Ensure toggling views does not rely on global state; all data is fetched from IndexedDB upon view activation.
   - Maintain accessible targets (≥44×44 px), visible focus states (≥2px contrast), and full keyboard control for toggles, filters, and ranking controls.

## Analytics & Reporting Layers
- Track analytics such as:
  - Top-ranked book (current MVP default ranking).
  - Most recent reads (latest `reads` entries).
  - Most reread books (length of `reads` array).
  - Reading pace (computed from intervals between dates).
  - Genre trends (distribution from record metadata).
- Architecture should allow new metrics via composition: add helper modules that consume the canonical records and emit derived statistics without mutating the base data.
- Consider instrumenting analytics refresh triggers following imports or scheduled syncs so reports stay current.

## Operational Constraints & Quality Targets
- Progressive enhancement: ship static HTML + CSS, infuse minimal vanilla JS for IndexedDB access, view toggling, and ranking interactions.
- Performance targets: quick reranking (<1s) after import for datasets up to 50 books, responsive mobile visual updates, smooth Google Sheet refresh path.
- Accessibility targets: WCAG 2.1 AA contrast, keyboard navigation, and accessible naming for ranking controls.
- Offline persistence requirement: IndexedDB must store data in the active browser profile; multi-device sync is out of scope for MVP but note if later needed.
- Testing/validation plan:
  1. Import coverage (CSV + Google Sheet) with duplicate handling.
  2. Ranking accuracy regression tests for default algorithm.
  3. View switching and interaction tests to confirm data re-derivation from IndexedDB.
  4. Accessibility smoke test (keyboard-only flows, focus states, touch target sizing).
  5. Performance checks for import-then-rerank timelines.

## Action Plan for Project Management
1. **Define Requirements**
   - Lock down mandatory CSV columns, import behavior (replace vs append), and sheet refresh cadence.
   - Identify ranking algorithm candidates + metadata contract and final list of analytics.
2. **Implement Core Architecture**
   - Build IndexedDB schema and helper query APIs.
   - Implement ingestion pipeline (CSV + optional Google Sheet automation) with dedup/reconciliation.
   - Develop modular ranking service with metadata exposure.
3. **Ship Frontend Views**
   - Layout static HTML scaffolding for Rankings, Book List, and Analysis.
   - Add CSS for responsive/mobile-first layout + accessible states.
   - Wire up JS to read from IndexedDB, trigger ranking, and update analytics.
4. **Quality & Verification**
   - Run import + ranking tests per validation plan.
   - Validate mobile and keyboard accessibility flows.
   - Document failure states and fallbacks (e.g., offline warnings, import errors).

## Outstanding Clarifications
1. Which CSV columns are mandatory vs optional, and how should missing data be reconciled?
2. Should imports replace the IndexedDB dataset or merge incrementally with deduplication?
3. What ranking methods must ship with the MVP, and how should the interface expose hooks for future alternatives?
4. How will the Google Sheet import be authenticated/refreshed (static URL, token, manual vs scheduled)?
5. What sorting/filtering interactions are required in each view?
6. Which analytics must appear in the MVP, and what are the expectations for their presentation/performance?
7. Are there device capability limits or list size upper bounds we should assume for responsive behavior?
8. Is offline persistence limited to one browser profile, or is multi-device sync a future expectation?
9. What concrete accessibility/performance benchmarks (touch sizes, load time, WCAG level) must be met?
10. What validation steps will prove MVP readiness (import coverage, ranking accuracy, view switching, persistence)?

## Next Steps for Validation
- Coordinate with QA to execute the aforementioned tests and log results.
- Capture human UX sign-off for view interactions, accessibility, and mobile layout before completion.
- If new decisions or deviations arise, document them in `DECISIONS.md` once available (date + rationale + impact).
