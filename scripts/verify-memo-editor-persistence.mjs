import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const {chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:['--no-sandbox']});
const base=process.env.BASE_URL||'http://127.0.0.1:3002';
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 await page.goto(`${base}/propig/memos`,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'목록',exact:true}).click();
 await page.getByRole('button',{name:'새 메모',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'메모 내용',exact:true});
 await editor.waitFor();
 for(const mode of ['목록','스티커']) {
  await page.getByRole('button',{name:mode,exact:true}).click();
  const field=page.getByRole('textbox',{name:'메모 내용',exact:true});
  if(mode==='스티커') {
   await page.locator('[data-sticky-note-id]').first().waitFor();
   if(await field.count()===0) await page.getByRole('button',{name:'펼치기',exact:true}).first().click();
  }
  await field.waitFor();
  const message=`${mode} 즉시 저장 회귀 마지막 입력`;
  await field.fill(message);
  const stored=await page.evaluate(text=>Object.values(localStorage).some(value=>value.includes(text)),message);
  assert.ok(stored,`${mode}: input must reach durable storage before blur/debounce`);
  // Korean composition is committed at compositionend, not by waiting for a timer.
  await field.dispatchEvent('compositionstart');
  await field.fill(`${message} 한글`);
  await field.dispatchEvent('compositionend',{data:'한글'});
  assert.ok(await page.evaluate(text=>Object.values(localStorage).some(value=>value.includes(text)),`${message} 한글`));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:mode,exact:true}).click();
  await page.waitForFunction(text=>document.body.innerText.includes(text)||Array.from(document.querySelectorAll('textarea')).some(el=>el.value===text),`${message} 한글`);
  console.log(`PASS ${mode}: immediate local persist, compositionend, reload`);
 }
 await context.close();
 console.log('PASS actual guest memo editors; isolated browser storage; no login or live user writes');
} finally {await browser.close();}
