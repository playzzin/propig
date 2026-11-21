import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.env.PARTNERSHIP_URL || process.env.BASE_URL || 'http://127.0.0.1:3002';
const partnershipPath = '/corp/partnership/business';
const catalogProductIds = {
  'web-app': [
    'web-product-starter', 'web-operations-dashboard', 'web-customer-portal', 'web-ai-assistant',
    'cy-field-report', 'cy-workforce-database', 'cy-dashboard-starter', 'cy-integrated-suite',
  ],
  automation: [
    'automation-document', 'automation-approval', 'automation-data-sync', 'automation-ai-workflow',
    'cy-payroll-settlement', 'cy-tax-invoice', 'cy-monthly-closing', 'cy-progress-board',
  ],
  media: ['media-product-film', 'media-short-form', 'media-education', 'media-brand-campaign'],
  partner: ['partner-onboarding', 'partner-portal', 'partner-co-selling', 'partner-performance'],
};
const creEditorNames = {
  'partner-onboarding': '생성형 콘텐츠 판매 패키지',
  'partner-portal': '광고형 상품 콘텐츠',
  'partner-co-selling': '채널·상품 링크 운영',
  'partner-performance': '콘텐츠·판매 성과 대시보드',
};
const executableCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/home/hermes/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

async function resolveExecutablePath() {
  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next local Chromium executable.
    }
  }
  throw new Error('Chromium executable was not found. Set CHROME_PATH.');
}

async function readSupportMail(link) {
  const href = await link.getAttribute('href');
  assert.ok(href?.startsWith('mailto:support@propig.com?'), 'Inquiry CTA must target the support email.');
  return new URL(href).searchParams;
}

async function verifyProductContext(page, inquiryPath, productName) {
  const response = await page.goto(new URL(inquiryPath, baseUrl).href, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, inquiryPath);
  const composer = page.locator('[data-inquiry-ready="true"]:visible');
  const context = composer.getByRole('status').filter({ hasText: '제품소개에서 이어온 상담' });
  assert.equal(await context.locator('strong').innerText(), productName, inquiryPath);
  const mail = await readSupportMail(composer.getByRole('link', { name: /작성한 내용으로 메일 열기/ }));
  assert.equal(mail.get('subject'), `[PRO PIG 제휴] ${productName} 문의`);
  assert.ok(mail.get('body')?.includes(`관심 제품·서비스: ${productName}`));
  return composer;
}

