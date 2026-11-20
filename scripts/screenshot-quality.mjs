import assert from 'node:assert/strict';

export async function waitForAnimationFrame(page) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(resolve);
            });
          }),
      );
      return;
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}

async function resolveScreenshotProbeRect(page, probe) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await page.evaluate((currentProbe) => {
        const candidates = Array.from(document.querySelectorAll(currentProbe.selector));
        const element = candidates.find(
          (candidate) => candidate instanceof HTMLElement && (!currentProbe.text || candidate.textContent?.includes(currentProbe.text)),
        );

        if (!(element instanceof HTMLElement)) {
          return { found: false };
        }

        const rect = element.getBoundingClientRect();

        return {
          found: true,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }, probe);
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}

async function analyzeScreenshotProbe(page, screenshot, probeRect) {
  const analysisPage = await page.context().newPage();

  try {
    return await analysisPage.evaluate(
      async ({ base64, rect }) => {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${base64}`;
        });

        const left = Math.max(0, Math.floor(rect.left - 8));
        const top = Math.max(0, Math.floor(rect.top - 8));
        const width = Math.min(image.naturalWidth - left, Math.ceil(rect.width + 16));
        const height = Math.min(image.naturalHeight - top, Math.ceil(rect.height + 16));

        if (width <= 0 || height <= 0) {
          return {
            found: true,
            samplePixels: 0,
            luminanceRange: 0,
            contrastPixelRatio: 0,
            rect: { left, top, width, height },
          };
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          return {
            found: true,
            samplePixels: 0,
            luminanceRange: 0,
            contrastPixelRatio: 0,
            rect: { left, top, width, height },
          };
        }

        context.drawImage(image, left, top, width, height, 0, 0, width, height);

        const data = context.getImageData(0, 0, width, height).data;
        const luminanceValues = [];
        let minLuminance = 255;
        let maxLuminance = 0;
        let luminanceTotal = 0;

        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] < 50) continue;

          const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
          luminanceValues.push(luminance);
          minLuminance = Math.min(minLuminance, luminance);
          maxLuminance = Math.max(maxLuminance, luminance);
          luminanceTotal += luminance;
        }

        const samplePixels = luminanceValues.length;
        const averageLuminance = samplePixels > 0 ? luminanceTotal / samplePixels : 0;
        const contrastPixels = luminanceValues.filter((luminance) => Math.abs(luminance - averageLuminance) > 32).length;

        return {
          found: true,
          samplePixels,
          luminanceRange: Math.round(maxLuminance - minLuminance),
          contrastPixelRatio: samplePixels > 0 ? contrastPixels / samplePixels : 0,
          rect: { left, top, width, height },
        };
      },
      { base64: screenshot.toString('base64'), rect: probeRect },
    );
  } finally {
    await analysisPage.close().catch(() => {});
  }
}

async function assertScreenshotProbe(page, screenshot, viewportName, slug, probe, probeRect) {
  const analysis = await analyzeScreenshotProbe(page, screenshot, probeRect);
  const probeLabel = probe.label ?? probe.text ?? probe.selector;
  const minLuminanceRange = probe.minLuminanceRange ?? 60;
  const minContrastPixelRatio = probe.minContrastPixelRatio ?? 0.025;

  assert.ok(analysis.found, `${viewportName} ${slug} screenshot probe was not found: ${probeLabel}`);
  assert.ok(analysis.samplePixels >= 100, `${viewportName} ${slug} screenshot probe has too few pixels: ${probeLabel}`);
  assert.ok(
    analysis.luminanceRange >= minLuminanceRange,
    `${viewportName} ${slug} screenshot probe appears visually flat: ${probeLabel} (${analysis.luminanceRange} luminance range)`,
  );
  assert.ok(
    analysis.contrastPixelRatio >= minContrastPixelRatio,
    `${viewportName} ${slug} screenshot probe has too little visible contrast: ${probeLabel} (${analysis.contrastPixelRatio.toFixed(
      4,
    )})`,
  );
}

export async function captureVerifiedScreenshot(page, { screenshotPath, minSize, viewportName, slug, probe }) {
  await waitForAnimationFrame(page);
  const probeRect = await resolveScreenshotProbeRect(page, probe);
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true });

  assert.ok(screenshot.length > minSize, `${viewportName} ${slug} screenshot is unexpectedly small`);
  assert.ok(probeRect.found, `${viewportName} ${slug} screenshot probe was not found: ${probe.label ?? probe.text ?? probe.selector}`);
  await assertScreenshotProbe(page, screenshot, viewportName, slug, probe, probeRect);

  return screenshot;
}
