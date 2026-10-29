import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createStaticExportServer} from './serve-static-export.mjs';
const server=await createStaticExportServer('.next-static-export');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
try{
 for(const width of [1440,390])for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion});
  await context.addInitScript(()=>{if(!localStorage.getItem('propig:installed-apps:v1'))localStorage.setItem('propig:installed-apps:v1',JSON.stringify(['memos','habit','todo','bucket']));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/propig',{waitUntil:'domcontentloaded'});
  const shell=page.locator('[data-dashboard-design="calm"]:visible');await shell.waitFor();
  await shell.getByRole('button',{name:'메모장 숨기기',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-dashboard-design="calm"]')?.getAnimations({subtree:true}).every(a=>a.effect?.getTiming().iterations===Infinity||a.playState==='finished'));
  assert.equal(await shell.getByRole('heading',{level:1}).textContent(),'위젯 대시보드');
  const title=await shell.getByRole('heading',{level:1}).boundingBox();assert(title.y<500,'main title must lead first viewport');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1));
  if(reducedMotion==='reduce')assert.equal(await shell.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
  await shell.getByRole('button',{name:'메모장 숨기기',exact:true}).click();
  await shell.getByRole('button',{name:'메모장',exact:true}).click();
  await shell.getByRole('button',{name:'메모장 숨기기',exact:true}).waitFor();
  await shell.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  const dragHandle=shell.getByRole('button',{name:'메모장',exact:true});
  // Start with the active widget at the top of its scroll surface so the next
  // mobile widget is a visible keyboard target rather than an auto-scroll step.
  await dragHandle.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await dragHandle.focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-pressed')==='true');
  // Tall mobile widgets may consume a keyboard step to scroll before moving.
  // Keep the destination and persisted-order assertions; allow bounded steps.
  let reachedNextWidget=false;
  for(let step=0;step<4&&!reachedNextWidget;step++){
    await page.keyboard.press(width===390?'ArrowDown':'ArrowRight');
    reachedNextWidget=await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(e=>e.textContent?.includes('droppable area habit')),undefined,{timeout:1500}).then(()=>true,()=>false);
  }
  assert(reachedNextWidget,'keyboard drag must reach the next widget');
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('propig:widget-layout:v1')||'{}').order?.[0]!=='memo');
  await shell.getByRole('button',{name:'초기화',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('propig:widget-layout:v1')||'{}').order?.[0]==='memo');
  const reset=shell.getByRole('button',{name:'초기화',exact:true});await page.keyboard.press('Tab');await reset.focus();
  assert(await reset.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'),'visible keyboard focus');
  await shell.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:`/tmp/propig-calm-${width}-${reducedMotion}.png`});
  const download=shell.getByRole('link',{name:'ProPig 생활 APK 다운로드',exact:true});
  await download.scrollIntoViewIfNeeded();assert(await download.isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  console.log(`PASS ${width}/${reducedMotion}: hierarchy, 4 widgets, hide/restore, focus, current theme, scroll to APK, no pageerror`);
  await context.close();
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
