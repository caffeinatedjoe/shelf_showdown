# Phase 3 · Ranking Service Modularization

This document captures the Phase 3 contract: a pluggable ranking engine that derives scores from pairwise comparisons, exposes metadata for downstream views, and keeps IndexedDB in sync with every rerank.

## Role & Objective
- **Role:** ranking steward  
- **Objective:** implement a resilient Elo-like service (`src/ranking.js`) that can initialize from raw records, compare book pairs via configurable heuristics, refresh an individual record or the full dataset, and persist updated `rankingMetadata` back into the canonical store every time the catalog changes.

## Inputs
1. Normalized book records with `reads`, `derivedPace`, and existing `rankingMetadata` keys (or the ability to seed them).
2. Ingestion lifecycle events (`records:updated`) broadcast after every import so downstream services can rerun ranking.
3. Optional configuration for feature weights, K-factor, and score precision that keeps the pairwise comparator extensible.

## Outputs
- `rerankRecords(records, options)` — pure helper that runs every unique pair through the comparator, adjusts scores with Elo, and refreshes `rankingMetadata.sortKeys` (`score`, `lastRead`, `rereadCount`).
- `defaultCompare(...)` — recency/reread/pace weighted comparator used by default; consumers can supply their own via `comparePair`.
- `RankingService` (instantiated and exported as `initializeRanking`, `compareRanking`, `scoreRanking`, `refreshRanking`) — ties the pure helper to IndexedDB persistence, re-ranks on `records:updated`, exposes `initialize`, `compare`, `score`, `refresh` per the Phase 3 contract, and logs failures through `onError`.
- `SCHEMA_METADATA` stays untouched; only `rankingMetadata` fields mutate so existing views keep the same shape.

## Contract & Constraints
1. **Metadata updates:** every rerank sets `rankingMetadata.score`, `rankingMetadata.sortKeys.score`, `rankingMetadata.sortKeys.lastRead`, `rankingMetadata.sortKeys.rereadCount`, and `rankingMetadata.lastUpdated` before persisting the book record.
2. **Pairwise algorithm:** the default comparator derives a momentum score from the most recent read, reread count, and pace; Elo adjustments run for every unordered pair so the ranking space converges toward deterministic scores even when records have the same initial base.
3. **Extensibility:** callers can pass a custom `comparePair` (via `RankingService` constructor options or `rerankRecords`) to replace the ranking lens without touching storage, honoring the simple interface `compare(a, b) -> 1|0|-1`.
4. **Automatic refresh:** the module wires `records:updated` to `refreshRanking()` so imports automatically rerank without extra UI wiring.
5. **Performance:** pairwise loops are intentionally bounded (O(n²)) but tested to complete within the <1 second target for 50+ books; heuristic weights keep differences expressive even on older data.

## Validation & Verification
1. `tests/ranking.test.js` covers comparator prioritization, metadata seeding, and `RankingService` helpers that rely only on consistent inputs (no IndexedDB access).
2. `npm test` now runs ingestion, state, and ranking suites end-to-end.
3. `records:updated` smoke test: import a CSV, observe the logboard, then inspect `IndexedDB` (via devtools) to confirm `rankingMetadata.lastUpdated` and `score` change after ingestion.

## Next Steps
- Surface `refreshRanking()` via a UI control once Rankings view is wired so users can manually rerank without reimporting.
- Add instrumentation or logging for pairwise comparison counts if future performance budgets tighten.
