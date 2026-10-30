# GroupTable

A local-first group meal ordering prototype. Enter dietary segments with quantities or extract them from anonymous replies, review mutually exclusive counts, allocate meal quantities, and check out with PayPal Sandbox.

**This is a hackathon prototype. No food is ordered or delivered. Fixture payment is a simulation, and Sandbox payment uses test funds.** Dietary checks use demonstration labels; they do not establish real allergen safety or cross-contact controls.

## Requirements

- Node.js **24.19.0** (see `.nvmrc`) and npm. Node's built-in `node:sqlite` is used; no database server is needed. This API is a release candidate in the pinned runtime.
- One local Node server and a modern browser, on the same machine.
- Optional: an OpenRouter project key with an account-owner-approved spending cap, and PayPal Sandbox application credentials.

The application uses English UI, HKD, a fixed HK$80 delivery charge, one fictional supplier, 15 meals, 1–100 people and at most 12 dietary segments. These are prototype bounds, not a guarantee of sufficient menu stock or feasibility. Stock applies to each demonstration order independently. Prices are integer cents. Optional Qloo cuisine associations can prioritise mapped meals. This is a first-feasible search, not taste optimisation or a guarantee of group agreement. There is no account system, real delivery or production payment mode.

## Install and run

Run each command separately from this project directory. Dependency installation downloads packages from the npm registry; ask the machine owner before installing tools or packages.

1. Install dependencies: `npm ci --ignore-scripts`
2. Copy `.env.example` to `.env.local`. Defaults use fixtures; no credentials are required.
3. Start the local application: `npm run dev`
4. Open **http://127.0.0.1:3000** (use this exact host, not `localhost`).

The browser URL, `APP_URL`, PayPal return URLs and port must match. If port 3000 is occupied, stop the other application or explicitly change `APP_URL` and the Next port together. Requests from other origins are rejected.

For a production-mode local build, run `npm run build`, then `npm start`. Keep the server bound to loopback. This application has not been designed or hardened for public deployment.

## Try the fixture workflow

1. Open **Extract segments from counts or replies** and choose **30 people, four exclusive segments**.
2. Select **Load example**, then **Extract example segments**. This loads labelled fixture data, not AI output. Arbitrary input is not parsed in fixture mode.
3. Review labels, counts, supported requirements and source excerpts for the four segments. Confirm each segment, including the no-known-restrictions group, and confirm that each person is counted once.
4. Select **Allocate meals**. Review meal types, quantities, each segment's subtotal and shared menu availability.
5. Change meal types or quantities, add/remove meal lines, and correct any count, stock or budget issue before **Approve order & continue**.
6. Select **Simulate PayPal approval**, then **Complete simulated payment**. Print the packing summary by segment or refresh the confirmation; simulation remains clearly labelled.

The ten current examples cover exclusive aggregate counts, inclusive counts, grouped individual replies, ambiguous overlaps, missing replies, conflicts, duplicates, unidentified people, unsupported certification and instructions inside input. Old guest fixtures remain only for legacy regression tests.

### Count people once

Each segment has a stable ID, editable label, positive integer headcount, supported requirements, unresolved questions, confirmation status and source excerpts. Requirements may overlap **within** a segment; segments themselves must be mutually exclusive.

For 30 people, `20 no known restrictions + 5 vegetarian only + 3 vegetarian/dairy-free + 2 no peanuts` is valid. `10 vegetarians, including 3 dairy-free` becomes seven vegetarian-only plus three vegetarian/dairy-free. The extraction normalizer subtracts included quantities once and inherits parent requirements. Ambiguous relationships, impossible included counts and unsupported needs remain questions for human review. Mocked structured output does not prove the real model will interpret wording correctly.

The UI shows the segment sum beside the event headcount. A shortfall remains **Requirements not confirmed: N people**; an excess blocks allocation. Missing replies never become a no-restrictions group. Editing a segment revokes its confirmation and the event's exclusivity confirmation. Unresolved questions must be explicitly resolved before confirming; a no-known-restrictions segment needs a separate explicit confirmation.

