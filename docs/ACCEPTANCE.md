# Acceptance record

This record distinguishes executed local checks from live integration and human acceptance. It is not a claim of production readiness. The primary interface now uses dietary segments and quantities; the older guest-based UI record is retained at the end as history.

## Teammate payment-race fix integrated locally — 2026-10-30

- Applied the reviewed changes from commit `425939d05095c0ef496dfd6aadb0b2628eedeaae` by GitHub account UHTHU to `src/lib/paypal.ts` and `tests/payments.test.ts`. Both resulting files match that commit's Git blob hashes. Existing local Qloo/agent additions were preserved; no branch, commit, merge or push was performed.
- Reconciliation reads and updates the latest order inside a transaction. Delayed status responses cannot overwrite a newer capture submission, and delayed errors do not overwrite newer capturing, paid or stale states.
- **132 tests pass across 13 files** in the actual project checkout. Type checking, full ESLint and the production build pass. This includes the four added race cases and existing Qloo/agent regressions.
- Previously, the added cases failed against the old payment implementation in an isolated copy; the reviewed fix made all pass. This is synthetic regression evidence, not a recorded real-payment incident.
- No UI polish, dependency installation, provider inference, real PayPal request, database migration or publishing was done. Browser/live-service acceptance was not rerun for this payment-only integration; the earlier records remain separate.

## Integrated bounded planner — 2026-10-29

### Implemented behaviour

- Requirements offers a separate **Plan with AI** / labelled simulated-planner action. Confirmed event inputs remain authoritative; selected branches can be passed without manually building a taste profile. The model requests cuisine evidence, allocation/independent validation and an allowed organiser handoff. No conversational editor, automatic restaurant search/disambiguation, extraction redesign, database change, package installation or payment tool was added.
- The live model is fixed to `nvidia/nemotron-3.5-lightning:free`, with zero provider price ceilings and no fallback/retry. Three requests per run, 18 per process, one run at a time, 30 seconds per model request and a 90-second run deadline bound usage. Nonzero reported cost blocks further planning for review. No paid extraction mode was enabled.
- Tools cannot change budget, headcount, requirements or prices. Extra arguments, unselected branches, repeated operations, unsupported tools and inconsistent handoffs are rejected. Raw model prose is never displayed: canonical result/recovery messages prevent the earlier probe's dietary-relaxation suggestion reaching the organiser. Model inputs omit original replies, excerpts, labels and credentials.
- Review shows factual tool activity, with real/local/simulated sources. Manual edits never restart the planner. Existing approval, checkout invalidation and payment locks are reused. Agent trace/taste selection are temporary; approved meal snapshots retain existing persistence.

### Files changed

- Planner: `src/lib/agent.ts`, `src/lib/agent-types.ts`, `src/app/api/agent/plan/route.ts`.
- Interface: `src/components/GroupTable.tsx`, `src/components/TastePreferences.tsx`, `src/app/page.tsx`, `src/app/globals.css`.
- Verification: `tests/agent.test.ts`, `tests/agent-browser.mjs`.
- Setup/documentation: `.env.example`, README, CURRENT_DEMO, IDEA_AND_DEMO and this acceptance record. Local `.env.local` only gained the ignored free-planner mode setting; secrets were not copied into tracked files.

### Executed tests and build

- **128 tests pass in 13 Vitest files**, including 15 new planner tests. Typecheck, ESLint and production build passed. Tests cover fixture/no-network isolation, correct model/tool calls, privacy of raw input, immutable event constraints, forged tool arguments, unselected IDs, repeated operations, invalid independent validation, distinct search-limit handling, provider/auth/rate-limit/timeout/malformed responses, quota/concurrency, nonzero-cost lockout and final edited snapshots. Unit tests use synthetic credentials and mocked external APIs.
- Final production fixture browser acceptance passed at desktop 1440×1000 and mobile 390×844 via `tests/agent-browser.mjs`. It covered unconfirmed-input blocking, selecting a fixture restaurant without manually building a profile, a three-step simulated activity record and a two-pasta draft. A manual one-pasta/one-chicken split remained HK$234 through simulated checkout, packing, confirmation and reload, with no extra planner request. Editing invalidated the prior checkout; stale capture returned HTTP 409.
- A separate HK$100 fixture scenario returned `INFEASIBLE`, no draft and unchanged requirements/headcount/budget. Explicitly changing budget and rerunning succeeded. New controls measured at least 44px; no horizontal overflow or page errors were found. Eight screenshots under ignored `artifacts/agent-*.png` were inspected. The existing segment browser regression also passed again. All browser external requests were blocked; no real provider call occurred in those runs.

