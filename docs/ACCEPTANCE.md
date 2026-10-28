# Acceptance record

This record distinguishes executed local checks from live integration and human acceptance. It is not a claim of production readiness. The primary interface now uses dietary segments and quantities; the older guest-based UI record is retained at the end as history.

## Current implementation: dietary segments

- Requirements: event headcount/budget, up to 12 mutually exclusive segments, editable positive counts/labels/requirements, relevant source excerpts, unresolved questions and explicit confirmation. Editing a segment revokes confirmation. No-known-restrictions groups require explicit approval; missing people remain unconfirmed.
- Coverage is visible beside the event headcount. Shortfalls and excess block allocation. The organiser must also confirm that each person is counted once.
- Extraction: OpenRouter remains the provider, with the same paid-use flag, one concurrent request, 20-call process cap, 8,000-character input cap, 4,000-token output limit, 30-second timeout, and no automatic retry/fallback. Aggregate and individual inputs use a segment normalizer. Included counts inherit parent requirements and are subtracted once; ambiguous overlap stays unresolved. Duplicate/conflicting people are counted once and remain reviewable. All model-derived segments are unconfirmed.
- Review: quantities of multiple meal types per segment, per-segment subtotal and validation issues; manual meal/quantity/add/remove edits preserve other segments and never rerun the whole allocation. Availability releases the edited segment's allocation before accounting for other segments. Unknown attributes do not satisfy requirements.
- Checkout: server validation and prices are authoritative. Final segment quantities are saved with approval-time item names/prices. Identical meals consolidate into PayPal item lines; packing retains the segment breakdown. Sandbox-only payment and existing session/origin/idempotency/uncertain-result locks remain in place.
- No new package, database redesign, public deployment, Qloo or paid service usage was introduced.

## Verified prototype limits

`src/lib/limits.ts` is the source of bounds used by the segment UI, schemas, allocation and extraction:

- Event headcount: 1–100.
- Dietary segments: at most 12; each has a positive integer headcount, with the total required to match the event headcount.
- Allocation: at most 50,000 search states; directly searches item quantities, not 100 guest assignments.
- Fifteen fictional menu items, HKD and one fixed HK$80 delivery charge.

A schema-supported headcount is not a stock or feasibility guarantee. Representative 30- and 100-person unconstrained quantity allocations pass. Insufficient compatible stock returns `INFEASIBLE`. A difficult 100-person multi-segment vegetarian stock conflict reaches the actual 50,000-state bound and returns `SEARCH_LIMIT`, not a false infeasibility assertion.

## Executed checks — 2026-10-23

### Automated tests and build

- **101 tests pass in 10 Vitest files**, including existing guest-based allocation/payment regressions and new segment coverage.
- TypeScript checking, ESLint and the production build pass using Node.js 24.19.0 and Next.js 16.4.2.
- Cases include exact/short/excess segment counts; overlapping requirements; inclusive versus exclusive counts; missing, ambiguous, duplicate/conflicting/unidentified replies; 100 individual inputs aggregated into quantities; more than 12 extracted segments; unknown dietary attributes; multi-item segments; shared stock; manual edits preserving other segments; positive integer quantities; forged prices; delivery charged once; snapshot consolidation and payment verification.
- The current adapter and payment tests use mocked responses. The 20-call cap and failure handling are exercised without any real provider call. No test result establishes real model interpretation accuracy.
- Mocked PayPal create/capture/retrieve verifies a six-person split across two segments: four tofu meals plus two chicken meals, HK$428 subtotal + HK$80 delivery = HK$508. Original segment lines and requirements remain in the saved snapshot while item lines consolidate.
- Existing pending/unknown/capturing locks and stale-checkout rejection pass for both new and legacy representations.

### Desktop and mobile browser acceptance

`tests/segment-browser.mjs` ran against a production-mode loopback server, with forced fixture AI/payment, an isolated temporary SQLite database and browser requests restricted to that local origin.

