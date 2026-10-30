# GroupTable — Product Idea and Demo

Prepared for team discussion on 29 October 2026.

This document combines the current working prototype, its implemented bounded AI planner and remaining proposals. **Implemented behaviour and planned behaviour are labelled separately.** The planner was integrated and tested on 29 October; broader conversational behaviour remains a proposal.

## 1. The idea

GroupTable helps an organiser turn a team's dietary replies, budget and food preferences into a checked, editable meal plan, then retain the approved choices through checkout and a packing summary.

The working audience is someone arranging colleagues' or team meals. The exact initial customer segment, paying customer and software price are undecided.

The problem we aim to address is the coordination work around a group order: interpreting replies, avoiding double-counting, matching meals to dietary requirements, checking quantities and costs, and communicating the final choices. Whether GroupTable saves enough effort to justify switching from an organiser's current method remains a hypothesis to test with real users.

The product has two distinct inputs:

- **Requirements:** confirmed dietary conditions, meal quantities, budget and availability. These must be satisfied.
- **Preferences:** cuisine associations derived from favourite restaurants through Qloo. These influence the starting meal choices without overriding requirements.

## 2. What the current demo does — implemented

The English-language prototype supports one organiser, one fictional caterer, 15 sample meals, 1–100 people and up to 12 mutually exclusive dietary segments. It uses HKD and a fixed HK$80 delivery fee.

The current flow is:

1. **Enter event details.** Set the number of people and the total budget, including delivery.
2. **Prepare dietary segments.** Enter counts manually or load labelled extraction examples. The OpenRouter adapter also supports requesting candidate segments from pasted replies when live AI is configured; its real-model quality remains unverified.
3. **Review and confirm.** Resolve unclear replies, correct counts and confirm each segment. Every person must be counted once. Missing replies do not become unrestricted diets.
4. **Optionally add taste preferences.** Search restaurants, select up to three exact branches and build one combined Qloo cuisine profile for the event.
5. **Prepare a draft.** Choose the bounded AI planner to request cuisine evidence and a checked allocation, or use manual allocation. Both paths retain confirmed requirements, shared stock and the delivery-inclusive budget.
6. **Adjust the selection.** Change meal types and quantities on Review. Costs and validation feedback update immediately. Other segments remain unchanged, and manual edits do not silently regenerate the allocation.
7. **Approve and check out.** The server independently validates the final assignments and recalculates prices before saving the approved order. Simulated payment is verified; a real PayPal Sandbox cycle remains unverified.
8. **View the result.** Confirmation and the printable packing summary retain the approved meal quantities and prices, including after reload.

No food is ordered or delivered. Menu stock, prices and dietary labels are demonstration data. The dietary checks do not establish real allergen safety or cross-contact controls.

## 3. How Qloo contributes — implemented, with limits

Qloo supplies restaurant identities and cuisine associations. GroupTable connects selected associations to the fictional menu using a small house-authored mapping:

| Qloo cuisine association | House mapping to sample meals |
| --- | --- |
| Chinese / Cantonese | Chinese-inspired egg fried rice, ginger beef and peanut sesame noodles |
| Italian | Italian-inspired mushroom penne |
| Indian | Indian-inspired paneer tomato rice |

Only these five meals currently have mappings. Other meals remain neutral. Qloo does not directly rate our fictional meals; the bridges are GroupTable's own broad culinary interpretations.

Mapped meals are tried first, with price and item ID breaking ties. The allocator keeps the first feasible result. It does not maximise group satisfaction, optimise individual fairness or measure agreement between diners. The restaurant seeds form one shared event profile, not separate profiles for every person.

The interface shows the selected restaurants, returned cuisine associations and mapping reasons. Empty results or absent mappings are explained. Dietary and sustainability associations do not create dietary requirements, and unknown meal attributes cannot satisfy a requirement.

Recorded real Qloo tests held the two-person event, menu and budget constant. The no-taste baseline selected two tofu meals; different restaurant profiles produced egg-fried-rice and pasta selections. This demonstrates that Qloo influences the allocation. It does not prove diners prefer those choices or that restaurant input outperforms directly choosing a cuisine.

## 4. The bounded agent — implemented

After the organiser confirms the form's dietary segments, event budget and selected restaurant branches, **Plan with AI** lets a free model request existing tools. It has no conversational editor or automatic restaurant disambiguation: the organiser still resolves replies and selects exact branches in the current interface.

The model can request three operations:

1. **`get_cuisine_profile`:** retrieve cuisine associations for the exact selected branch IDs. The server rejects different IDs and repeated lookups. No profile needs to be built manually before planning.
2. **`allocate_meals`:** run the existing allocator with the unchanged confirmed event and, when selected, the server-held taste evidence. Independent validation checks quantities, dietary compatibility, stock, budget and server prices.
3. **`finish_plan`:** hand back the verified draft or one permitted next action. A handoff that disagrees with the tool result is rejected.

With no selected restaurants, the model can go directly to allocation. If Qloo fails, it can request an organiser decision rather than silently dropping taste preferences. The UI shows completed factual tool activity and service modes; it does not display private model reasoning. The live path uses actual model tool-call responses. The fixture path is deterministic and clearly labelled as simulated.

The model receives anonymous confirmed counts and requirement codes, not original replies, source excerpts, editable labels, credentials or payment details. It cannot change the event, choose authoritative prices, approve an order or initiate payment. Review, manual changes and payment approval remain with the organiser. Manual edits do not restart planning.