async function verifyCatalogRoutes(catalogPage, inquiryPage, mobile) {
  const response = await catalogPage.goto(new URL('/corp/company/product-introduction#product-catalog', baseUrl).href, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await catalogPage.waitForFunction(() => window.history.state?.__NA === true);
  const catalog = catalogPage.locator('#product-catalog:visible');
  const activate = control => mobile ? control.tap() : control.click();
  const routes = [];

  for (const [category, products] of Object.entries(catalogProductIds)) {
    const tab = catalog.locator(`#product-category-tab-${category}`);
    await activate(tab);
    const panel = catalog.locator(`#product-category-panel-${category}`);
    const triggers = panel.locator('[data-product-accordion] > button');
    await triggers.first().waitFor();
    assert.deepEqual(await triggers.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-controls'))),
      products.map(id => `product-detail-${category}-${id}`));

    for (const [index, id] of products.entries()) {
      const trigger = triggers.nth(index);
      if (await trigger.getAttribute('aria-expanded') !== 'true') await activate(trigger);
      const detail = panel.locator(`#product-detail-${category}-${id}`);
      const catalogName = (await trigger.locator('strong').innerText()).trim();
      const productName = creEditorNames[id] ?? catalogName;
      assert.equal(catalogName, productName);

      if (id.startsWith('cy-')) {
        const link = detail.getByRole('link', { name: 'CY 상품 견적 요청', exact: true });
        const mail = await readSupportMail(link);
        assert.equal(mail.get('subject'), `[PRO PIG 웹개발 견적] ${productName}`);
        assert.ok(mail.get('body')?.includes(`관심 상품: ${productName}`));
        assert.match(mail.get('body') ?? '', /예상 구축 기간: \S/);
        routes.push({ id, name: productName, route: 'cy-quote' });
      } else {
        const link = detail.getByRole('link', { name: '구매 상담 신청', exact: true });
        const href = await link.getAttribute('href');
        assert.equal(href, `${partnershipPath}?product=${id}`);
        await verifyProductContext(inquiryPage, href, productName);
        routes.push({ id, name: productName, route: 'partnership' });
      }
    }
  }

  return routes;
}

async function verifyViewport(browser, viewport) {
  const mobile = viewport.width === 390;
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Firestore') && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) {
      errors.push(`console: ${message.text()}`);
    }
  });

  const productId = 'partner-onboarding';
  const composer = await verifyProductContext(page, `${partnershipPath}?product=${productId}`, creEditorNames[productId]);
  assert.equal(await page.getByRole('link', { name: '제휴 문의 작성으로 건너뛰기' }).getAttribute('href'), '#partnership-inquiry');
  assert.equal(await page.locator('#partnership-nav-advertising').getAttribute('href'), '/corp/partnership/advertising');
  assert.equal(await page.locator('#partnership-nav-business').getAttribute('aria-current'), 'page');

  const heroAction = page.getByRole('button', { name: '제휴 브리프 5분 작성' });
  await heroAction.click();
  await page.waitForFunction(() => document.activeElement?.id === 'partnership-organization');

  await page.locator('#partnership-organization').fill('테스트 파트너 팀');
  await page.locator('#partnership-contact').fill('담당자 test@example.com');
  await page.locator('#partnership-problem').fill('반복되는 파트너 온보딩 업무를 줄이고 싶습니다.');
  await page.locator('#partnership-outcome').fill('파트너가 같은 운영 기준으로 일하게 만들고 싶습니다.');
  await page.locator('#partnership-timing').fill('다음 분기, 예산은 협의가 필요합니다.');
  await page.locator('#partnership-resources').fill('기존 운영 문서와 담당 인력');

  await assert.doesNotReject(() => composer.getByText('5 / 5 준비', { exact: true }).waitFor({ state: 'visible' }));
  const mailLink = composer.getByRole('link', { name: /작성한 내용으로 메일 열기/ });
  const mail = await readSupportMail(mailLink);
  assert.ok(mail.get('body')?.includes(`관심 제품·서비스: ${creEditorNames[productId]}`));
  assert.match(mail.get('body') ?? '', /테스트 파트너 팀/);
  assert.match(mail.get('body') ?? '', /반복되는 파트너 온보딩 업무/);

  await composer.getByRole('button', { name: '광고 제휴' }).click();
  assert.equal(await composer.getByRole('button', { name: '광고 제휴' }).getAttribute('aria-pressed'), 'true');
  const advertisingMail = await readSupportMail(mailLink);
  assert.match(advertisingMail.get('body') ?? '', /관심 있는 제휴: 광고 제휴/);

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    mainScrollable: (() => {
      const main = document.querySelector('main');
      return main instanceof HTMLElement && main.scrollHeight > main.clientHeight;
    })(),
    siteModeVisible: Boolean([...document.querySelectorAll('summary,button')].find((element) => element.textContent?.includes('사이트 모드'))),
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewport + 1, `Document overflows: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.bodyWidth <= dimensions.viewport + 1, `Body overflows: ${JSON.stringify(dimensions)}`);
  assert.equal(dimensions.mainScrollable, true, 'Partnership page must retain its explicit scroll owner.');
  assert.equal(dimensions.siteModeVisible, false, 'Site selection belongs in the login dialog.');

  if (process.env.PARTNERSHIP_SCREENSHOT_DIR) {
    const screenshotDirectory = path.resolve(process.env.PARTNERSHIP_SCREENSHOT_DIR);
    await mkdir(screenshotDirectory, { recursive: true });
    await composer.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDirectory, `partnership-inquiry-${viewport.width}.png`),
      fullPage: false,
    });
  }

  const catalogPage = await context.newPage();
  const productRoutes = await verifyCatalogRoutes(catalogPage, page, mobile);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  await context.close();
  return { viewport, productRoutes, productContext: true, briefReady: true, overflow: false };
}

const response = await fetch(new URL(partnershipPath, baseUrl), { signal: AbortSignal.timeout(10_000) });
assert.equal(response.ok, true, `Partnership page is unavailable: ${response.status}`);
const browser = await chromium.launch({ executablePath: await resolveExecutablePath(), headless: true });
try {
  const results = [];
  results.push(await verifyViewport(browser, { width: 1440, height: 1100 }));
  results.push(await verifyViewport(browser, { width: 390, height: 844 }));
  console.log(JSON.stringify({ route: partnershipPath, results }));
} finally {
  await browser.close();
}