- Desktop 1440×1000 and mobile 390×844: 30 people split into 20 no-known-restrictions, five vegetarian-only, three vegetarian/dairy-free and two no-peanut people.
- Editing a confirmed label revokes confirmation/exclusivity and blocks progression until reconfirmed.
- Review initially totals HK$2,148. Replacing two tofu meals with chicken exceeds a HK$2,160 budget by HK$8 and disables approval. Restoring the meal resolves it.
- Reducing the unrestricted segment's tofu quantity produces a visible shortage. Adding one chicken meal restores its 20-meal count and yields HK$2,078 subtotal + HK$80 delivery = **HK$2,158**. Other segments' actual choices, requirements and quantities stay unchanged. Availability labels correctly change with shared stock.
- Only one `/api/allocate` call occurs during each run; manual edits do not regenerate the order.
- Both viewports complete simulated approval/capture. Confirmation, segment packing and confirmation after reload retain all four segments and final quantities. Read-only confirmation has no meal editing controls.
- Returning to edit an approved segment order preserves its meal choices, invalidates the previous checkout, and causes an old capture request to return HTTP 409.
- A 100-person unrestricted segment allocates using at most 15 item lines. Changing it to vegan and reconfirming returns visible `INFEASIBLE` because stock is insufficient.
- Add/edit/remove controls, shortfall/excess display and the 12-segment UI limit pass.
- Screenshots were inspected; native meal controls have at least 44 px height and no mobile horizontal overflow or JavaScript page errors were observed. This is automated browser verification, not an uncoached human usability test.

Browser screenshots are untracked under `artifacts/segments-*.png`. `browser-smoke.mjs` and `replacement-browser.mjs` are retained as aliases for this current segment acceptance script; their original guest-UI selectors are no longer applicable.

## Compatibility evidence

- Before representation changes, the real local SQLite file was opened read-only. It contained **two legacy fixture orders**, one paid and one stale; both had item snapshots and guest-based assignments. No credentials or original reply content were printed.
- After implementation, read-only payload fingerprints match for **both pre-existing rows**. There was no bulk rewrite, deletion or schema migration.
- The old browser draft key and structure were inspected in the existing code. There was no open in-app GroupTable tab available to inspect an actual user draft. Draft compatibility was therefore verified with synthetic browser storage, without scanning unrelated browser profiles.
- A synthetic unfinished four-person `grouptable-draft-v1` stays byte-for-byte intact. The UI keeps the known event details, invents zero segment counts, shows four unconfirmed people and offers the original draft for download.
- Pure tests safely convert confirmed unique old guest entries into at most 12 requirement groups without mutating the source. Unconfirmed, malformed or more-fragmented drafts are preserved with an explanation instead of guessed counts.
- A synthetic old guest-based order completes its original simulated payment and reloads with its original two guest assignments and packing summary. Its representation remains legacy. Payment mapping, request IDs, item prices and recovery logic are reused rather than migrated.
- New drafts use `grouptable-draft-v2`; old `grouptable-draft-v1` is left intact. Unreadable newer drafts are not automatically overwritten. Explicitly editing an old approved order invalidates its checkout before creating a new segment draft.

## Remaining live and human acceptance — not passed

1. **Real OpenRouter:** use an account-owner-approved project key and budget to test unfamiliar aggregate wording and messy individual replies. Check real interpretation, ambiguity handling, latency and usage. Fixtures and mocked JSON do not establish accuracy.
2. **Real PayPal Sandbox:** create → approve → capture → server-side retrieve/amount/currency/reference verification with actual test accounts, including return URLs, HKD receiving preferences and restart recovery. No real Sandbox account was accessed in this revision.
3. **Human usability:** an unfamiliar person must complete a segment order, fix a count/budget issue and reach confirmation without coaching. No such person participated in automated testing.

A clean setup on another teammate's machine and the final English demonstration video remain outstanding. No private credentials, paid API calls, real funds, real food orders, publishing or Git operations were used. The earlier dependency audit reported zero runtime findings and five development-only entries in the Next ESLint `braces` chain; it was not rerun in this dependency-free revision and is not a new security attestation.

## Changes by subsystem

