# App Overview - Architecture Summary

## Vision & Primary Use Case
- Deliver a lightweight tool where a user brings a list of books (audiobooks for the MVP) and conducts pairwise comparisons to derive a complete ranking.
- The UX should make ranking the centerpiece while still surfacing supporting analyses (latest reads, re-reads, pace, etc.) so the user can trust and explore the results.

## Data Ingestion & Source of Truth
- CSV import is the primary entry point; the MVP format is Title, Author, Date read, Annual Count, Length, with Date read supporting multiple values per book.
- Imports are stored as JSON book records; duplicates and incremental imports must be reconciled in architecture decisions (IndexedDB is the canonical store).
- The app must also ingest a publicly shared Google Sheet (exported as CSV), with a refresh model that can be manual or scheduled.
- IndexedDB lives in the browser, and every derived view (rankings, list, analytics) reads from it directly to ensure a single source of truth.

## Data Model & Ranking Modularization
- Each book record should carry identifiers, metadata, and an array of read dates to support analyses (top-ranked, pace, re-reads).
- Ranking logic must be modular and swappable; the database schema cannot be altered when swapping ranking algorithms.
- Sorting and filtering of views should be driven by ranking metadata exposed from these generic records.

## Views & Interactions
- MVP provides three base views: Rankings, Book List (sortable by various metrics), and Analysis (expandable over time).
- Users must be able to toggle between views seamlessly, and each view should derive all its data on-demand from IndexedDB rather than caches or globals.
- Interactions should be mobile-first but identical on desktop, with accessible touch targets, visible focus states, and full keyboard usability.

## Analytics & Reporting Targets
- The analysis view should expose metrics such as top-ranked book, most recent reads, most reread books, reading pace (weekly/monthly/yearly), and genre trends.
- Architecture should allow additional analytics to be layered on with minimal disruption, keeping derived state traceable back to the database.

## Operational & UX Constraints
- Prioritize progressive enhancement: static HTML, enhanced with CSS and minimalist JS.
- IndexedDB must be available offline for persistence in the browser profile being used (multi-device sync is not part of the MVP unless clarified).
- Performance targets include quick reranking after import, responsive mobile visuals, and adherence to a11y guidelines (44x44 targets, WCAG contrast, keyboard navigation).

## Outstanding Clarifications (from APP OVERVIEW)
- What are the top-priority success metrics that would validate the MVP ranking workflow as ready?
- Which columns in the CSV import are mandatory, which can be omitted, and how should we handle missing or duplicate rows?
- Does each import replace the IndexedDB dataset, or should we support incremental/additive imports with duplicate reconciliation?
- What upper bounds on list size and device capabilities should we plan for so the mobile-first experience remains responsive?
- What does the canonical JSON schema for a book record need to include (unique identifier, history array, metadata) so ranking modules stay generic?
- Which ranking methods must the MVP support, and what hooks or interfaces are required to keep the ranking module swappable?
- How should the Google Sheet import be identified and refreshed (static URL, token, manual refresh) and what cadence of updates is expected?
- For the rankings, book list, and analysis views, what sorting, filtering, and interaction requirements must ship in the MVP?
- Which analytics need to appear in the MVP analysis view (pace, re-reads, genre breakdowns, etc.), and are there expectations for visual presentation or performance?
- Is offline access or multi-device sync a requirement for MVP IndexedDB data, or is persistence limited to a single browser profile?
- Are there specific accessibility or performance targets (e.g., touch target size, load time, WCAG level) that the architecture must honor for the mobile primary user?
- What validation steps or tests will prove the MVP is acceptable (import coverage, ranking accuracy, view switching, IndexedDB persistence)?
