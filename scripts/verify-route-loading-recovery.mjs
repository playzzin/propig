import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.env.PROPIG_ROOT || process.cwd();
const runtime = createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME || root, 'package.json'));
const React = runtime('react');
const { act, create } = runtime('react-test-renderer');
const ts = createRequire(path.join(root, 'package.json'))('typescript');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let pathname = '/propig/memos';
let reloads = 0;
let timerId = 0;
const timers = new Map();
globalThis.window = {
  setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  location: { reload() { reloads++; } },
};
const source = fs.readFileSync(path.join(root, 'src/app/loading.tsx'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exportsObject = {};
new Function('require', 'exports', js)((id) => {
  if (id === 'next/navigation') return { usePathname: () => pathname };
  return runtime(id);
}, exportsObject);

(async () => {
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(exportsObject.default)); });
    assert.equal(renderer.root.findAllByType('button').length, 0);
    assert.equal(timers.size, 1);
    const delayed = [...timers.values()][0];
    assert.equal(delayed.delay, 15_000);
    await act(async () => { delayed.callback(); });
    assert.equal(reloads, 0, 'a timeout must never cause an automatic reload loop');
    assert.equal(renderer.root.findByProps({ 'data-route-loading': 'true' }).props['aria-label'], '페이지 로딩 지연');
    await act(async () => { renderer.root.findByType('button').props.onClick(); });
    assert.equal(reloads, 1, 'explicit retry reloads the current document');
    pathname = '/propig';
    await act(async () => { renderer.update(React.createElement(exportsObject.default)); });
    assert.equal(renderer.root.findAllByType('button').length, 0, 'a new route gets a fresh grace period');
    assert.equal(timers.size, 1, 'the previous route timer is cleaned up');
    await act(async () => { renderer.unmount(); });
    renderer = null;
    assert.equal(timers.size, 0, 'normal content resolution cleans up the timer');
    assert.equal(reloads, 1);
    console.log('PASS route loading: delay, explicit retry, no auto-reload, route reset, timer cleanup');
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
    delete globalThis.window;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
