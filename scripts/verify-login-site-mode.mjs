import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Executes the real dialog, picker, profile menu and CSS. Only identity, menu
// context and navigation are fixtures; no Firebase or external network is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.env.LOGIN_TEST_RUNTIME || root, 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('playwright-core');
const css = (await readFile(path.join(root, 'src/app/globals.css'), 'utf8'))
    .replace(/^@import[^;]+;\s*/gm, '');
const contextSource = `
    import { createContext, useContext } from 'react';
    export const Auth = createContext({});
    export const Menu = createContext({});
    export const Navigation = createContext({});
    export const useAuth = () => useContext(Auth);
    export const useMenuContext = () => useContext(Menu);
    export const useRouter = () => useContext(Navigation).router;
    export const usePathname = () => useContext(Navigation).pathname;
`;
const bundle = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
        import React, { StrictMode, useCallback, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { flushSync } from 'react-dom';
        import { LoginModal } from './src/components/LoginModal';
        import { ProfileButton } from './src/components/ProfileButton';
        import { Auth, Menu, Navigation } from 'login-fixture';
        const sites = {
            corp: { name: '기업', icon: 'building', menu: [] },
            blog: { name: '블로그', icon: 'pen-nib', menu: [] },
            shop: { name: 'propig', icon: 'bullseye', menu: [] },
            admin: { name: '통합 관리', icon: 'shield-halved', menu: [] },
            'account-menu': { name: '우측 메뉴', icon: 'user', menu: [] },
        };
        const app = createRoot(document.getElementById('root'));
        let config, events, pending, session = 0;
        const begin = (kind) => {
            events.authCalls.push(kind);
            return new Promise((resolve, reject) => { pending = { resolve, reject }; });
        };
        const methods = {
            loginWithEmail: () => begin('email'),
            loginWithGoogle: () => begin('google'),
            signUpWithEmail: () => begin('signup'),
            sendPasswordReset: async () => undefined,
            logout: async () => undefined,
        };
        const router = { push: (href) => events.pushes.push(href) };
        const select = (id) => events.selections.push(id);
        function App() {
            const [open, setOpen] = useState(false);
            const openDialog = useCallback(() => setOpen(true), []);
            const closeDialog = useCallback(() => {
                events.closes += 1;
                setOpen(false);
            }, []);
            return <>
                <button id="opener" type="button" onClick={openDialog}>사이트 창 열기</button>
                <ProfileButton onOpenSiteSelection={openDialog} />
                <LoginModal isOpen={open} onClose={closeDialog} />
            </>;
        }
        const draw = () => flushSync(() => app.render(
            <StrictMode>
                <Auth.Provider value={{ ...methods, currentUser: config.user, isConfigured: config.configured, error: null }}>
                    <Menu.Provider value={{ currentSite: config.site, setCurrentSite: select,
                        siteData: config.sites || sites, userRole: config.role, siteAccess: config.siteAccess,
                        permissions: config.permissions, isLoading: config.loading,
                        currentPosition: 'staff', menuAccess: {}, filteredMenu: [] }}>
                        <Navigation.Provider value={{ pathname: config.pathname, router }}>
                            <App key={session} />
                        </Navigation.Provider>
                    </Menu.Provider>
                </Auth.Provider>
            </StrictMode>
        ));
        window.addEventListener('propig:before-navigation', (event) => {
            events.navigationEvents.push(event.detail.href);
            if (config.veto) event.preventDefault();
        });
        window.fixture = {
            reset: (next = {}) => {
                config = { site: 'corp', pathname: '/corp', role: 'guest', user: null,
                    configured: true, loading: false, permissions: {}, siteAccess: {}, veto: false, ...next };
                events = { pushes: [], selections: [], navigationEvents: [], closes: 0, authCalls: [] };
                pending = null; session += 1; draw();
            },
            update: (next) => { Object.assign(config, next); draw(); },
            resolve: (uid) => { if (!pending) throw new Error('No pending fixture authentication'); pending.resolve({ user: { uid } }); pending = null; },
            reject: (code) => { if (!pending) throw new Error('No pending fixture authentication'); pending.reject({ code }); pending = null; },
            events: () => JSON.parse(JSON.stringify(events)),
        };
        window.fixture.reset();
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'login-fixture-context', setup(api) {
        api.onResolve({ filter: /^(login-fixture|next\/navigation|@\/contexts\/(MenuContext|AuthContext)|\.\.\/contexts\/AuthContext)$/ },
            () => ({ path: 'context', namespace: 'fixture' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: contextSource, loader: 'js' }));
        api.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, ({ path: name }) => ({ path: require.resolve(name) }));
        api.onResolve({ filter: /^@\// }, async ({ path: name }) => {
            const base = path.join(root, 'src', name.slice(2));
            for (const suffix of ['.ts', '.tsx']) {
                try { await access(base + suffix); return { path: base + suffix }; } catch { /* Try the TSX module. */ }
            }
            throw new Error('Cannot resolve fixture import: ' + name);
        });
    } }],
});
const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    } else if (pathname === '/fixture.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(bundle.outputFiles[0].contents);
    } else if (pathname === '/style.css') {
        res.setHeader('Content-Type', 'text/css; charset=utf-8'); res.end(css);
    } else { res.statusCode = 404; res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let passed = 0;
const failures = [];
try {
    const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH
        || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, reducedMotion: 'reduce' });
    const externalRequests = [];
    await context.route('**/*', (route) => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        externalRequests.push(route.request().url());
        return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const events = () => page.evaluate(() => window.fixture.events());
    const update = (value) => page.evaluate((next) => window.fixture.update(next), value);
    const reset = async (value = {}) => {
        await page.evaluate((next) => window.fixture.reset(next), value);
        await page.getByRole('button', { name: '사이트 창 열기', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await settle();
    };
    const select = async (name) => {
        const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) });
        await radio.locator('..').click();
        assert.equal(await radio.isChecked(), true);
    };
    const beginEmail = async () => {
        await page.getByLabel('이메일', { exact: true }).fill('fixture@example.test');
        await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
        await page.getByRole('button', { name: /에 로그인$/ }).click();
        assert.deepEqual((await events()).authCalls, ['email']);
    };
    const noNavigation = async () => {
        await settle();
        const state = await events();
        assert.deepEqual(state.pushes, []);
        assert.deepEqual(state.selections, []);
    };
    const scenario = async (name, run) => {
        try { await run(); console.log(`PASS ${++passed}: ${name}`); }
        catch (error) { failures.push({ name, message: error.message }); console.error(`FAIL: ${name}\n${error.message}`); }
    };

    await scenario('site choice stays local and account-menu is excluded', async () => {
        await reset();
        assert.equal(await page.getByRole('radio').count(), 4);
        assert.equal(await page.getByRole('radio', { name: /우측 메뉴/ }).count(), 0);
        for (const name of ['블로그', 'propig', '통합 관리', '기업']) await select(name);
        await noNavigation();
        assert.equal((await events()).closes, 0);
    });
    for (const [name, site, href] of [['기업', 'corp', '/corp'], ['블로그', 'blog', '/blog'], ['propig', 'shop', '/propig']]) {
        await scenario(`guest continues to ${site} at ${href}`, async () => {
            await reset({ pathname: '/bookmarks' }); await select(name);
            await page.getByRole('button', { name: new RegExp(`로그인 없이 ${name} 둘러보기`) }).click();
            await settle();
            const state = await events();
            assert.deepEqual(state.pushes, [href]); assert.deepEqual(state.selections, [site]);
            assert.equal(state.closes, 1); assert.equal(await page.getByRole('dialog').count(), 0);
        });
    }
    await scenario('admin guest entry is unavailable', async () => {
        await reset(); await select('통합 관리');
        assert.equal(await page.getByRole('button', { name: /로그인 없이/ }).count(), 0);
        await noNavigation();
    });
    for (const pathname of ['/admin', '/admin/menu']) {
        await scenario(`${pathname} preserves admin login intent despite guest corp fallback`, async () => {
            await reset({ pathname, site: 'corp' });
            assert.equal(await page.getByRole('radio', { name: /^통합 관리/ }).isChecked(), true);
            assert.equal(await page.getByRole('radio', { name: /^기업/ }).isChecked(), false);
            assert.equal(await page.getByRole('button', { name: '통합 관리에 로그인', exact: true }).count(), 1);
            assert.equal(await page.getByRole('button', { name: /로그인 없이/ }).count(), 0);
            await noNavigation();
        });
    }
    await scenario('public browse ignores incomplete credentials and native email validation', async () => {
        await reset(); await select('블로그');
        await page.getByLabel('이메일', { exact: true }).fill('invalid-email');
        await page.getByLabel('비밀번호', { exact: true }).fill('x');
        await page.getByRole('button', { name: /로그인 없이 블로그 둘러보기/ }).click();
        await settle();
        const firstAttempt = await events();
        if (firstAttempt.pushes.length === 0) {
            const validation = await page.locator('.auth-alert.error').allTextContents();
            await page.getByRole('button', { name: /로그인 없이 블로그 둘러보기/ }).click();
            await settle();
            assert.deepEqual(firstAttempt.pushes, ['/blog'], JSON.stringify({
                firstAttempt, validation, secondAttempt: await events(),
                reason: 'Public browse must work on the first click even when blur validation adds content.',
            }));
        }
        assert.deepEqual(firstAttempt.pushes, ['/blog']);
        assert.deepEqual((await events()).authCalls, []);
        assert.equal(await page.getByRole('dialog').count(), 0);
    });
    await scenario('admin login waits for matching identity and access then navigates once', async () => {
        await reset(); await select('통합 관리'); await beginEmail();
        assert.equal(await page.getByRole('radio', { name: /^기업/ }).isDisabled(), true);
        await page.evaluate(() => window.fixture.resolve('admin-user'));
        await update({ user: { uid: 'other-user' }, role: 'admin', loading: false }); await noNavigation();
        await update({ user: { uid: 'admin-user' }, role: 'admin', loading: true }); await noNavigation();
        await update({ loading: false }); await settle();
        assert.deepEqual((await events()).pushes, ['/admin']);
        assert.deepEqual((await events()).selections, ['admin']);
        await update({ permissions: { menuManagement: true } }); await settle();
        assert.deepEqual((await events()).pushes, ['/admin']);
        assert.equal(await page.getByRole('dialog').count(), 0);
    });
    await scenario('ordinary account denied admin remains in dialog', async () => {
        await reset(); await select('통합 관리'); await beginEmail();
        await page.evaluate(() => window.fixture.resolve('ordinary-user'));
        await update({ user: { uid: 'ordinary-user' }, role: 'user', loading: false });
        await page.getByRole('alert').filter({ hasText: /접근 권한이 없습니다/ }).waitFor();
        await noNavigation(); assert.equal(await page.getByRole('dialog').count(), 1);
        assert.equal(await page.getByRole('radio', { name: /^통합 관리/ }).count(), 0);
        await page.getByRole('button', { name: '닫기', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'radio', 'denied selection must leave a keyboard entry into the remaining sites');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('radio', { name: /^블로그/ }).isChecked(), true);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        assert.deepEqual((await events()).pushes, ['/blog']);
    });
    for (const kind of ['email', 'google']) {
        await scenario(`${kind} failure preserves selected site and dialog`, async () => {
            await reset(); await select('블로그');
            if (kind === 'email') await beginEmail();
            else await page.getByRole('button', { name: 'Google로 계속하기', exact: true }).click();
            await page.evaluate((code) => window.fixture.reject(code), kind === 'email' ? 'auth/invalid-credential' : 'auth/popup-closed-by-user');
            await page.getByRole('alert').waitFor(); await noNavigation();
            assert.equal(await page.getByRole('radio', { name: /^블로그/ }).isChecked(), true);
            assert.equal(await page.getByRole('dialog').count(), 1);
        });
    }
    await scenario('persistent wrapper resets credentials, error, password visibility and mode on reopen', async () => {
        await reset(); await select('블로그'); await beginEmail();
        await page.evaluate(() => window.fixture.reject('auth/invalid-credential'));
        await page.getByRole('alert').waitFor();
        await page.getByRole('button', { name: '비밀번호 표시', exact: true }).click();
        assert.equal(await page.getByLabel('비밀번호', { exact: true }).getAttribute('type'), 'text');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '사이트 창 열기', exact: true }).click();
        await page.getByRole('dialog', { name: '로그인', exact: true }).waitFor();
        assert.equal(await page.getByLabel('이메일', { exact: true }).inputValue(), '');
        assert.equal(await page.getByLabel('비밀번호', { exact: true }).inputValue(), '');
        assert.equal(await page.getByLabel('비밀번호', { exact: true }).getAttribute('type'), 'password');
        assert.equal(await page.getByRole('alert').count(), 0);
        assert.equal(await page.getByRole('radio', { name: /^기업/ }).isChecked(), true);
        await select('블로그');
        await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
        await page.getByRole('dialog', { name: '회원가입', exact: true }).waitFor();
        await page.getByLabel('이메일', { exact: true }).fill('another@example.test');
        await page.getByLabel('비밀번호', { exact: true }).fill('another-password');
        await page.getByRole('button', { name: '닫기', exact: true }).click();
        await page.getByRole('button', { name: '사이트 창 열기', exact: true }).click();
        await page.getByRole('dialog', { name: '로그인', exact: true }).waitFor();
        assert.equal(await page.getByLabel('이메일', { exact: true }).inputValue(), '');
        assert.equal(await page.getByLabel('비밀번호', { exact: true }).inputValue(), '');
        assert.equal(await page.getByRole('radio', { name: /^기업/ }).isChecked(), true);
        await noNavigation();
    });
    await scenario('before-navigation veto preserves dialog and current mode', async () => {
        await reset({ veto: true }); await select('블로그');
        await page.getByRole('button', { name: /로그인 없이 블로그 둘러보기/ }).click();
        await noNavigation(); assert.deepEqual((await events()).navigationEvents, ['/blog']);
        assert.equal(await page.getByRole('dialog').count(), 1); assert.equal((await events()).closes, 0);
    });
    for (const stage of ['credential', 'permissions']) {
        await scenario(`close before late ${stage} response prevents navigation`, async () => {
            await reset(); await select('통합 관리'); await beginEmail();
            if (stage === 'permissions') {
                await update({ user: { uid: 'late-user' }, role: 'admin', loading: true });
                await page.evaluate(() => window.fixture.resolve('late-user')); await settle();
            }
            await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
            if (stage === 'credential') await page.evaluate(() => window.fixture.resolve('late-user'));
            await update({ user: { uid: 'late-user' }, role: 'admin', loading: false }); await noNavigation();
        });
    }
    await scenario('signed-in profile has a single dialog entry and no mode grid', async () => {
        await page.evaluate(() => window.fixture.reset({ user: { uid: 'member', displayName: '테스트 사용자', email: 'fixture@example.test' }, role: 'user' }));
        await page.getByRole('button', { name: /테스트 사용자/ }).click();
        const menu = page.getByRole('menu', { name: '계정 및 작업 환경' }); await menu.waitFor();
        assert.equal(await menu.getByRole('radio').count(), 0);
        assert.equal(await menu.getByRole('menuitem', { name: /^사이트 선택/ }).count(), 1);
        await menu.getByRole('menuitem', { name: /^사이트 선택/ }).click();
        await page.getByRole('dialog', { name: '사이트 선택' }).waitFor();
        assert.equal(await page.getByRole('menu').count(), 0);
        assert.equal(await page.getByRole('textbox', { name: '이메일' }).count(), 0);
        await noNavigation();
    });
    await scenario('keyboard focus remains trapped and Escape restores opener', async () => {
        await reset();
        for (const key of [...Array(16).fill('Tab'), ...Array(16).fill('Shift+Tab')]) {
            await page.keyboard.press(key);
            assert.equal(await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement))), true);
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'opener');
    });
    for (const [width, height] of [[1365, 900], [390, 844]]) {
        await scenario(`actual dialog CSS fits ${width}px viewport without horizontal overflow`, async () => {
            await page.setViewportSize({ width, height }); await reset();
            const bounds = await page.locator('.auth-modal-card').evaluate((card) => {
                const rect = card.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    overflow: card.scrollWidth - card.clientWidth,
                    documentOverflow: document.documentElement.scrollWidth - innerWidth,
                    columns: getComputedStyle(card.querySelector('.auth-site-grid')).gridTemplateColumns };
            });
            assert.ok(bounds.left >= 0 && bounds.right <= width + 1, JSON.stringify(bounds));
            assert.ok(bounds.top >= 0 && bounds.bottom <= height + 1, JSON.stringify(bounds));
            assert.ok(bounds.overflow <= 1 && bounds.documentOverflow <= 1, JSON.stringify(bounds));
            assert.ok(bounds.columns.split(' ').length === 2, 'real two-column picker CSS must load');
            await page.getByRole('button', { name: /로그인 없이 기업 둘러보기/ }).scrollIntoViewIfNeeded();
            assert.equal(await page.getByRole('button', { name: /로그인 없이 기업 둘러보기/ }).isVisible(), true);
        });
    }
    await scenario('no browser errors or external network requests', async () => {
        assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
    });
    if (failures.length) throw new Error(`${failures.length} scenario(s) failed:\n${failures.map((item) => '- ' + item.name + ': ' + item.message).join('\n')}`);
    console.log(`Login site mode: ${passed} browser scenarios passed. Real components/CSS; mocked identity/menu/router only.`);
} finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
}
