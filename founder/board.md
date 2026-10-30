# GroupTable — Founder Board review

## Decision

**3 FUND IF votes. Average subjective commercial score: 4.7/10** (Offers 4, Monopoly 5, Product 5).

Continue with bounded validation and the work needed for an honest hackathon demonstration. The current evidence does not justify broad feature expansion or a claim of validated demand. These votes support the next learning step, not a funding recommendation, prediction of winning or instruction to change the product.

| Lens | Score | Vote | Main condition |
| --- | --- | --- | --- |
| Offers | 4/10 | FUND IF | Identify a recurring buying occasion, show less total organiser work, and test a scoped paid offer. |
| Monopoly | 5/10 | FUND IF | Find a reachable initial niche and a reason to switch that survives comparison with simpler alternatives. |
| Product | 5/10 | FUND IF | Demonstrate uncoached completion with less work, including input preparation and the handoff to a supplier. |

Scores are judgments about the commercial proposition given limited evidence. They are not measured probabilities or Qloo judging scores. The three reviewers used independent briefs and files; they are AI reviewers applying published frameworks, not real customers or the framework authors.

## Shared findings, highest consequence first

### 1. The benefit must include the work before and after allocation

All three reviewers see a useful coordination workflow: confirmed dietary counts, shared stock, budget, manual edits and a consistent approved summary. They also identify unmeasured effort. Someone still collects replies, reconciles ambiguous counts and prepares input. A real organiser may then need to communicate the plan to an existing supplier. If those steps dominate the task, a fast allocation step may not save enough total work to earn adoption.

This is a testable risk, not evidence that users dislike the interface. Observe the complete task before removing controls. Preserve confirmation of missing/ambiguous requirements and the independent validator.

### 2. Qloo changes choices, but its added value remains open

The recorded live test held the event, menu and budget constant and obtained different meals from different restaurant inputs. That supports a narrow integration claim. No organiser or diner judged which result was preferable.

The current bridge covers five meals and three broad cuisine connections. The exact source is `src/lib/taste.ts`: Chinese/Cantonese associations map to three Chinese-inspired meals, Italian to pasta, and Indian to paneer. Other dishes remain neutral. A direct cuisine choice is therefore a necessary comparison before presenting restaurant-derived affinity as commercial differentiation. Restaurant inputs may still be useful; equivalence or superiority has not been measured.

Test no taste, direct cuisine selection and restaurant-based input on the same menu and hard constraints. Measure the extra input effort and whether organisers and diners prefer the outputs. A direct-cuisine baseline can be prepared manually for a study; this review does not authorise implementing another feature.

### 3. The initial customer and purchase are not defined

Offers and Monopoly emphasise that an organiser is a user role, not yet a validated buyer segment. The first payer could be an organiser, employer or caterer, but no one has adopted that choice or a software price. Product also makes further investment conditional on a measurable task benefit. The fictional meal prices and delivery charge provide no evidence of software willingness to pay.

Narrowing the next study to a reachable recurring meal occasion is a research decision, not an established change of target market.

### 4. The current delivery boundary must stay visible

Offers and Product both identify the gap between a useful plan and an actual delivered meal. There is one fictional supplier; live merchant supply and fulfilment are not established. Test whether an organiser and a caterer can use the packing summary without rebuilding the order before promising an operational ordering service. Do not build merchant operations solely to make this review look complete.

## Differences between the reviewers

- Offers gives the lowest score because the buyer, buying occasion and purchasing commitment are unvalidated. It asks for a scoped paid pilot after task-value evidence.
- Monopoly is more concerned with a repeatable customer channel, easy substitution and whether repeated use can produce an accumulating advantage. It does not demand a mature moat for the prototype.
- Product focuses on double handling of requirements, the attention cost of taste lookup, whose tastes the inputs represent and the supplier handoff. It explicitly preserves dietary correctness controls and suggests testing a less prominent optional taste section before changing it.

All three voted FUND IF; there is no dissenting vote to manufacture. Their conditions differ and should not be flattened into an invented consensus about pricing or a target buyer.

## Consolidated conditions

The thresholds below were proposed by reviewers as small-study decision gates. They are not calibrated industry standards or evidence of product-market fit. Choose the study and commit to its criteria before seeing results; this document records recommendations, not an approved operating plan.

