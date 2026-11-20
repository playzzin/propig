import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional Linux dependency root avoids replacing the Windows repository node_modules.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.env.FAVICON_TEST_RUNTIME || root, 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('playwright-core');
const svg = await readFile(path.join(root, 'public/propig-favicon.svg'));
const bundle = await build({
    stdin: { contents: `
        import React, { StrictMode } from 'react';
        import { createRoot } from 'react-dom/client';
        import { flushSync } from 'react-dom';
        import DynamicFavicon from './src/components/DynamicFavicon';
        import { Menu, System } from 'fixture-context';
        import { faviconHref } from './src/lib/siteFavicon';
        const root = createRoot(document.getElementById('root'));
        window.renderMode = (currentSite, settings = {}, mounted = true) => flushSync(() => root.render(
            <StrictMode><Menu.Provider value={{ currentSite, siteData: {
                corp: { menu: [{ path: '/' }] }, shop: { menu: [{ path: '/' }] }
            } }}><System.Provider value={{ settings }}>{mounted && <DynamicFavicon />}</System.Provider></Menu.Provider></StrictMode>
        ));
        window.faviconHref = faviconHref;
    `, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    plugins: [{ name: 'isolated-context', setup(api) {
        api.onResolve({ filter: /^(fixture-context|@\/contexts\/(MenuContext|SystemContext))$/ }, () => ({ path: 'context', namespace: 'fixture' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
            import { createContext, useContext } from 'react';
            export const Menu = createContext({}); export const System = createContext({});
            export const useMenuContext = () => useContext(Menu);
            export const useSystem = () => useContext(System);
        `, loader: 'js' }));
        api.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, ({ path: name }) => ({ path: require.resolve(name) }));
        api.onResolve({ filter: /^@\// }, ({ path: name }) => ({ path: path.join(root, 'src', name.slice(2) + '.ts') }));
    } }],
});
let failDefault = false;
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<html><head><link id="static" rel="icon" href="/static.svg"><link rel="shortcut icon" href="/static.ico"><link id="touch" rel="apple-touch-icon" href="/touch.png"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    } else if (url.pathname === '/fixture.js') {
        res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents);
    } else if (url.pathname === '/bad.svg' || (failDefault && url.pathname === '/propig-favicon.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml'); res.end('not an image');
    } else {
        res.setHeader('Content-Type', 'image/svg+xml');
        if (url.pathname === '/slow.svg') setTimeout(() => { if (!res.destroyed) res.end(svg); }, 350);
        else if (url.pathname === '/timeout.svg') setTimeout(() => { if (!res.destroyed) res.end(svg); }, 5500);
        else res.end(svg);
    }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
let passed = 0;
try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://signed.invalid/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const render = (site, settings = {}, mounted = true) => page.evaluate(([s, v, m]) => window.renderMode(s, v, m), [site, settings, mounted]);
    const expectIcon = async (part, label) => {
        await page.waitForFunction((part) => {
            const links = [...document.querySelectorAll('link[rel]')].filter((l) => /(?:^|\s)icon(?:\s|$)/i.test(l.rel));
            return links.length === 1 && links[0].dataset.dynamicFavicon === 'true' && links[0].href.includes(part);
        }, part);
        console.log(`PASS ${++passed}: ${label}`);
    };
    const settings = { envFavicons: { corp: '/corp.svg', shop: '/shop.svg' }, faviconUrl: '/global.svg' };
    await render('shop', settings);
    await expectIcon('/shop.svg', 'currentSite wins despite shared root path and corp-first menu');
    await render('corp', settings);
    await expectIcon('/corp.svg', 'mode change');
    await render('shop', { envFavicons: { shop: '/slow.svg' } });
    await expectIcon('/propig-favicon.svg', 'pending image never retains previous mode');
    await render('corp', settings);
    await expectIcon('/corp.svg', 'rapid switch wins');
    await page.waitForTimeout(450);
    await expectIcon('/corp.svg', 'late old image cannot overwrite current mode');
    await render('corp', { envFavicons: { corp: '/updated.svg' }, brandAssetsVersion: 42 });
    await expectIcon('/updated.svg', 'settings replacement');
    assert.match(await page.locator('link[data-dynamic-favicon]').getAttribute('href'), /favicon_v=propig-v3-42/);
    const signed = 'https://signed.invalid/icon.svg?X-Signature=a%2Fb+z&x=1&x=2#keep';
    await render('corp', { envFavicons: { corp: signed }, brandAssetsVersion: 43 });
    await expectIcon('signed.invalid', 'external signed URL decodes');
    assert.equal(await page.locator('link[data-dynamic-favicon]').getAttribute('href'), signed);
    console.log(`PASS ${++passed}: external signed query preserved byte-for-byte`);
    await render('shop', { envFavicons: { propig: '/alias.svg' } });
    await expectIcon('/alias.svg', 'legacy shop/propig alias');
    await render('corp', { envFavicons: { corp: '/bad.svg' }, faviconUrl: '/global.svg' });
    await expectIcon('/global.svg', 'malformed site image falls back to global');
    await render('corp', { envFavicons: { corp: 'data:image/png;base64,YmFk' }, faviconUrl: '/global.svg' });
    await expectIcon('/global.svg', 'malformed data image is validated');
    await render('corp', { envFavicons: { corp: 'blob:http://127.0.0.1/missing' }, faviconUrl: '/global.svg' });
    await expectIcon('/global.svg', 'revoked/missing blob falls back');
    await render('corp', { envFavicons: { corp: 'javascript:alert(1)' }, faviconUrl: '/bad.svg' });
    await expectIcon('/propig-favicon.svg', 'unsafe URL and invalid global use bundled default');
    await render('corp', { envFavicons: { corp: '/timeout.svg' }, faviconUrl: '/global.svg' });
    await expectIcon('/global.svg', 'image timeout falls back');
    await render('corp', {});
    await expectIcon('/propig-favicon.svg', 'deleted settings reset to default');
    await page.evaluate(() => {
        const next = document.createElement('link'); next.id = 'next'; next.rel = 'icon'; next.href = '/next.svg'; document.head.append(next);
        document.getElementById('static').rel = 'shortcut icon';
        document.querySelector('link[data-dynamic-favicon]').remove();
    });
    await expectIcon('/propig-favicon.svg', 'late Next metadata and removal reconciled');
    assert.equal(await page.locator('#touch').getAttribute('rel'), 'apple-touch-icon');
    await render('corp', {}, false);
    assert.equal(await page.locator('link[data-dynamic-favicon]').count(), 0);
    assert.equal(await page.locator('#next').getAttribute('rel'), 'icon');
    assert.equal(await page.locator('#static').getAttribute('rel'), 'shortcut icon');
    console.log(`PASS ${++passed}: unmount restores framework nodes and preserves touch icons`);
    failDefault = true;
    await render('corp', { faviconUrl: '/bad.svg', brandAssetsVersion: 999 });
    await expectIcon('data:image/svg+xml', 'all network images failed: neutral terminal fallback');
    assert.deepEqual(errors, []);
    console.log(`Site favicon: ${passed} browser scenarios passed; no React/page errors.`);
} finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
}
