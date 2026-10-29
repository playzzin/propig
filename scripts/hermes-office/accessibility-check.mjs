import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import axe from "axe-core";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 1000 },
    bypassCSP: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3010");
  await page.getByRole("heading", { name: "사무실", exact: true }).waitFor();
  await page.addScriptTag({ content: axe.source });
  const failures = [];
  for (const view of [
    "사무실",
    "직원·조직",
    "업무 보드",
    "프로젝트",
    "기록 보관함",
    "성과·포상",
    "교육·지식",
    "회사 설정",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`^${view}`) })
      .first()
      .click();
    const result = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      }),
    );
    failures.push(
      ...result.violations.map((v) => ({
        view,
        id: v.id,
        impact: v.impact,
        targets: v.nodes.map((n) => n.target),
      })),
    );
  }
  if (failures.length) console.log(JSON.stringify(failures, null, 2));
  assert.equal(failures.length, 0);
  console.log("PASS: eight views WCAG automated accessibility checks");
} finally {
  await browser.close();
}
