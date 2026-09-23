import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = process.env.OFFICE_URL || "http://127.0.0.1:3010";
const out = path.resolve("output/hermes-office-qa");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const faults = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => faults.push(error.message));
    await page.goto(base);
    await page.getByRole("heading", { name: "사무실", exact: true }).waitFor();
    await page.screenshot({
      path: path.join(out, `office-${viewport.width}.png`),
      fullPage: true,
    });
    assert(
      (await page.locator(".scene-employee").count()) > 0,
      "actual employee desks rendered",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert(!overflow, `no page overflow at ${viewport.width}`);
    for (const name of [
      "직원·조직",
      "업무 보드",
      "프로젝트",
      "기록 보관함",
      "성과·포상",
      "교육·지식",
      "회사 설정",
    ]) {
      await page
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .first()
        .click();
      await page.getByRole("heading", { name, exact: true }).waitFor();
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )),
        `${name} width ${viewport.width}`,
      );
    }
    await page.getByRole("button", { name: "직원·조직", exact: true }).click();
    await page.locator(".employee-card").first().click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({
      path: path.join(out, `employee-${viewport.width}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await context.close();
  }
  assert.deepEqual(faults, []);
  console.log(
    "PASS: real roster read-only desktop/mobile, 8 views, no overflow, employee dialog/Escape, no runtime errors",
  );
} finally {
  await browser.close();
}
