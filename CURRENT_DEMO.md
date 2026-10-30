# GroupTable — Current Demo

Summary updated on 30 October 2026 from the implementation and executed acceptance checks.

For the complete product idea, including the bounded agent flow, remaining proposals and implementation status, see [Product Idea and Demo](IDEA_AND_DEMO.md). This file continues to describe implemented behaviour only.

## Product Overview

GroupTable is an English-language group meal ordering prototype for a single organiser. It brings dietary requirements, meal quantities, budget checks and checkout into one workflow.

The current demo uses one fictional caterer, Table Kitchen, with 15 sample meals. It supports 1–100 people, up to 12 dietary groups, HKD pricing and a fixed HK$80 delivery fee. Menu availability can limit which orders are feasible.

The 31 October local UI refinement shortens Requirements copy, uses “dietary groups” in controls, and places grouping help, taste mapping/privacy explanations, manual profile preview and successful planner activity behind expandable details. Live AI planning is the primary action when enabled; fixture simulation remains labelled. Confirmation, validation and payment rules are unchanged.

## Motion and interaction

The interface uses a layered CSS lunch-box illustration with bounded mouse tilt on fine-pointer desktop devices and a compact static mobile version. Newly generated meal groups enter once with a short, capped stagger; quantity edits do not replay the entrance. Primary actions have subtle press feedback and the planner shows a bounded loading pulse. Reduced-motion preferences disable spatial/entrance/loading animation, and print output stays static. No new package, planning rule, payment behavior or live-service request is introduced.

## Current Demo Flow

1. **Enter the event details.** Set the total number of people and a budget that includes delivery.
2. **Prepare dietary groups.** Add groups manually, or load a labelled extraction example. Each group has a headcount and requirements, such as vegetarian and no dairy. The extraction interface also accepts pasted replies when live AI is configured.
3. **Review and confirm.** Correct counts and requirements, resolve questions, and confirm that every person belongs to exactly one group.
4. **Optionally add taste preferences.** Select favourite restaurant branches and build a Qloo cuisine profile, or use clearly labelled invented examples. The screen shows how returned cuisines map to selected sample meals.
5. **Plan and adjust meals.** Use the bounded AI planner to request cuisine evidence and a validated allocation, or allocate manually. The planner returns a checked draft or an explanation requiring organiser input. Review its activity, then change meal types and quantities. The review screen updates costs, stock checks and budget feedback immediately.
6. **Approve the order.** The server checks the final selections and recalculates prices before saving the approved order.
7. **Complete checkout and view the summary.** The verified demo uses simulated payment. Confirmation retains the final meal choices and provides a printable packing summary by dietary group.

## Implemented Features

- **Dietary grouping:** editable labels, counts and requirements, source excerpts from extraction, unresolved questions and explicit confirmation. Missing replies are not treated as having no restrictions.
- **Count validation:** group counts must match the event headcount. Overlapping requirements belong within a group; people must not be counted twice.
- **Meal allocation:** searches for a combination that meets confirmed requirements, available quantities and the delivery-inclusive budget. Unknown meal attributes do not satisfy a requirement. Optional Qloo cuisine associations change the order in which compatible meals are tried; the first feasible combination is retained, without claiming optimal taste or group agreement.
- **Bounded AI planner:** model-directed cuisine lookup, existing allocation/validation and verified handoff through three restricted tools. It uses confirmed form inputs, not a conversational editor. Activity is visible; model prose cannot change requirements, prices or initiate checkout. A separate labelled simulation works without a model call.
- **Manual adjustments:** change meals, edit quantities and add or remove meal lines within a group. Other groups remain unchanged, and these edits do not rerun the allocator.
- **Immediate feedback:** shortages, excess quantities, stock conflicts and budget overruns block order approval until corrected.
- **Order consistency:** approved snapshots preserve the final quantities and approval-time prices. Editing an approved order invalidates its previous checkout; unresolved payment operations lock editing and further payment attempts.
- **Saved results:** browser drafts use session storage; approved orders and payment records use local SQLite storage. Confirmation and packing summaries retain the approved selections.

## Demo Data and Service Modes

| Area | Implemented behaviour | Evidence available |
| --- | --- | --- |
| Menu | Fictional meals with prices, dietary labels and per-order availability | Used in local tests and browser verification |
| Example extraction | Ten predefined examples return labelled fixture results; arbitrary replies are not parsed in this mode | Verified with fixtures |
| OpenRouter integration | Server-side request, JSON validation, source matching, count normalisation and error handling | Tested with mocked responses; real model accuracy is not established |
| Qloo taste preferences | Restaurant search, cuisine associations, visible house-authored mappings and taste-prioritised allocation | Real Qloo search/profile/allocation smoke tests passed; desktop/mobile fixture selection, editing and checkout passed separately |
| AI planner | Free-model tool calls request Qloo evidence and validated allocation; the server enforces immutable requirements and allowed recovery actions | Real application run passed with live model and Qloo; separate desktop/mobile fixture acceptance passed |
| Simulated payment | Approval and payment simulation followed by confirmation | Verified in the local browser workflow |
| PayPal Sandbox integration | Order creation, hosted approval, capture and server-side payment verification | Tested with mocked PayPal responses; a real Sandbox cycle is not recorded as passed |

No food is ordered or delivered. Dietary checks rely on sample menu labels and do not verify real-world allergen handling.

## Verification Status

The current automated suite has **134 passing tests across 14 files**, with type checks, lint and production build passing. The 28 October integration check used four real Qloo requests and exercised restaurant search and cuisine profiles through the new application endpoints: two different inputs changed the choices for an otherwise identical event. This does not establish that diners prefer those meals.

On 29 October, two agent application runs used five real free-model requests (API-reported total US$0) and two Qloo requests. The first produced a checked draft, followed by a manual split and simulated checkout at HK$234. The second handled an insufficient budget without changing requirements, headcount or budget. Simulated agent/browser checks passed on desktop and mobile. This is a bounded form-based planning agent; real unfamiliar-reply extraction and real PayPal Sandbox remain separate unverified checks.

The earlier acceptance record dated **23 October 2026** also reports:

- **101 passing tests across 10 files**, plus passing type checks, lint and a production build.
- Browser verification at desktop and mobile sizes using fixture extraction, simulated payment and synthetic data.
- A 30-person workflow covering manual meal changes, budget overruns and correction, checkout, confirmation, packing summaries and reload.
- Checks that edited choices survive checkout and that an invalidated checkout cannot capture the old order through the application.

The current desktop/mobile taste workflow and the original segment browser regression also passed on 28 October: cuisine changes, manual editing, simulated checkout, confirmation and reload. Real Qloo and fixture results are recorded separately in `docs/ACCEPTANCE.md`. Live OpenRouter extraction, a real PayPal Sandbox payment cycle and an unfamiliar person's uncoached use remain unverified in that record.

Source: `docs/ACCEPTANCE.md`.
