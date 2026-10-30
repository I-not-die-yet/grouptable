# GroupTable board brief

## Purpose and decision

Assess the current demo through one assigned Founder Board lens. Evaluate commercial promise and the near-term hackathon demonstration separately. Recommend whether to invest further validation/build effort, with conditions where warranted. FUND / FUND IF / PASS are simulated review votes, not an actual financing decision. Do not turn them into estimates of winning, revenue or product-market fit.

The product is GroupTable, an English local browser application for one organiser coordinating colleagues' meals. The first paying customer and commercial price are not decided. Do not invent a pricing plan, customer interviews, market size, competitors, willingness to pay, development budget or founder opinion. Treat chat + spreadsheets, directly choosing cuisines, and supplier-assisted ordering as alternatives to test, not documented competitive research. Read ../idea.md for the working idea and explicit unknowns.

## Current implemented flow

1. Set event headcount and delivery-inclusive budget.
2. Enter mutually exclusive dietary segments manually or use labelled extraction examples. A configured OpenRouter adapter can extract candidates, but the current acceptance record does not establish real-model accuracy.
3. Review sources, unresolved questions, group quantities and requirements; confirm each segment and that each person is counted once. Missing replies do not imply no restrictions.
4. Optionally search restaurants, select up to three exact branches, build one combined Qloo cuisine profile and inspect its mappings to sample meals.
5. Allocate a feasible combination, then manually edit meal types and quantities on Review. Other segments and confirmed requirements remain unchanged. Manual changes do not rerun allocation.
6. Server independently validates assignments and prices before creating an immutable approved snapshot.
7. Simulated payment leads to confirmation and a printable segment packing summary. A separate PayPal Sandbox adapter exists, with real acceptance still pending.

## Product bounds and Qloo implementation

- One fictional supplier, 15 meals, 1–100 people, at most 12 dietary segments, HKD, fixed HK$80 delivery, one box per person. Stock is per demo order, not merchant inventory management. No real food is ordered or delivered.
- Qloo searches public restaurant entities and retrieves cuisine-tag affinities. Keys stay server-side. Only explicitly selected restaurant IDs enter the taste request; dietary replies and payment data do not.
- House-authored bridges currently cover five dishes: Chinese/Cantonese associations → Chinese-inspired egg fried rice, ginger beef and peanut sesame noodles; Italian → mushroom penne; Indian → paneer tomato rice. Other meals are neutral. The bridges are coarse application choices, not Qloo scores for fictional dishes.
- Cuisine affinities determine the order of trying meals. Price/ID break ties. The first feasible result is kept; search is capped at 50,000 states. There is no optimisation of total group satisfaction, individual fairness, diversity or preference consensus. Multiple restaurant seeds form one event-level starting preference.
- Confirmed dietary labels, stock, quantities and delivery-inclusive budget remain hard constraints. Unknown attributes do not satisfy requirements. Taste never establishes allergens or real cross-contact safety. Preferred meals may be skipped to meet budget or stock.
- Taste lookup is optional and adds restaurant search, branch selection, profile generation and evidence review before allocation. Unmapped/empty/error cases can continue without taste. Temporary session-owned evidence expires; approved meal choices persist separately.
- No Qloo integration into a model-driven tool-calling agent has been demonstrated. The shown flow is organiser-driven. Do not assert full competition compliance from API integration alone.

## Evidence and its limits

Read current CURRENT_DEMO.md, docs/ACCEPTANCE.md and src/lib/taste.ts if you need details. This brief was checked against those files during this review. Tests were not rerun for this read-only business assessment.

The acceptance record reports 113 automated tests across 12 files, passing typecheck/lint/build, desktop/mobile fixture browser checks, edited-choice preservation through simulated checkout/reload, stale checkout rejection and payment locks. These are technical checks, not evidence of demand or time saved.

Four real Qloo requests in the previous implementation session exercised two restaurant searches and two cuisine profiles through application endpoints. Holding the two-person event, budget and menu constant, the no-taste baseline selected two tofu meals; the two different profiles selected two egg-fried-rice meals and two pasta meals. This shows selection is influenced by Qloo-derived associations. No diners judged those outputs; no A/B preference or task-time evidence exists.

Desktop/mobile fixture tests also covered a final manual split of one pasta and one chicken meal, HK$234 including delivery, surviving simulated payment and reload. Real OpenRouter extraction, a real PayPal Sandbox cycle, another-machine clean setup and an unfamiliar user's uncoached completion remain unverified in the record. No claims about live-model interpretation or real payments are supported by fixture success.

## Commercial and operational unknowns

- No validated narrow initial customer, pain frequency/severity, purchase authority, willingness to pay or software price.
- No measured reduction in organiser work versus current alternatives.
- No measured advantage of restaurant-based Qloo associations versus directly selecting a cuisine.
- No proven representative group taste input, recommendation acceptance or increase in satisfaction.
- No merchant agreement, live catalogue updates, fulfilment, cancellation/refund operations, unit economics or validated acquisition channel.
- No claim that these omissions all must be built for a hackathon. Separate the smallest credible demonstration from the requirements of a real business.

## Review instructions

Apply ONLY your assigned Offers, Monopoly or Product lens from lenses.md. Do not impersonate or attribute a verdict to a named public figure. Scores are subjective judgments conditional on these inputs, not measured probabilities. Preserve uncertainty and do not equate missing evidence with proof of no demand. Avoid requiring a hackathon prototype to have a mature company's infrastructure or moat.

Write a concise English memo (roughly 450–650 words) to your assigned file only:

1. Score: 1–10 | Vote: FUND / FUND IF / PASS. Score the commercial proposition at this evidence stage; state hackathon implications separately.
2. What is strong, grounded in an implemented behaviour or stated evidence.
3. What would kill it: three ranked risks, labelled inference or unknown where appropriate.
4. Questions to ask the founder: at most three, only decision-changing questions.
5. If FUND IF: concrete conditions and cheap observable tests. If PASS: what evidence could change the decision.
6. Hackathon implication: one paragraph, without certifying eligibility or predicting a win.

No installs, product edits, paid/provider calls, external account access, Git changes or publication. Do not read .env files, private data, temporary Qloo responses or credentials. Independent memos must not read each other's files or root's opinions. No broad competitor research is requested; name any need for /founder-competitors, /founder-consumer or /founder-cfo without running those skills. Real human validation has priority over simulated buyers for disputed demand/preferences.

Method source: https://github.com/Jakeschincariol/founder-skill/blob/main/skills/founder-board/SKILL.md
