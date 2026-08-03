# Shelf Showdown

Binary-insertion book ranking app. See `README.md` for the product overview and `project_management/project_overview.md` for goals.

## Architecture (quick orientation)

- **Frontend**: static, no bundler. Vanilla ESM served from the repo root (`index.html`, `app.js`, `style.css`, `modules/`). There is no build step.
- **Backend**: hosted [Convex](https://convex.dev) deployment. Its public URL is hard-coded in `modules/config.js` (`CONVEX_URL`). The browser talks to that live deployment directly over HTTP (`modules/convexClient.js`). Convex function sources live in `convex/`, and `convex/_generated/` is committed.
- **Auth**: email/password via Convex Auth (`convex/auth.ts`).

## Cursor Cloud specific instructions

- **No build step**: the frontend is plain files. `convex/_generated/` is checked in, so serving the static files is all that's needed for the frontend to run.
- **Run the frontend**: `npx -y serve . -l 5173`, then open `http://localhost:5173`. Use the `-y` flag — a bare `npx serve` (as in `README.md` / `npm run serve`) prompts interactively to install the `serve` package the first time, which hangs non-interactive shells.
- **The frontend uses the live hosted backend**: because `CONVEX_URL` in `modules/config.js` points at the deployed Convex deployment, just serving the static files gives a fully working app (sign up, add books, etc.) with no local backend. A quick reachability check: `curl -s -X POST "$CONVEX_URL/api/query" -H 'Content-Type: application/json' -d '{"path":"books:list","args":[{}],"format":"json"}'` should return `{"status":"success","value":[]}` when unauthenticated.
- **Backend dev (`npx convex dev`)** requires Convex credentials (interactive login or `CONVEX_DEPLOY_KEY`), which are not present in this environment. Per the repo's Convex rules, cloud agents can use `CONVEX_AGENT_MODE=anonymous npx convex dev`, but note that creates a *separate empty* deployment — it is not wired to the hard-coded `CONVEX_URL`, so the static frontend will keep talking to the hosted backend unless `modules/config.js` is changed. For frontend/product work you do not need to run Convex locally.
- **Tests**: `npm test` (runs `node --test modules/comparisons.test.js`; pure logic, no backend needed).
- **Lint**: `npm run lint` is a placeholder that just echoes "no lint configured" — there is no real linter wired up.
