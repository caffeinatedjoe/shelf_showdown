Version: V4
Last updated: 2025-MM-DD  
Only maintainers may change this file.

---

## Precedence
1. AGENTS.md  
2. Tool / system constraints  
3. Project docs (README, DECISIONS)  
4. Task prompt

---

## Core Invariants (never violate)

### Design Philosophy
- Prefer **simple, readable solutions** over clever ones.
- If two approaches work, standardize the simpler.
- Ship work in **small, independently verifiable chunks**.
- Each chunk must have: success criteria, docs, and a clear verification path.
- Default stack: **vanilla HTML, CSS, JS**.
- Add frameworks or build tools only with explicit justification.

### Product & UX
- Progressive enhancement only: **HTML → CSS → minimal JS**
- Interactive elements:
  - Pointer Events
  - ≥44×44 px targets
  - Visible focus (≥2px contrast)
  - Full keyboard operation
- Desktop and mobile must behave identically (interaction + accessibility)
- UI/UX changes require **human review and acceptance** before completion.

### Architecture & State
- Explicit module boundaries and public APIs
- Composition over inheritance
- Framework-agnostic business logic
- No hidden globals or singletons
- Prefer stable, widely-supported tech
- Single source of truth for state
- Derived state only; no duplicated ownership
- State propagation paths must be explicit and traceable

### Task Definition (reject if missing)
Every task must specify:
- Role
- Objective
- Inputs
- Outputs
- Constraints
- Validation / acceptance criteria

---

## Execution Protocol
- Missing scope, inputs, or validation → **reject task**
- Read AGENTS.md and DECISIONS.md
- Plan in numbered steps with acceptance criteria
- Do not violate invariants without approval
- Implement in small, atomic commits
- Tests and docs are mandatory
- Keep the full test suite passing; temporary breaks must be resolved or documented before merge
- Final report must include:
  - Status (done / blocked)
  - Evidence (tests, a11y, perf, human sign-off if UI)
  - Risks / open questions
  - Next action or PR title

---

## Planning Format

1. Step — input → output (acceptance, risks)
2. …
N. Validation — tests, a11y, performance, human review (if UI)

---

## Hard Stops
Stop and escalate if any fail:
- Automated tests
- Keyboard-only navigation
- Screen reader smoke test (if UI changed)
- Performance regression
- WCAG 2.1 AA violation
- Human UX sign-off missing for UI changes

---

## Escalation
Stop and escalate if:
- Requirements conflict with AGENTS.md
- Accessibility or safety cannot be verified
- Required files, APIs, or decisions are missing
- Ambiguity remains after two clarification attempts

Format:
```
ESCALATION — Task: …
State: …
Blocker: …
Questions:
1. …
2. …
```

---

## Decision Recording
All non-trivial decisions go to DECISIONS.md:
- Date
- Decision
- Rationale
- Alternatives
- Files affected
- Agents involved

Any deviation from AGENTS.md must be logged.

---

## Delivery Rules
- Codebase must always be left in a **verifiable, testable state**.
- Exploratory work must be clearly labeled and reverted before new tasks.
- Every change must document:
  - Human feedback (if any)
  - Tests added or updated

---

## Editing This File
- Versioned (v1, v2, …)
- Peer review + maintainer approval
- After changes, validate with ≥2 independent agents

---

Goal: Independent agents should converge on the same behavior using only this file and the repo state.