- Limits/types/logic: `src/lib/limits.ts`, `segments.ts`, `segment-allocation.ts`, `segment-compat.ts`; legacy allocation uses the shared search bound.
- Extraction: `segment-extraction.ts`, `segment-examples.ts`, the shared paid-call gate in `extraction.ts`, and `/api/extract`.
- Ordering/persistence: `/api/allocate`, `/api/orders`, versioned payload support in `store.ts`; PayPal accepts the common stored-order type while its REST/payment logic stays unchanged.
- UI: `GroupTable.tsx`, `SegmentRequirements.tsx`, `SegmentMeals.tsx`, and the existing stylesheet.
- Verification: segment allocation/extraction/checkout/compatibility test files, updated route fixtures, and current segment browser acceptance.
- Documentation: README and this record. Dependencies and the SQLite table layout are unchanged.

## Historical: guest-based manual replacement — 2026-10-23

Nine focused tests were added in that earlier revision; its suite had 59 passing tests in six files. No dependency, database schema, PayPal client or payment-state change was required for that guest-based change.

### Executed with synthetic data and mocks

- A single replacement changes the selected guest only. The input assignments, other guests' meals, and all confirmed requirements are preserved.
- Replacement options exclude incompatible meals, unknown required attributes, unavailable items and quantities consumed by other guests. Releasing the selected guest's current unit leaves their existing meal selectable when stock is fully allocated.
- An over-budget edit retains its proposed assignments and recalculated totals for display, but fails the same validator used by order creation. Correcting the edit restores validity.
- The orders endpoint rejects submitted prices/totals and invalid assignments, including incompatible/unknown meals, duplicate guests, exceeded stock and exceeded budget.
- A server-created edited snapshot contains five tofu meals and one chicken meal: HK$418 subtotal + HK$80 delivery = HK$498. Mocked PayPal create item lines, a completed capture response and a server-side retrieval use and verify this exact final amount and allocation. This was **not a real Sandbox transaction**.
- Existing payment locking, uncertain-result handling and stale-checkout tests still pass.

### Executed in a local browser

`tests/replacement-browser.mjs` ran against the production build with forced fixture extraction/payment and an isolated temporary SQLite database. The browser was restricted to the local test origin. No private credentials or external provider calls were used.

- Desktop 1440×1000 and mobile 390×844: six-person order with HK$500 budget; Guest 04 changed from HK$68 tofu to HK$78 chicken. Counts became five tofu/one chicken; subtotal HK$418, total HK$498, remaining HK$2.
- Replacing Guest 06 as well raised the total to HK$508: HK$8 over budget was displayed and approval disabled. Restoring their tofu meal re-enabled approval while Guest 04's chicken remained selected.
- Each run made exactly one `/api/allocate` request. Manual replacement did not silently regenerate the allocation.
- Both viewports completed simulated checkout. The saved snapshot, confirmation, packing summary and confirmation after reload retained Guest 04's chicken and the HK$498 total. Confirmation offered no replacement controls.
- Returning to edit a separate approved order still invalidated its old checkout: capture returned HTTP 409.
- A 20-person stock-constrained example retained each guest's current meal as the sole selectable option and displayed the no-alternative explanation.
- Meal selectors had at least 44 px height; screenshots were inspected on desktop/mobile; no horizontal page overflow or JavaScript page errors were observed.

Run the optional browser test with an existing Playwright installation and a fixture server. `GROUPTABLE_TEST_URL` may override the default `http://127.0.0.1:3000`; it must match the server's `APP_URL`. Screenshots are saved under the ignored `artifacts/replacement-*.png` paths.

### Files changed

- `src/lib/allocation.ts`: shared replacement options/editing and priced feedback for over-budget validation failures.
- `src/lib/domain.ts`, `src/app/api/orders/route.ts`: reject unexpected assignment fields and client-supplied order prices/totals.
- `src/components/GroupTable.tsx`, `src/app/globals.css`: Review selectors, validation/approval state, totals and responsive layout.
- `tests/replacement.test.ts`, `tests/replacement-checkout.test.ts`, `tests/replacement-browser.mjs`: focused unit, endpoint, mocked-payment and browser coverage.
- `README.md`, `docs/ACCEPTANCE.md`: behaviour, verification evidence and remaining acceptance.