- [ ] Select one candidate recurring organiser segment and identify the person with purchasing authority. Recruit five actual organisers; reconstruct their recent ordering workflow before presenting GroupTable. Record frequency, active time, mistakes, current tools and access to a supplier. Offers proposes at least three reporting the same material recurring burden and willingness to test a comparable event.
- [ ] Run uncoached, comparable workflow trials against the organisers' normal methods, counterbalancing order where practical. Include preparation, corrections, approval and handoff time. Keep requirement/count correctness as a gate. Offers proposes at least three trials and a participant-agreed useful improvement threshold; Monopoly proposes at least two showing reduced effort and requesting repeat use; Product proposes four of five completing uncoached with no unresolved count/requirement errors and lower median active work. These are distinct suggested gates, not results already obtained.
- [ ] Compare no taste, direct cuisine selection and restaurant-derived associations on identical constraints. Ask organisers and diners to judge actual outputs. Keep the restaurant-input step as a commercial differentiator only if its benefit justifies the extra effort. Record whose preferences the seeds represent.
- [ ] Review the packing summary with one organiser and one caterer; list remaining re-entry, substitution and communication steps. This can use synthetic or consented data and requires no food purchase. Test whether a less prominent optional taste section improves the first-use task without weakening correctness controls.
- [ ] After value is demonstrated, define a bounded paid pilot, a candidate price and the payer. Offers proposes two genuine purchasing commitments; Monopoly proposes at least one credible commitment. Neither has been obtained. Do not take payment or contact anyone automatically.
- [ ] Before broader expansion, identify a plausible source of repeat-use value and a reachable acquisition route. Possible catalogue learning or supplier relationships are hypotheses, not existing assets. Defer broad integrations and merchant operations until evidence supports them.

For gaps needing more study, `/founder-competitors` can research actual alternatives and `/founder-cfo` can model economics after price/cost inputs exist. No further skill was run. A simulated `/founder-consumer` panel could generate objections, but it cannot satisfy these real-human gates.

## Strongest business the board can see

A focused planning assistant for a recurring meal organiser who needs a checked, editable set of meal quantities and a usable supplier handoff. Its promise would be less coordination work while retaining control over dietary requirements, budget and final choices. Qloo could help when restaurant-derived associations produce choices that participants value beyond a simple cuisine selection. This positioning emphasises the organiser's completed task more than recommendation sophistication. It is a proposed commercial direction, not a validated buyer, adopted pivot or implemented service.

## Qloo competition assessment — separate from the business vote

The current implementation has demonstrable Qloo influence and a coherent planning/review/confirmation path. The board recommends showing one recognisable organiser scenario and the exact change produced by taste evidence, with fictional meals and simulated payment labelled.

The [official rules](https://qloo.devpost.com/rules), checked during this review, require Qloo integration plus an application functioning as an agentic tool, use of an agent framework, or integration into an existing agent. The reviewed source and acceptance record do not demonstrate a model selecting and invoking Qloo tools. That is an evidence gap to resolve; this review cannot certify compliance or substitute a mandatory LLM-tool-calling interpretation for the rule's three alternatives. A real PayPal Sandbox payment is a separate PayPal acceptance objective; it is not stated as a Qloo competition requirement.

The rules also require a functional demo link, a public open-source repository and testing access through judging. The project was last reported private and local; this review did not check the remote repository or change visibility/hosting. Confirm submission access separately. The rules weight Qloo implementation, design, potential impact and idea quality equally; the business score above is not a score on those criteria.

For the near-term demo, prioritise the selected agentic route, a continuous honest demonstration and at least one uncoached user test if feasible. Before claiming stronger recommendation value, run a small direct-cuisine comparison. Five-organiser studies and paid pilots are commercial follow-up conditions, not extra Qloo submission requirements. No promise of a win follows from meeting technical requirements.

## Evidence and method

- Current files inspected: `CURRENT_DEMO.md`, `docs/ACCEPTANCE.md`, `src/lib/taste.ts`, `src/lib/qloo.ts`, `src/components/TastePreferences.tsx`, and relevant allocation/extraction code. Existing execution evidence was read, not rerun for this review.
- Independent memos: `founder/board/offers.md`, `founder/board/monopoly.md`, `founder/board/product.md`.
- Method: [Founder Board skill](https://github.com/Jakeschincariol/founder-skill/blob/main/skills/founder-board/SKILL.md) and its [published-framework lenses](https://github.com/Jakeschincariol/founder-skill/blob/main/skills/founder-board/lenses.md). The adapted local reference is `founder/board/lenses.md`; nothing was installed.
- This task created review documents only. It did not modify application code, rerun provider/browser tests, access credentials, contact prospective customers, install packages, call paid APIs, publish or perform Git mutations.