### Executed live application acceptance

Two application-level runs used exactly **five real free-model requests**, with API-reported total model cost **US$0**, and **two real Qloo requests** (one branch search plus the agent's profile lookup). Original extraction and payment were forced to fixture modes, and a separate temporary database was used.

1. The model requested `get_cuisine_profile` for the selected branch; real Qloo returned a profile; the model requested `allocate_meals`; the actual server allocator/independent validator produced a valid two-person draft; the model selected the verified `finish_plan` handoff. All three activity steps came from executed tools, not a fixture trace.
2. After an explicit manual edit to one pasta and one chicken meal, the application created the server-priced HK$234 snapshot, completed simulated approval/capture and retrieved the same final assignments. This is not a real PayPal Sandbox transaction.
3. A second planning run with HK$100 and no taste seeds used two real model requests. The allocator returned `INFEASIBLE`; the model chose the allowed organiser-decision handoff. The displayed response preserved requirements/headcount/budget and did not suggest relaxing diets. No additional Qloo lookup occurred.

These checks establish one successful integrated live-model/Qloo planning path plus one live infeasibility path. They do not establish universal model reliability, real unfamiliar-reply extraction, preference quality, real PayPal acceptance, public hosting, competition approval or uncoached human usability. Raw live responses remain outside the repository in private temporary files. No secrets were printed or published, and no Git mutation was performed.

## Earlier standalone OpenRouter probe — 2026-10-29

Historical pre-integration check; the integrated acceptance above supersedes its unimplemented-agent status.

A standalone capability probe used the authorised local OpenRouter key and `nvidia/nemotron-3.5-lightning:free`. The public model catalogue was checked first for zero pricing and `tools` / `tool_choice` support. Requests fixed this free model, disabled provider fallback and set provider prompt/completion/request price ceilings to zero. No application settings or source code were changed.

Exactly three real inference requests returned HTTP 200; each API usage response reported cost US$0:

1. Given a confirmed synthetic event and an explicitly selected invented restaurant branch, the model requested `get_cuisine_profile` with the correct branch ID.
2. After receiving a synthetic cuisine-profile tool result, it requested `allocate_meals` with the correct six-person headcount, two vegetarian people, HK$100 delivery-inclusive budget and profile ID. Structured argument checks passed.
3. After a synthetic `INFEASIBLE` result explaining the HK$488 minimum, it issued no further tool call and asked the organiser for a decision instead of claiming success or automatically increasing the budget.

**Semantic issue observed:** the final reply also suggested changing headcount, restaurant or dietary requirements. In particular, relaxing dietary requirements must not be offered as a budget remedy. A production agent needs a narrower set of permitted recovery choices and a regression check for this wording/behaviour. The reply did not change stored requirements, approve a payment or execute another action.

This establishes that the key and one free model were usable for this short tool-calling exchange from this environment. It does not establish comparative model quality, ongoing availability, real extraction accuracy or successful application integration. The alternate free candidate was not called because the first model completed the three-request probe.

Cuisine and allocation tool results were stubs, not real Qloo calls or execution of GroupTable's allocator. No real user replies, Qloo records, payment service, paid model, installations, Git operations or publishing were involved. At that earlier probe stage, the application agent was still unimplemented. The later integrated checks above supersede that status; unfamiliar-reply extraction, real PayPal Sandbox and uncoached human testing remain outstanding. Keys were never included in prompts, output or this record.

## Qloo cuisine-priority extension — 2026-10-28

### Implemented

- Optional restaurant search and selection (up to three explicit branches), cuisine-profile lookup and visible house-authored menu mapping on Requirements. Review retains the provenance explanation. Invented fixtures are clearly labelled and never substitute silently for failed live responses.
- Only five unambiguous cuisine-inspired sample dishes have coarse mappings; other dishes remain neutral. Dietary/sustainability associations are excluded from the cuisine whitelist and cannot alter confirmed restrictions or unknown attributes.
- Session-owned, expiring server-held profiles supply ranking to the existing bounded allocator. Submitted scores are rejected. Hard dietary, stock, quantity, budget and independent validation checks still govern feasibility. A corrected lower-bound calculation remains valid when preferred meals are more expensive than later choices.
- Manual replacement, approved snapshots, consolidated PayPal lines, confirmation, packing and payment locks reuse the existing paths. No dependency, core request schema or database table change was made. Local secret settings remain ignored; no Git/publishing action was performed.

### Executed automated and real-service checks

- **113 tests pass across 12 Vitest files**. Type checking, ESLint and a production build pass. New tests cover changed cuisine inputs with the same event, affordable fallback, incompatible/unknown/unavailable meals, shared stock, manual-edit preservation, neutral mappings, search limits, session ownership/expiry, forged ranking/price rejection, empty/malformed/error responses, no retries, concurrency/call limits and fixture isolation.
- Mocked PayPal verification follows a taste-informed allocation manually edited to one pasta and one chicken meal: HK$154 meal subtotal + HK$80 delivery = HK$234. Final saved quantities, payment item names/total and completed verified capture agree. This is not a real PayPal Sandbox transaction.
- **Four real Qloo hackathon requests** ran through the implemented local application endpoints: two restaurant searches and two tag-profile calls using the authorised key, public restaurant queries and synthetic event requirements. Both returned parseable profiles with menu matches. For the identical two-person event/menu/budget, the no-taste baseline was two tofu meals (HK$216 including delivery); the two profiles produced two egg-fried-rice meals (HK$220) and two mushroom pasta meals (HK$232). This demonstrates causal influence on selection within this test, not evidence of diners' preference or satisfaction. Raw Qloo records/affinities are retained only in temporary private files, not this repository.
- The live smoke server forced OpenRouter extraction and payment to fixture modes and used a separate temporary SQLite database. No language-model call, real payment, personal dietary reply, publishing or Git operation was used.

### Browser verification

- `tests/taste-browser.mjs` passed against the final production build at desktop 1440×1000 and mobile 390×844. The browser blocked all external requests; AI, Qloo and payment were forced to fixture modes, using an isolated temporary database.
- The same two-person event initially chose tofu with no taste profile. The invented Italian profile changed it to two pasta meals; the invented Cantonese profile changed it to egg fried rice. Search with no results and clearing a profile both worked. Switching a preference required explicit allocation; manual changes did not silently call `/api/allocate`.
- A manual split of one pasta and one chicken meal yielded HK$234 including delivery and persisted through simulated approval/capture, confirmation, packing and reload. No claim of real PayPal payment is made.
- Requirements, Review and Confirmation had no horizontal overflow at either width; browser page errors were zero. New taste controls and meal editing controls measured at least 44px high after correction. Screenshots were inspected at both sizes, with no material new visual issue observed. This was automated verification, not an unfamiliar human test.
- Final screenshots: ignored `artifacts/taste-{requirements,review,confirmation}-{desktop,mobile}.png`.
- The existing `tests/segment-browser.mjs` also passed again against the final build, covering the earlier 30-person editing/checkout, stale-checkout rejection, 100-person infeasibility and compatibility workflows.

### Still unverified

Real OpenRouter extraction and an unfamiliar person's uncoached workflow remain outstanding. A real PayPal Sandbox cycle remains separate and unverified; it is not established by Qloo success or simulated checkout. These checks, competition eligibility/submission acceptance, public hosting and multi-person recommendation quality are not implied by the Qloo smoke test.

## Current implementation: dietary segments

- Requirements: event headcount/budget, up to 12 mutually exclusive segments, editable positive counts/labels/requirements, relevant source excerpts, unresolved questions and explicit confirmation. Editing a segment revokes confirmation. No-known-restrictions groups require explicit approval; missing people remain unconfirmed.
- Coverage is visible beside the event headcount. Shortfalls and excess block allocation. The organiser must also confirm that each person is counted once.
- Extraction: OpenRouter remains the provider, with the same paid-use flag, one concurrent request, 20-call process cap, 8,000-character input cap, 4,000-token output limit, 30-second timeout, and no automatic retry/fallback. Aggregate and individual inputs use a segment normalizer. Included counts inherit parent requirements and are subtracted once; ambiguous overlap stays unresolved. Duplicate/conflicting people are counted once and remain reviewable. All model-derived segments are unconfirmed.
- Review: quantities of multiple meal types per segment, per-segment subtotal and validation issues; manual meal/quantity/add/remove edits preserve other segments and never rerun the whole allocation. Availability releases the edited segment's allocation before accounting for other segments. Unknown attributes do not satisfy requirements.
- Checkout: server validation and prices are authoritative. Final segment quantities are saved with approval-time item names/prices. Identical meals consolidate into PayPal item lines; packing retains the segment breakdown. Sandbox-only payment and existing session/origin/idempotency/uncertain-result locks remain in place.
- The original segment revision introduced no new package, database redesign, public deployment, Qloo or paid service usage. The later Qloo extension is recorded above.

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

