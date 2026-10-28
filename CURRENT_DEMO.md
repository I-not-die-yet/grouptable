# GroupTable — Current Demo

Summary prepared on 28 October 2026 from the existing implementation and acceptance record.

## Product Overview

GroupTable is an English-language group meal ordering prototype for a single organiser. It brings dietary requirements, meal quantities, budget checks and checkout into one workflow.

The current demo uses one fictional caterer, Table Kitchen, with 15 sample meals. It supports 1–100 people, up to 12 dietary groups, HKD pricing and a fixed HK$80 delivery fee. Menu availability can limit which orders are feasible.

## Current Demo Flow

1. **Enter the event details.** Set the total number of people and a budget that includes delivery.
2. **Prepare dietary groups.** Add groups manually, or load a labelled extraction example. Each group has a headcount and requirements, such as vegetarian and no dairy. The extraction interface also accepts pasted replies when live AI is configured.
3. **Review and confirm.** Correct counts and requirements, resolve questions, and confirm that every person belongs to exactly one group.
4. **Allocate and adjust meals.** Generate a feasible allocation, then change meal types and quantities. The review screen updates costs, stock checks and budget feedback immediately.
5. **Approve the order.** The server checks the final selections and recalculates prices before saving the approved order.
6. **Complete checkout and view the summary.** The verified demo uses simulated payment. Confirmation retains the final meal choices and provides a printable packing summary by dietary group.

## Implemented Features

- **Dietary grouping:** editable labels, counts and requirements, source excerpts from extraction, unresolved questions and explicit confirmation. Missing replies are not treated as having no restrictions.
- **Count validation:** group counts must match the event headcount. Overlapping requirements belong within a group; people must not be counted twice.
- **Meal allocation:** searches for a combination that meets confirmed requirements, available quantities and the delivery-inclusive budget. Unknown meal attributes do not satisfy a requirement. The allocator finds a feasible combination rather than optimising taste.
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
| Simulated payment | Approval and payment simulation followed by confirmation | Verified in the local browser workflow |
| PayPal Sandbox integration | Order creation, hosted approval, capture and server-side payment verification | Tested with mocked PayPal responses; a real Sandbox cycle is not recorded as passed |

No food is ordered or delivered. Dietary checks rely on sample menu labels and do not verify real-world allergen handling.

## Verification Status

The acceptance record dated **23 October 2026** reports:

- **101 passing tests across 10 files**, plus passing type checks, lint and a production build.
- Browser verification at desktop and mobile sizes using fixture extraction, simulated payment and synthetic data.
- A 30-person workflow covering manual meal changes, budget overruns and correction, checkout, confirmation, packing summaries and reload.
- Checks that edited choices survive checkout and that an invalidated checkout cannot capture the old order through the application.

These are recorded local and mocked results, not newly rerun checks for this summary. Live OpenRouter extraction, a real PayPal Sandbox payment cycle and an unfamiliar person's uncoached use remain unverified in that record.

Source: `docs/ACCEPTANCE.md`.
