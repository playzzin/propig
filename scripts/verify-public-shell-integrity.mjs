import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME || process.cwd(), 'package.json'));
const { chromium } = require('playwright-core');
const AxeBuilder = require('@axe-core/playwright').default;
const base = process.env.BASE_URL || 'http://127.0.0.1:3002';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),args:['--no-sandbox']});
const results=[];
try {
  for (const width of [1440,390]) {
    for (const route of ['corp','blog','propig','admin']) {
      const context = await browser.newContext({viewport:{width,height:900}});
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const response=await page.goto(`${base}/${route}`,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      console.log('CHECK', width, route);
    await page.getByRole('heading').first().waitFor();
      if(route==='admin') {
        await page.getByRole('heading',{name:'로그인이 필요합니다',exact:true}).waitFor();
        assert.equal(await page.getByRole('heading',{name:'관리 사이트 홈',exact:true}).count(),0);
        assert.equal(await page.getByRole('link',{name:'기업 사이트',exact:true}).count(),1);
      }
      if(route==='propig') {
        const progress=page.getByRole('progressbar',{name:'오늘 루틴 진행률'});
        await progress.waitFor();
        const now=Number(await progress.getAttribute('aria-valuenow'));
        assert.ok(now>=0 && now<=100);
      }
      // Allow async shell subscriptions to settle before the bounded accessibility sample.
      await page.waitForTimeout(1000);
      const audit=await new AxeBuilder({page}).withRules(['aria-prohibited-attr','list','color-contrast']).analyze();
      const serious=audit.violations.filter(v=>['serious','critical'].includes(v.impact));
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      results.push({width,route,overflow,errors,violations:serious.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))});
      if(process.env.PROPIG_SCREENSHOTS) await page.screenshot({path:`${process.env.PROPIG_SCREENSHOTS}-${width}-${route}.png`});
      await context.close();
    }
  }
  console.log(JSON.stringify(results,null,2));
  assert.ok(results.every(r=>!r.overflow && !r.errors.length && !r.violations.length),'Public shell integrity failed; inspect preceding route evidence');
  console.log('PASS public shell: guest gate, progress semantics, list structure, contrast, mobile width, JS errors');
} finally {await browser.close();}
