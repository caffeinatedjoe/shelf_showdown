# Phase 4 · Accessibility-first views

This doc describes the accessible views introduced in Phase 4: the rankings feed, the canonical book table, and the derived analytics grid. Every control reads directly from the canonical IndexedDB store (`src/state.js`) and reruns after ingestion or manual rerank so there are no stale snapshots.

## Inputs & Outputs

- **Inputs:** Canonical book records (scores, reads, derived pace, genre metadata) emitted via `records:updated`.  
- **Outputs:** Three powered views: (1) rankings list with real-time sort/filters, (2) book table honoring filters/search, (3) analytics grid summarizing pace, rereads, and genre diversity.

## Interaction design

- **Ranking controls:** Sort selector (`score`, `lastRead`, `rereadCount`, `lengthMinutes`), direction toggle, genre selector, search bar, reads filter, rerank button. Each control is a native focusable element with ≥44 px hit area and clear focus outlines; the rerank control disables while the ranking service is recalculating.
- **Ranking list:** Ordered list showing rank number, title/author, score, last read, reread count, and length. Stats are grouped into accessible cards so screen readers can convey the metadata.
- **Book list:** Semantic table with `Title`, `Author`, `Score`, `Reads`, `Length`, and `Genre` columns. The table refreshes on every filter/search change, displays a fallback row when no records match, and relays status via an `aria-live` helper text.
- **Analytics grid:** Four cards expose top-ranked title, most recent read, totals, and genre span. Cards refresh after every view render and display contextual notes so the derived metrics are traceable.
- **Pairwise preference:** The dedicated matchup panel (`#pairwise-panel`) shows two books side by side, each with score/last read labels plus a “Prefer this book” action. Selecting one sends the result through the ranking service, updates the scores, and Generates a new pair; the skip control (`#pairwise-skip-btn`) forces a different matchup when needed.

## Accessibility & validation

1. **Keyboard walkthrough:** Tab through every control (selects, button, toggles). Every interactive element is fully operable via keyboard, retains focus outline, and obeys pointer events.
2. **Touch/target audit:** Buttons, selects, inputs, and table rows maintain ≥44 px height (see `styles.css`), ensuring comfortable touch targets on mobile.
3. **Live data verification:** Import a dataset or rerun ranking to trigger `records:updated`. Confirm filters/search rerender the ranking list, the book table updates, analytics cards recalc, and the pairwise matchup refreshes with the two highest candidates.
4. **Pairwise interaction:** Use the preference buttons (≥44 px) to select between the two books; verify the status text (`#pairwise-status`) updates to report the applied preference, and the ranking metadata persists so reranking relies on the new scores.
5. **Scrollable view container:** The rankings/library/analytics stack lives inside `.view-panels`, which clamps the height (`max-height: clamp(35rem, 70vh, 60rem)`) and allows scrolling so the rest of the import/status area remains reachable on long datasets.
6. **State traceability:** All views derive state through `src/state.js` helpers (`getBooks`, `getAnalyticsRecords`) and log rerank actions via the status pill (`ranking-status`, `book-list-status`).

## Notes

- The rerank button calls `refreshRanking()`; the view module handles UI locking/disabling and re-renders when the service resolves.
- Genre options are computed from the entire store (not just the filtered subset) so the selector always includes every genre present.
- Tests (`tests/views.test.js`) cover the helper logic that backs the analytics and genre picker to keep the view layer verifiable.
