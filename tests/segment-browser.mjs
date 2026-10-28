// Current UI acceptance. Uses existing Playwright, local fixtures and an isolated test database.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.GROUPTABLE_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const errors = []; const results = [];
mkdirSync('artifacts', { recursive: true });
async function context(viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width === 390, hasTouch: viewport.width === 390 });
  await ctx.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  return ctx;
}
async function open(ctx) { const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(base); await page.getByRole('heading', { name: 'Plan the group order.' }).waitFor(); return page; }
async function confirmSegments(page) {
  const buttons = page.getByRole('button', { name: /^I (reviewed and confirm requirements for|confirm \d+ people have no known dietary restrictions)/ });
  while (await buttons.count()) { if (!(await buttons.first().isEnabled())) throw new Error('An unresolved segment cannot be confirmed'); await buttons.first().click(); }
  await page.getByRole('checkbox', { name: /^I confirm these segments are mutually exclusive/ }).check();
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const ctx = await context(viewport); const page = await open(ctx); const mode = viewport.width === 390 ? 'mobile' : 'desktop';
    let allocations = 0; page.on('request', r => { if (new URL(r.url()).pathname === '/api/allocate') allocations++; });
    await page.getByText('Extract segments from counts or replies', { exact: true }).click();
    await page.getByRole('button', { name: 'Load example' }).click();
    await page.getByRole('button', { name: 'Extract example segments' }).click();
    await page.getByText('Fixture segments loaded.', { exact: false }).waitFor();
    assert.equal(await page.locator('.segment-edit-heading').count(), 4);
    assert.match(await page.locator('.coverage').innerText(), /30 \/ 30 people/);
    assert(await page.getByRole('button', { name: 'Allocate meals' }).isDisabled());
    await confirmSegments(page);
    // Editing a confirmed segment must revoke confirmation and exclusivity without changing its ID.
    await page.getByRole('textbox', { name: 'Label for segment 2', exact: true }).fill('Vegetarian only, reviewed');
    assert(await page.getByRole('button', { name: 'Allocate meals' }).isDisabled());
    assert.equal(await page.getByRole('checkbox', { name: /^I confirm these segments are mutually exclusive/ }).isChecked(), false);
    await page.getByRole('textbox', { name: 'Label for segment 2', exact: true }).fill('Vegetarian only');
    await confirmSegments(page);
    await page.getByLabel(/Total budget/).fill('2160');
    await page.getByRole('button', { name: 'Allocate meals' }).click();
    await page.getByRole('heading', { name: 'Meals by segment.' }).waitFor();
    assert.equal(await page.locator('.meal-segment').count(), 4);
    assert.match(await page.locator('.aside-total').innerText(), /2,148\.00/);
    const regular = page.locator('.meal-segment').filter({ has: page.getByRole('heading', { name: 'No known dietary restrictions', exact: true }) });
    const otherState = () => page.locator('.meal-segment').evaluateAll(cards => cards.slice(1).map(card => ({ label: card.querySelector('h3').textContent, requirements: card.querySelector('.segment-rules').textContent, choices: [...card.querySelectorAll('select')].map(select => select.value), quantities: [...card.querySelectorAll('input')].map(input => input.value), subtotal: card.querySelector('.segment-subtotal').textContent })));
    const otherBefore = await otherState();
    const firstMeal = regular.getByRole('combobox').first();
    assert.equal(await firstMeal.inputValue(), 'ginger-tofu');
    const tofuQuantity = regular.getByRole('spinbutton', { name: 'Quantity for No known dietary restrictions, Ginger tofu & rice', exact: true });
    assert.equal(await tofuQuantity.inputValue(), '2');
    await firstMeal.selectOption('roast-chicken');
    assert.match(await page.locator('.work-panel').getByRole('alert').innerText(), /8\.00 over budget/);
    const approval = page.getByRole('button', { name: 'Approve order & continue' });
    assert(await approval.isDisabled());
    await firstMeal.selectOption('ginger-tofu');
    assert(await approval.isEnabled());
    await tofuQuantity.fill('1');
    assert.match(await regular.locator('.segment-errors').innerText(), /1 more meal needed/);
    assert(await approval.isDisabled());
    await regular.getByRole('button', { name: 'Add meal type to No known dietary restrictions', exact: true }).click();
    await regular.getByRole('combobox').nth(3).waitFor();
    await regular.getByRole('combobox').last().selectOption('roast-chicken');
    assert(await approval.isEnabled());
    assert.match(await page.locator('.aside-total').innerText(), /2,158\.00/);
    assert.match(await page.locator('.basket-subtotal').innerText(), /2,078\.00/);
    assert.deepEqual(await otherState(), otherBefore);
    assert.equal(allocations, 1, 'Manual edits must not regenerate the whole allocation');
    const bounds = await regular.getByRole('combobox').first().boundingBox(); assert(bounds && bounds.height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/segments-review-${mode}.png`, fullPage: true });
    if (mode === 'desktop') { await page.evaluate(() => window.scrollTo({ top: document.querySelector('.steps').getBoundingClientRect().top + window.scrollY, behavior: 'instant' })); await page.screenshot({ path: 'artifacts/segments-preview.png' }); }
    await approval.click(); await page.getByRole('heading', { name: 'Try the checkout flow.' }).waitFor();
    const snapshot = await page.evaluate(async () => (await fetch(`/api/orders/${sessionStorage.getItem('grouptable-order-v1')}`)).json());
    assert.equal(snapshot.request.version, 2); assert.equal(snapshot.request.headcount, 30);
    assert.equal(snapshot.allocation.totalCents, 215800);
    assert.equal(snapshot.items.reduce((sum, item) => sum + item.quantity, 0), 30);
    assert.equal(snapshot.items.find(item => item.id === 'roast-chicken').quantity, 1);
    assert.equal(snapshot.allocation.assignments.filter(line => line.segmentId === snapshot.request.segments[0].id).length, 4);
    await page.getByRole('button', { name: 'Simulate PayPal approval' }).click();
    const oldId = snapshot.id;
    await page.getByRole('button', { name: 'Edit order', exact: true }).click();
    await page.getByRole('heading', { name: 'Meals by segment.' }).waitFor();
    assert.match(await page.locator('.aside-total').innerText(), /2,158\.00/);
    assert.equal(allocations, 1);
    const stale = await page.evaluate(async id => (await fetch(`/api/orders/${id}/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, oldId); assert.equal(stale, 409);
    await approval.click(); await page.getByRole('button', { name: 'Simulate PayPal approval' }).click();
    await page.getByRole('button', { name: 'Complete simulated payment' }).click();
    await page.getByRole('heading', { name: 'Simulation complete.' }).waitFor();
    assert.equal(await page.locator('.meal-segment').count(), 4);
    assert.equal(await page.locator('.meal-segment select').count(), 0);
    assert.match(await page.locator('.receipt-meta').innerText(), /2,158\.00/);
    assert.match(await page.locator('.meal-segment').first().innerText(), /Roast chicken rice/);
    await page.reload(); await page.getByRole('heading', { name: 'Simulation complete.' }).waitFor();
    assert.equal(await page.locator('.meal-segment').count(), 4);
    await page.screenshot({ path: `artifacts/segments-confirmation-${mode}.png`, fullPage: true });
    results.push({ viewport: mode, headcount: 30, segments: 4, manualQuantitySplit: 'passed', otherSegmentsPreserved: true, totalCents: 215800, simulatedCheckoutAndReload: 'passed', staleCaptureStatus: stale });
    await ctx.close();
  }

  // Exercise 100 people using one segment, not 100 guest rows.
  const largeCtx = await context(); const large = await open(largeCtx);
  await large.getByLabel('Total people', { exact: true }).fill('100'); await large.getByLabel(/Total budget/).fill('10000');
  await large.getByRole('button', { name: 'Add segment', exact: true }).click();
  await large.getByRole('textbox', { name: 'Label for segment 1', exact: true }).fill('All participants');
  await large.getByRole('spinbutton', { name: 'People in All participants', exact: true }).fill('100');
  await confirmSegments(large); await large.getByRole('button', { name: 'Allocate meals' }).click();
  await large.getByRole('heading', { name: 'Meals by segment.' }).waitFor();
  assert.equal(await large.locator('.meal-segment').count(), 1);
  assert.match(await large.locator('.segment-subtotal').innerText(), /100 \/ 100 meals assigned/);
  assert((await large.locator('.meal-line').count()) <= 15);
  await large.getByRole('button', { name: 'Edit requirements' }).click();
  await large.getByRole('checkbox', { name: 'Vegan for All participants', exact: true }).check();
  await confirmSegments(large); await large.getByRole('button', { name: 'Allocate meals' }).click();
  await large.getByRole('alert').filter({ hasText: 'INFEASIBLE' }).waitFor();
  results.push({ headcount: 100, quantityAllocation: 'passed', insufficientVeganStock: 'INFEASIBLE' });
  await largeCtx.close();

  // Add/edit/remove and count mismatches are visible before allocation, including the 12-segment UI cap.
  const controlsCtx = await context(); const controls = await open(controlsCtx);
  await controls.getByLabel('Total people', { exact: true }).fill('3');
  await controls.getByRole('button', { name: 'Add segment', exact: true }).click();
  await controls.getByRole('spinbutton', { name: 'People in Segment 1', exact: true }).fill('2');
  assert.match(await controls.locator('.coverage').innerText(), /Requirements not confirmed: 1 people/);
  await controls.getByRole('button', { name: 'Add segment', exact: true }).click();
  await controls.getByRole('spinbutton', { name: 'People in Segment 2', exact: true }).fill('2');
  assert.match(await controls.locator('.coverage').innerText(), /exceed the event headcount by 1/);
  assert(await controls.getByRole('button', { name: 'Allocate meals' }).isDisabled());
  await controls.getByRole('spinbutton', { name: 'People in Segment 2', exact: true }).fill('1');
  await confirmSegments(controls); assert(await controls.getByRole('button', { name: 'Allocate meals' }).isEnabled());
  await controls.getByRole('button', { name: 'Remove Segment 1', exact: true }).click();
  assert.match(await controls.locator('.coverage').innerText(), /Requirements not confirmed: 2 people/);
  assert(await controls.getByRole('button', { name: 'Allocate meals' }).isDisabled());
  while ((await controls.locator('.segment-edit-heading').count()) < 12) await controls.getByRole('button', { name: 'Add segment', exact: true }).click();
  assert(await controls.getByRole('button', { name: 'Add segment', exact: true }).isDisabled());
  results.push({ segmentAddEditRemove: 'passed', shortfallAndExcess: 'blocked', uiSegmentLimit: 12 });
  await controlsCtx.close();

  // Preserve an unfinished old draft exactly, instead of guessing groups for non-repliers.
  const unfinished = { headcount: 4, budgetCents: 50000, currency: 'HKD', deliveryCents: 8000, revision: 0, attendees: Array.from({ length: 4 }, (_, i) => ({ id: `guest-${i + 1}`, source: '', requirements: [], unresolved: ['No reply has been confirmed.'], confirmed: false })) };
  const oldDraft = JSON.stringify({ request: unfinished, text: 'Preserved anonymous draft text', issues: [] });
  const draftCtx = await context(); await draftCtx.addInitScript(raw => sessionStorage.setItem('grouptable-draft-v1', raw), oldDraft);
  const draftPage = await open(draftCtx);
  await draftPage.getByRole('button', { name: 'Download preserved draft' }).waitFor();
  assert.equal(await draftPage.locator('.segment-edit-heading').count(), 0);
  assert.match(await draftPage.locator('.coverage').innerText(), /Requirements not confirmed: 4 people/);
  assert.equal(await draftPage.evaluate(() => sessionStorage.getItem('grouptable-draft-v1')), oldDraft);
  results.push({ legacyUnfinishedDraft: 'preserved', inferredSegments: 0 }); await draftCtx.close();

  // A synthetic legacy order must still complete its original payment and guest-based summary.
  const legacyCtx = await context(); const legacyPage = await open(legacyCtx);
  const legacy = { request: { ...unfinished, headcount: 2, attendees: unfinished.attendees.slice(0, 2).map(a => ({ ...a, confirmed: true, unresolved: [] })) }, assignments: [{ attendeeId: 'guest-1', itemId: 'ginger-tofu' }, { attendeeId: 'guest-2', itemId: 'roast-chicken' }] };
  const oldOrder = await legacyPage.evaluate(async body => (await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), legacy);
  assert(oldOrder.id); assert.equal(oldOrder.request.version, undefined);
  await legacyPage.goto(`${base}/?order=${oldOrder.id}`);
  await legacyPage.getByRole('button', { name: 'Simulate PayPal approval' }).click();
  await legacyPage.getByRole('button', { name: 'Complete simulated payment' }).click();
  await legacyPage.getByRole('heading', { name: 'Simulation complete.' }).waitFor();
  assert.match(await legacyPage.locator('.assignments').innerText(), /Guest 01/);
  assert.match(await legacyPage.locator('.assignments').innerText(), /Roast chicken rice/);
  await legacyPage.reload(); await legacyPage.getByRole('heading', { name: 'Simulation complete.' }).waitFor();
  assert.equal(await legacyPage.locator('.assignments tbody tr').count(), 2);
  results.push({ legacyPaymentAndConfirmation: 'passed', originalGuestAssignments: 'preserved' }); await legacyCtx.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, pageErrors: errors }));
} finally { await browser.close(); }