### Failure and stopping behaviour

The allocator already searches affordable alternatives. An exhaustive `INFEASIBLE` result asks the organiser to review availability or decide whether to raise the budget. It never relaxes dietary requirements, reduces headcount or increases the budget. `SEARCH_LIMIT` remains distinct from confirmed infeasibility.

Model prose is not displayed. Only verified results and a server-controlled set of recovery messages reach the organiser; this removes the free-model probe's suggestion to relax dietary restrictions. Invalid or incomplete tool calls stop planning and leave the existing manual workflow usable.

The implemented limits are one concurrent run, at most three model requests per run, an 18-model-request process cap, 1,500 output tokens per request, a 30-second model-request timeout and a 90-second run deadline. There are no retries or paid fallbacks. The fixed model is `nvidia/nemotron-3.5-lightning:free`, with zero provider price ceilings. Separate settings control extraction and payment.

### Remaining proposed behaviour

Understanding a free-form planning goal, interpreting unfamiliar replies reliably, asking conversational clarification questions and automatically searching/disambiguating restaurant names are not established by this version. The current agent starts from the confirmed form and explicit branch selections. Per-person taste/fairness optimisation is also outside its scope.

## 5. Responsibilities in the current experience

| Component | Responsibility | Current status |
| --- | --- | --- |
| Organiser | Confirm requirements and restaurant choices, edit meals and approve checkout | Implemented |
| OpenRouter / language model | Extract candidate requirements; the separate bounded planner chooses permitted tools and responds to their results | Extraction adapter exists with real unfamiliar-reply quality unverified; bounded planner implemented and exercised with a real free model |
| Qloo | Resolve restaurants and supply cuisine associations | Integrated; bounded real API smoke tests passed |
| Menu mapping and allocator | Connect supported cuisines to sample dishes and search for a feasible allocation | Implemented; mappings remain coarse |
| Validator and order server | Enforce counts, compatibility, stock and budget; calculate authoritative prices and preserve approved choices | Implemented |
| PayPal adapter | Create, approve, capture and verify a Sandbox payment after human approval | Adapter implemented and mocked; real Sandbox acceptance pending |

The agent does not independently approve payment, change confirmed dietary requirements, increase the budget or overwrite manual meal choices. A new planning run would require an explicit organiser action. Existing checkout invalidation and payment-lock rules remain in force.

## 6. Suggested demonstration sequence

A demonstration can follow one order throughout. Clearly separate the implemented confirmed-form agent from the remaining extraction and payment acceptance checks:

1. Provide event details, dietary replies and favourite restaurants.
2. Resolve a genuinely ambiguous requirement and confirm the dietary segments.
3. Show the agent calling Qloo and then the allocation tool, using their actual responses.
4. Show how cuisine evidence influenced the starting choices while preserving all hard requirements.
5. Show one controlled failure, such as an insufficient budget, and the agent's appropriate response. Any budget change is approved by the organiser.
6. Manually change a meal and approve the final draft.
7. Complete the available checkout mode and show the retained confirmation and packing summary.

A real model + real Qloo agent run has passed through application endpoints. Browser acceptance separately used fixtures. A real PayPal Sandbox cycle and unfamiliar-reply extraction remain unverified and must not be presented as completed. Fixture recordings do not establish live-service acceptance.

## 7. Evidence available and work remaining

The acceptance record updated on 29 October reports **128 passing automated tests across 13 files**, passing type checking, lint and a production build. Desktop and mobile fixture workflows cover taste changes, manual editing, simulated checkout, confirmation and reload. Four real Qloo requests exercised the implemented search/profile path and changed the resulting allocation. The 29 October agent revision also completed two real application runs: five free-model requests reported total US$0, with two Qloo requests. A valid draft retained a final manual split through simulated checkout; an insufficient-budget run returned an organiser decision without changing requirements. Desktop/mobile simulated-planner acceptance and the existing segment regression passed. This document summarises those executed checks; it does not add another test run.

Remaining acceptance and submission work:

- Exercise real dietary extraction with unfamiliar replies under a separately approved model/usage arrangement; expand agent scenarios beyond the two live runs before claiming broader reliability.
- Complete a real PayPal Sandbox cycle for the PayPal objective; this is separate from Qloo's competition requirements.
- Have an unfamiliar person complete the workflow without coaching.
- Compare restaurant-derived preferences with a direct-cuisine baseline before claiming better recommendations.
- Arrange the required submission/testing access and repository visibility with the owner's approval.

For the Qloo competition, the implemented bounded agent route addresses the agentic aspect discussed in the [official rules](https://qloo.devpost.com/rules). Integration alone is not a certification of eligibility. The submission also requires a functioning demo link, public open-source code and testing access. This document does not claim those arrangements are complete.

## 8. Scope

The bounded agent orchestration layer now wraps the existing Qloo, allocation and review capabilities. Separate per-person taste profiles, fairness optimisation, conversational editing, split payments, multiple suppliers and a merchant backend are possible future ideas; none is adopted or implemented by this document.

The commercial offer, software price, acquisition channel and amount of organiser time saved remain open questions. The near-term aim is a coherent, honestly demonstrated prototype with a clear reason for using Qloo.

For the implemented-only description, see [Current Demo](CURRENT_DEMO.md). Execution evidence and outstanding acceptance checks are recorded in [Acceptance](docs/ACCEPTANCE.md).
