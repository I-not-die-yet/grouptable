import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base='http://127.0.0.1:3031'; const browser=await chromium.launch({headless:true}); mkdirSync('artifacts',{recursive:true});
const results=[];
async function setup(page,budget) {
 await page.goto(base); await page.getByRole('heading',{name:'Your group'}).waitFor();
 await page.getByLabel('Total people',{exact:true}).fill('2'); await page.getByLabel(/Total budget/).fill(String(budget));
 await page.getByRole('button',{name:'Add group',exact:true}).click();
 await page.getByRole('textbox',{name:'Name for group 1'}).fill('Everyone');
 await page.getByRole('spinbutton',{name:'People in Everyone'}).fill('2');
 const planner=page.getByRole('button',{name:'Simulate AI planner'}); assert(await planner.isDisabled());
 await page.getByRole('button',{name:/^I confirm 2 people have no known dietary restrictions/}).click();
 await page.getByRole('checkbox',{name:/^Each person is counted once./}).check();
 await page.getByRole('button',{name:'Search restaurants'}).click();
 await page.getByRole('button',{name:/^Select Example Pasta Table,/}).click();
 assert.equal(await page.locator('.taste-evidence').count(),0); assert(await planner.isEnabled());
 return planner;
}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
try { for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 const mode=viewport.width===390?'mobile':'desktop'; const ctx=await browser.newContext({viewport,isMobile:mode==='mobile',hasTouch:mode==='mobile'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await ctx.newPage(); const errors=[]; let calls=0; page.on('pageerror',e=>errors.push(e.message)); page.on('request',r=>{if(new URL(r.url()).pathname==='/api/agent/plan')calls++});
 const planner=await setup(page,600); const box=await planner.boundingBox(); assert(box.height>=44,`planner height ${box.height}`);
 await noOverflow(page); await page.screenshot({path:`artifacts/agent-requirements-${mode}.png`,fullPage:true});
 await planner.click(); await page.getByRole('heading',{name:'Your meal plan',exact:true}).waitFor();
 const activity=page.getByRole('region',{name:'Planner activity'}); assert.match(await activity.innerText(),/Planning details · Simulated/); assert.equal(await activity.locator('details').getAttribute('open'),null); await activity.getByText('Planning details · Simulated',{exact:true}).click();
 assert.equal(await activity.locator('li').count(),3); assert.match(await activity.innerText(),/Taste lookup[\s\S]*Allocation & validation[\s\S]*Organiser handoff/);
 const segment=page.locator('.meal-segment'); assert.equal(await segment.getByRole('combobox').first().inputValue(),'mushroom-pasta'); assert.equal(await segment.getByRole('spinbutton').first().inputValue(),'2');
 await segment.getByRole('spinbutton').first().fill('1'); await segment.getByRole('button',{name:'Add meal type to Everyone'}).click(); await segment.getByRole('combobox').last().selectOption('roast-chicken');
 assert.equal(calls,1); assert.equal(await activity.locator('li').count(),3); assert.match(await page.locator('.aside-total').innerText(),/234\.00/);
 await noOverflow(page); await page.screenshot({path:`artifacts/agent-review-${mode}.png`,fullPage:true});
 await page.getByRole('button',{name:'Approve order & continue'}).click(); await page.getByRole('button',{name:'Simulate PayPal approval'}).click();
 const oldId=await page.evaluate(()=>sessionStorage.getItem('grouptable-order-v1'));
 await page.getByRole('button',{name:'Edit order',exact:true}).click(); await page.getByRole('heading',{name:'Your meal plan',exact:true}).waitFor();
 const stale=await page.evaluate(async id=>(await fetch(`/api/orders/${id}/capture`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,oldId); assert.equal(stale,409); assert.equal(calls,1);
 await page.getByRole('button',{name:'Approve order & continue'}).click(); await page.getByRole('button',{name:'Simulate PayPal approval'}).click(); await page.getByRole('button',{name:'Complete simulated payment'}).click();
 await page.getByRole('heading',{name:'Simulation complete.'}).waitFor(); await page.reload(); await page.getByRole('heading',{name:'Simulation complete.'}).waitFor();
 assert.match(await segment.innerText(),/Mushroom cream pasta[\s\S]*1 meals[\s\S]*Roast chicken rice[\s\S]*1 meals/); assert.match(await page.locator('.receipt-meta').innerText(),/234\.00/);
 await noOverflow(page); await page.screenshot({path:`artifacts/agent-confirmation-${mode}.png`,fullPage:true}); assert.deepEqual(errors,[]); await ctx.close();
 const low=await browser.newContext({viewport,isMobile:mode==='mobile',hasTouch:mode==='mobile'}); await low.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort()); const p=await low.newPage(); const lowErrors=[]; p.on('pageerror',e=>lowErrors.push(e.message)); let lowCalls=0; p.on('request',r=>{if(new URL(r.url()).pathname==='/api/agent/plan')lowCalls++});
 const run=await setup(p,100); await run.click(); const act=p.getByRole('region',{name:'Planner activity'}); await act.getByText(/No combination meets/).waitFor(); assert.match(await act.innerText(),/INFEASIBLE/); assert.equal(await act.locator('li').count(),3); assert.equal(await p.getByRole('heading',{name:'Your meal plan',exact:true}).count(),0);
 assert.equal(await p.getByLabel('Total people',{exact:true}).inputValue(),'2'); assert.equal(await p.getByLabel(/Total budget/).inputValue(),'100'); assert.equal(await p.getByRole('spinbutton',{name:'People in Everyone'}).inputValue(),'2'); assert(await p.getByRole('checkbox',{name:/^Each person is counted once./}).isChecked()); assert.equal(await p.locator('.segment-edit input[type=checkbox]:checked').count(),0);
 await noOverflow(p); await p.screenshot({path:`artifacts/agent-infeasible-${mode}.png`,fullPage:true}); await p.getByLabel(/Total budget/).fill('600'); assert.equal(lowCalls,1); await run.click(); await p.getByRole('heading',{name:'Your meal plan',exact:true}).waitFor(); assert.equal(lowCalls,2); assert.equal(await p.locator('.meal-segment select').first().inputValue(),'mushroom-pasta'); assert.deepEqual(lowErrors,[]); await low.close();
 results.push({mode,unconfirmedBlocked:true,steps:3,manualEditNoExtraCalls:true,total:234,staleCapture:stale,checkoutReload:true,infeasibleAndExplicitRetry:true,overflow:false,errors:[]});
 } console.log(JSON.stringify(results)); } finally {await browser.close()}
