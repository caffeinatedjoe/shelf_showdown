# Shelf Showdown

Rank your books with binary insertion: each title is placed into your shelf with about log₂(n) picks instead of endless pairwise Elo grind.

## MVP features

- **Accounts** — email/password sign-up and sign-in (Convex Auth)
- **Library** — add books manually, import a CSV, or load from a public Google Sheets URL
- **Sort** — binary-search each book into your ranking; skip or undo anytime
- **Rankings** — live ordered shelf from completed placements
- **Rereads** — books finished more than once, sorted by times read

Data is stored in [Convex](https://convex.dev) with email/password auth via Convex Auth. Sign up once; your library and rankings persist to your account across devices.

## Live site

Hosted on GitHub Pages: [joecoffey.me/shelf_showdown](https://joecoffey.me/shelf_showdown/)

The static frontend (`index.html`, `app.js`, `style.css`, `modules/`) is served from the `main` branch root. Backend stays on Convex.

## Design ideas

Playful visual directions (not wired into the app yet) live in [`styles/index.html`](styles/index.html) — mobile-app phone frames for Face Out (cover-forward), Ring Round, Stack Attack, Zine Fight, and Late Fee.

## Run it locally

```bash
npm install
npx convex dev   # keeps backend in sync (use this in development)
npx serve . -l 5173
```

Open http://127.0.0.1:5173, create an account, then add or import books.

## Google Sheets import

Paste any Google Sheets URL (the sheet must be shared with **Anyone with the link**).

The importer does not require a fixed column layout. It:

1. Reads the sheet via Google’s Visualization API
2. Detects title and author columns from header names when present (`Title`, `Author`, `Book`, `Writer`, …)
3. Falls back to content heuristics when headers are missing or unlabeled (preferring longer book-like text for title, name-shaped text for author)
4. Counts **times read** from duplicate title/author rows (reading-log style), or from an explicit `Times Read` / `Read Count` column when present
5. Discards everything else — dates, lengths, yearly totals, genre flags, other stats

Example:

```
https://docs.google.com/spreadsheets/d/1hNxU4YCmZZ5uRfq8_eHUwLspzNWncJzmdclrzYAGlvM
```

Optional: include `#gid=` / `?gid=` to target a specific tab.

## CSV format

CSV import uses the same flexible column detection. A simple file still works:

```csv
Title,Author
The Left Hand of Darkness,Ursula K. Le Guin
Neuromancer,William Gibson
```

Header row optional. Without headers, the first text-heavy column is treated as title and the next name-like column as author.