Individual replies are grouped by matching interpreted requirements. Duplicate or conflicting replies for the same identifier are counted once and kept unresolved with evidence. Unidentified people are not assigned guessed counts. If an interpretation needs more than 12 segments, no partial/truncated set is silently accepted; review the preserved text manually.

### Adjust quantities before checkout

Each segment can contain multiple meal types, such as six tofu boxes and four lentil boxes for ten people. Replacement options use confirmed dietary attributes and release the selected segment's existing allocation before calculating stock remaining after **other segments**. Unknown attributes never satisfy a requirement. Options also avoid introducing duplicate meal lines within a segment; adjust the existing quantity instead.

Manual edits affect only that segment. They do not rerun the allocator. Partial, excessive, incompatible, out-of-stock or over-budget edits stay visible with shared-validator feedback, but approval remains disabled. Every segment needs exactly its confirmed headcount of meals, quantities must be positive integers, and stock is shared across all segments. Delivery is charged once per order.

The server independently validates the final quantity assignments and recalculates catalog prices. Submitted prices/totals and unexpected assignment fields are rejected. Approved snapshots retain segment counts, requirements and final meal quantities, with names/prices fixed at approval. PayPal lines consolidate the same meal across segments; confirmation and packing retain the segment breakdown.

Replacement controls stop after approval. **Edit order** invalidates its old checkout before reopening Review with the saved choices. Capturing, pending and unknown states retain their existing editing/payment locks. Guest-based old orders use the compatibility path below.

## Optional Qloo taste preferences

On Requirements, search for favourite restaurant branches, select up to three, and build a taste profile before allocating. Fixture mode uses three invented restaurants; search **Example**. Their names and association scores are synthetic, not stored Qloo responses. Nothing is sent to Qloo in fixture mode.

To use the authorised hackathon key, set these values only in your ignored `.env.local`, then restart:

```dotenv
QLOO_MODE=live
QLOO_API_URL=https://hackathon.api.qloo.com
QLOO_API_KEY=your_hackathon_key
```

The server searches `/search` and requests cuisine tag affinities from `/v2/insights` with `filter.type=urn:tag`, `filter.tag.types=urn:tag:cuisine:qloo` and the selected restaurant entity IDs. Search shows branch addresses for explicit selection, excludes generic bars/cafes, and has no automatic fallback to fixtures. Restaurant names/IDs go to Qloo; dietary replies and payment details do not. The API key stays server-side; the host is fixed to the hackathon service and redirects are refused. Access lasts only as long as the hackathon key remains valid.

A small house-authored mapping in `src/lib/taste.ts` links Chinese/Cantonese associations to Chinese-inspired fried rice, beef and peanut noodles; Italian to mushroom penne; Indian to paneer. These are broad culinary bridges, not Qloo ratings of our fictional meals. Ambiguous meals remain unmapped. Only recognised cuisine tags contribute: dietary and sustainability tags cannot create dietary requirements or certify safety. Missing mappings produce a visible explanation and leave allocation price-first.

Matched meals are tried before neutral meals; price/ID break ties. The existing 50,000-state search, shared stock, dietary checks and delivery-inclusive budget still apply, including affordable alternatives when preferred meals cost too much. This is one combined starting preference for the event, not per-person fairness, maximum satisfaction or a probability of liking a meal. Review shows input restaurants, returned cuisines and the mapping reasons. Manual changes remain authoritative and never regenerate choices.

Qloo lookups happen only on explicit button presses: one request per search or profile, one in flight, 30-second timeout, no retries, and a 20-call Node-process cap including failures. Restart resets that cap; it is not a monetary guarantee. Selections and profiles are session-owned, held in server memory for one hour, with at most 100 entries per cache. Restart, expiry or cache eviction requires another lookup. No Qloo records are committed to source control. Taste evidence is temporary; final approved meal choices and prices persist in the existing order snapshot. No database schema or request data-model migration is required.

Changing seeds or clearing a profile invalidates the draft allocation. Lookup errors preserve dietary input and let the organiser clear taste preferences and continue. Approved orders must use the existing **Edit order** path before changing choices; payment locks remain unchanged.

