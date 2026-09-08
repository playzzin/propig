import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const {chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:['--no-sandbox']});
const base=process.env.BASE_URL||'http://127.0.0.1:3002';
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/propig/store`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>localStorage.setItem('propig:installed-apps:v1',JSON.stringify(['memos'])));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'해제',exact:true}).click();
 await page.waitForFunction(()=>localStorage.getItem('propig:installed-apps:v1')==='[]');
 await page.getByRole('button',{name:'등록',exact:true}).first().click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('propig:installed-apps:v1')||'[]').includes('memos'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'해제',exact:true}).waitFor();
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  for(const route of ['/propig','/habit-tracker','/bucket-list']) {
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
   await page.getByRole('heading').first().waitFor();
   assert.ok(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),`${route} overflow`);
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS guest store install/uninstall/reload; dashboard/habit/bucket desktop/mobile health, width and JS errors; isolated local storage only');
 await context.close();
} finally {await browser.close();}