Official reference: [Qloo taste analysis](https://docs.qloo.com/reference/taste-analysis).

## Bounded AI planner

After confirming dietary segments and exclusivity, optionally search and select restaurant branches, then press **Simulate AI planner** or **Plan with AI**. Building a taste profile manually is not required. The agent requests `get_cuisine_profile` when branches are selected, requests the existing allocation/independent validator through `allocate_meals`, then uses `finish_plan` to hand back a verified draft or a permitted next step. Without selected restaurants it can allocate directly. Review retains a factual activity record; manual edits never restart the agent.

`AGENT_MODE=fixture` is the default: the sequence is deterministic and labelled as simulated, with no model call. Selected restaurants require `QLOO_MODE=fixture` in this mode; otherwise the server refuses rather than making an unexpected live lookup. The existing **Allocate meals** button remains available independently.

For the tested free-model path, set locally and restart:

```dotenv
AGENT_MODE=live
OPENROUTER_API_KEY=your_project_key
```

Set `QLOO_MODE=live` and the Qloo credentials above to combine it with real taste evidence. Live AI with fixture Qloo is also explicitly labelled by the activity sources. Real extraction and payment have separate mode switches; enabling the planner does not enable either.

The planner uses the fixed `nvidia/nemotron-3.5-lightning:free` model, zero provider prompt/completion/request price ceilings, no provider fallback, no model fallback, no paid tools and no retries. It does not use the paid extraction model or `ALLOW_PAID_AI` gate. Limits: one concurrent planning run per Node process, at most three model requests per run, at most 18 model requests per process, 1,500 output tokens per request, 30 seconds per model request and a 90-second run deadline. A run is refused unless three request slots remain. Restart resets the local counters; free-service availability and account rate limits remain outside the application's control. Reported nonzero model cost blocks further planning in that process for usage review.

The model receives anonymous segment IDs/counts/requirement codes, event amounts and selected restaurant IDs, plus necessary cuisine/allocation tool results. Original replies, source excerpts, editable labels, keys and payment details are omitted. Use synthetic or consented inputs; service-side data policies still apply. The endpoint is `POST /api/agent/plan` with `{ request, restaurantIds }`, using existing origin/session controls.

The server holds the confirmed event. Tool schemas cannot change its requirements, budget, headcount or prices; payment/approval tools do not exist. It rejects invented tool names, extra arguments, unselected branches, repeated operations and handoffs inconsistent with the verified result. Model prose and private reasoning are not displayed. Public activity and recovery messages are rendered from verified tool results and an allowed action set, so a suggestion to relax dietary requirements cannot reach the organiser through model free text.

`INFEASIBLE` asks the organiser to review availability or decide whether to increase the budget; it never changes constraints. `SEARCH_LIMIT` remains distinct. Failed Qloo requests ask for another selection or explicit clearing of taste preferences; they do not silently allocate without requested taste. Incomplete/invalid model output leaves manual planning available. The first feasible result remains the allocator's goal; this agent is not a new preference/fairness optimiser.

Agent activity and taste evidence are temporary browser state; approved choices still use the existing SQLite snapshot. Refreshing a draft does not restore its activity, but paid/approved snapshots retain their existing restoration path. No database migration, new dependency, conversational editor or automatic checkout was added.

## Enable real AI extraction

The separate dietary-extraction path below uses a paid model through OpenRouter. The free planner above has its own restricted mode and does not enable extraction. The account owner must approve the use, create a dedicated project key and configure a provider-side monetary cap before enabling live mode. Do not paste keys into chat, source files, screenshots or shared documents.

Set these values in your untracked `.env.local`, then restart the server:

```dotenv
AI_MODE=live
ALLOW_PAID_AI=true
OPENROUTER_API_KEY=your_project_key
OPENROUTER_MODEL=qwen/qwen3.5-flash-02-23
```

The server calls `https://openrouter.ai/api/v1/chat/completions` with JSON output, then validates it with Zod. Model availability and the particular provider's JSON support must be tested with the actual account. There is no silent model fallback. An unavailable model produces a visible error and leaves manual entry usable.

The application allows at most 20 requests per Node process lifetime, one in flight at a time, 8,000 input characters, 4,000 maximum output tokens and a 30-second timeout. Failures count towards the limit. There are no automatic retries. **These are request limits, not a dollar cap.** Review the OpenRouter dashboard before restarting, because restart resets the local counter. Development hot reload preserves it within the process. Multiple servers each have their own counter; run only one.

Only paste anonymous test messages unless you have permission to send the data to OpenRouter and its selected provider. Raw messages are not logged or stored in the database, but the browser draft retains them in session storage until the tab session ends or site data is cleared. The provider may have its own retention policy.

## Enable PayPal Sandbox

1. Sign in to the PayPal Developer Dashboard and create/select a **Sandbox** REST application.
2. Obtain its client ID and client secret. Use a separate Sandbox personal buyer account for approval; the merchant and buyer must be different test accounts.
3. Set the following locally, then restart:

```dotenv
PAYMENT_MODE=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
```

Create a new order after switching modes. Existing fixture orders remain fixtures permanently.

First test a one-person order with the server-calculated fixed total. The flow is create → PayPal hosted approval → return → **Capture & verify Sandbox payment** → server-side fetch verifying the result. No real money is used. HKD is the only supported currency in this implementation; if it fails, inspect the test account and receiving preferences rather than silently changing currency.

The application uses the fixed host `https://api-m.sandbox.paypal.com`, with no Live setting. The server constructs item lines plus delivery, stores create/capture request IDs before sending requests, and verifies the internal order references, remote order ID, completed status, capture ID, amount and currency before marking an order paid. It never trusts the browser's success indication.

### Interrupted or pending payments

- Cancelled approval does not mean payment completed. Resume the same checkout or edit the order if no operation is unresolved.
- **Check payment status** makes one explicit server-side retrieval; there is no background polling.
- If capture is pending or unknown, editing and a new payment are locked. Check status or inspect the Sandbox dashboard; do not make a second payment.
- If order creation lost its response before the remote ID was saved, **Recover original checkout request** replays the original body and request ID, only within one hour of the internal order's creation. A GET status request never creates a PayPal order. Recovery is refused outside this window; inspect Sandbox manually.
- A server restart turns interrupted creation/capture into unknown, preserving the lock and mapping.
- If payment remains unknown, preserve the database and give the account owner the internal order ID. Check the Sandbox transaction in the dashboard before any manual recovery. Do not delete the database to bypass an uncertain outcome.
- Editing invalidates the former checkout server-side. An old PayPal browser page cannot capture an inactive order through this app.

Credentials are held server-side. The local session cookie associates a browser with its orders; clearing that cookie prevents that browser from reading its old orders. The database is not a user-account system.

## Interfaces and storage

| Endpoint | Purpose |
| --- | --- |
| `POST /api/agent/plan` | Bounded model-directed taste/allocation tools and verified organiser handoff |
| `POST /api/taste/search` | Search restaurant branches using Qloo or labelled fixtures |
| `POST /api/taste/profile` | Build a session-owned cuisine profile and explain menu mappings |
| `POST /api/extract` | Extract candidate requirements, evidence and unresolved questions |
| `POST /api/allocate` | Return an allocation or `UNRESOLVED`, `INFEASIBLE`, `SEARCH_LIMIT` |
| `POST /api/orders` | Validate assignments and persist a server-priced snapshot |
| `GET /api/orders/:id` | Read the session-owned order |
| `POST /api/orders/:id/paypal` | Create/resume the same payment attempt |
| `POST /api/orders/:id/capture` | Capture and verify the current approved checkout |
| `GET /api/orders/:id/payment` | Retrieve and reconcile payment state |
| `POST /api/orders/:id/invalidate` | Invalidate checkout before editing |

The segment allocator searches directly over item quantities per segment, bounded by 50,000 states, and uses an independent validator. It never expands the event into 100 guest assignments. It finds the first feasible combination in stable price/ID order, or cuisine-priority then price/ID order when an optional server-held taste profile is supplied. Neither path guarantees a globally cheapest or best-tasting order. The existing allocation payload remains supported; the taste path uses `{ request, tasteId }` and rejects client-supplied scores. Inadequate compatible stock can return `INFEASIBLE`; exhausted search returns `SEARCH_LIMIT`, which is not proof of infeasibility. Complex cases can reach that bound even at a supported headcount.

Limits are defined centrally in `src/lib/limits.ts` and used by UI, request schemas, extraction and allocation. Version-2 requests contain `version: 2`, event headcount/budget/currency/delivery/revision, `exclusiveConfirmed`, and `segments`. Each meal assignment is `{ segmentId, itemId, quantity }`; no client price is accepted. The segment types and strict schemas are in `src/lib/segments.ts`. The existing endpoint paths are reused. Legacy request/allocation shapes remain accepted for saved-order compatibility and regression tests; they do not define the primary interface.

Menu fixtures are in `src/data/menu.json`. The SQLite file defaults to `data/grouptable.sqlite` and can be changed with `GROUPTABLE_DB_PATH`. Orders store segment requirements, headcounts and approved quantities but omit original source excerpts. New snapshots carry `request.version: 2`; old guest-based payloads remain in their original representation. State transitions use synchronous SQLite transactions before external payment calls. The database and its WAL side files are untracked. Do not run multiple Node servers against it. Back up the data directory only while the application is stopped.

## Existing-order and draft compatibility

No database redesign or bulk migration is performed. Existing order IDs, item/price snapshots, PayPal mapping, idempotency keys and payment locks are preserved. Old saved orders still show their original guest-based packing summaries and support the original payment/recovery endpoints. Reading an old order does not convert its representation or replace its snapshot. Existing interrupted-payment recovery can still mark an in-flight status as unknown, as before.

On an explicit **Edit order**, a safely confirmed old allocation can be grouped into a new segment draft while preserving its meal quantities; the old checkout is invalidated first. If its requirements cannot be converted safely, the application preserves the original order and explains that segment counts need manual review.

New browser drafts use `grouptable-draft-v2`. `grouptable-draft-v1` is left intact. Fully confirmed, unambiguous old drafts with at most 12 distinct requirement groups can be converted using the original one-person-per-ID counts. Unfinished, malformed or too-fragmented drafts are not guessed: valid event details are retained where possible, no segment counts are invented, and **Download preserved draft** keeps the original available for review. An unreadable version-2 draft is not overwritten unless the user explicitly starts saving a new draft while keeping a backup.

## Verification

Run independently:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Tests use synthetic input, temporary databases, and mocked external APIs. They do not spend credits, contact private accounts, or prove live LLM extraction quality or live PayPal compatibility. `tests/agent-browser.mjs` covers the simulated planner, activity, manual edits, infeasibility and simulated checkout; it targets the isolated fixture test server on port 3031. `tests/taste-browser.mjs` covers fixture cuisine changes, manual edits and simulated checkout at desktop/mobile sizes; run it only with forced fixture modes, like the segment workflow below. The current segment fixtures and mocked adapter tests validate data handling and count normalization, not real extraction quality. Unfamiliar aggregate wording and messy individual replies must still be tested with the actual approved OpenRouter account. Historical guest-adapter tests remain as regressions, not current UI acceptance.

`docs/ACCEPTANCE.md` records actual evidence separately from remaining live checks. A clean setup on another teammate's machine and an unfamiliar person completing the order without coaching are still required.

`tests/segment-browser.mjs` is the current optional browser acceptance entry point. It uses an existing Playwright installation without installing one, synthetic data and fixture payment. Set `GROUPTABLE_TEST_URL` to match the local server's `APP_URL`, and `PLAYWRIGHT_MODULE` if using an existing installation outside this project. The earlier `browser-smoke.mjs` and `replacement-browser.mjs` entry points delegate to this segment workflow. Do not point these synthetic-data tests at an application connected to live services.

## Submission and demo

Include public source, MIT license, complete setup instructions and an English public YouTube video under three minutes. The video must show the working application, not substitute for it. Obtain explicit approval before publishing any repository or video. Do not include secrets in either.

Suggested sequence: messy anonymous replies → correct a requirement → confirmed allocation → impossible budget → restore the budget → real Sandbox checkout → verified confirmation and packing summary. Use live AI for the final recording and disclose the fictional catalog. Judges need their own valid credentials or a private access arrangement accepted by the organiser; no keys belong in public setup files.

Official references: [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), [OpenRouter JSON outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [PayPal Orders](https://developer.paypal.com/api/orders/v2), [PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency/), [PayPal competition rules](https://paypalaihackathon.devpost.com/rules).
