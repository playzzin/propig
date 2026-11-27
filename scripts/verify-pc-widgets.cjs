// The real snapshot decoder and React widgets run against local readings and simulated time.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const repo = path.resolve(__dirname, '..');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || repo, 'package.json'));
const qa = process.env.PROPIG_QA_TOOLS ? createRequire(path.join(process.env.PROPIG_QA_TOOLS, 'package.json')) : runtime;
const ts = runtime('typescript');
const React = qa('react');
const { create, act } = qa('react-test-renderer');
const { renderToString } = qa('react-dom/server');
const widgets = path.join(repo, 'src/app/propig/pc-widgets');
const icons = new Proxy({}, {
  get: (cache, name) => cache[name] ??= function Icon(props) { return React.createElement('svg', { ...props, 'data-icon': name }); },
});

function load(name, replacements = {}) {
  const filename = path.join(widgets, name);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const exports = {};
  function importFixture(id) {
    if (Object.hasOwn(replacements, id)) return replacements[id];
    if (id === 'react' || id === 'react/jsx-runtime') return qa(id);
    if (id.endsWith('.module.css')) return {};
    if (id === 'lucide-react') return icons;
    throw new Error(`Unexpected widget dependency: ${id}`);
  }
  vm.compileFunction(outputText, ['exports', 'require'], { filename })(exports, importFixture);
  return exports;
}

const contract = load('pcSnapshot.ts');
const clock = load('ClockCalendar.tsx');
const panels = load('DevicePanels.tsx');
const sourceTime = Date.parse('2024-02-29T14:59:00Z'); // 23:59 on leap day in Korea
const layoutId = 1_812_365_004_517;
let now = sourceTime;
const daily = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(sourceTime + index * 86400000).toISOString().slice(0, 10), tokens: index === 1 ? null : index,
}));
const fixture = {
  version: 1, sampledAt: sourceTime,
  system: { updatedAt: sourceTime, cpu: 0, ram: null, swap: null, disk: 100, cpuName: 'Fixture CPU', gpuName: null },
  sensors: { updatedAt: sourceTime, cpuTemp: 0, gpuTemp: null, gpu: 39.5 },
  usage: {
    updatedAt: sourceTime, providers: [
      { id: 'codex', status: 'OK', short: 0, weekly: 30, weeklyReset: sourceTime + 86400000 },
      { id: 'claude', status: 'LOGIN' }, { id: 'antigravity', status: 'IDE' },
    ], daily, resets: [], flow: { balance: 0, reset: null, recorded: '2024-02-29' },
  },
  mirabox: {
    updatedAt: sourceTime, profiles: 2, pages: 3, keys: 4, online: null, layoutId,
    slots: [
      { index: 0, label: '웹' }, { index: 14, label: '키 15' },
      { index: 27, label: '비활성' }, { index: 31, label: 'Codex' },
    ],
  },
  weather: {
    updatedAt: sourceTime, current: { temperature: 0, code: 0, day: false },
    days: daily.map(({ date }, index) => ({ date, code: 71, high: 3, low: -1, rain: index === 0 ? 0 : null })),
  },
};

function checkDecoder() {
  const { readPcSnapshot, isPcPanel, pcPanels } = contract;
  assert.deepEqual(pcPanels.map(({ id }) => id), ['system', 'clock', 'calendar', 'usage', 'mirabox', 'dock']);
  assert(pcPanels.every(({ id }) => isPcPanel(id)));
  assert.equal(isPcPanel('unknown'), false);
  for (const invalid of [null, {}, [], '{', ' '.repeat(32769), { ...fixture, version: 2 }, { ...fixture, system: {} }]) {
    assert.equal(readPcSnapshot(invalid), null);
  }
  const snapshot = readPcSnapshot(JSON.stringify(fixture));
  assert.deepEqual(snapshot, readPcSnapshot(fixture));
  assert.equal(snapshot.system.cpu, 0);
  assert.equal(snapshot.system.ram, null);
  assert.equal(snapshot.usage.daily[0].tokens, 0);
  assert.equal(snapshot.usage.daily[1].tokens, null);
  assert.equal(snapshot.weather.days[0].rain, 0);
  assert.equal(snapshot.weather.days[1].rain, null);
  assert.equal(snapshot.mirabox.online, null);
  assert.equal(snapshot.mirabox.layoutId, layoutId);
  for (const invalidLayout of [undefined, 0, -1, '2', 3.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(readPcSnapshot({ ...fixture, mirabox: { ...fixture.mirabox, layoutId: invalidLayout } }).mirabox.layoutId, null);
  }
  const noisy = structuredClone(fixture);
  const privateText = 'do-not-surface-this';
  noisy.command = privateText;
  noisy.system.ram = 101;
  noisy.sensors.gpu = -1;
  noisy.usage.providers[0].short = '0';
  noisy.usage.providers[1].status = privateText;
  noisy.usage.providers[0].details = privateText;
  noisy.usage.daily.push({ date: '2024-03-08', tokens: 99 });
  noisy.mirabox.slots = Array.from({ length: 33 }, (_, index) => ({ index, label: 'Codex', path: privateText }));
  noisy.mirabox.slots[0].label = privateText;
  noisy.weather.days.push({ date: '2024-03-08', code: 2, high: 1, low: 0, rain: 0 });
  const cleaned = readPcSnapshot(noisy);
  assert(!JSON.stringify(cleaned).includes(privateText));
  assert.equal(cleaned.system.ram, null);
  assert.equal(cleaned.sensors.gpu, null);
  assert.equal(cleaned.usage.providers[0].short, null);
  assert.equal(cleaned.usage.providers[1].status, 'ERROR');
  assert.equal(cleaned.usage.daily.length, 7);
  assert.equal(cleaned.mirabox.slots.length, 32);
  assert.equal(cleaned.mirabox.slots[0].label, '키 1');
  assert.equal(readPcSnapshot({ ...fixture, mirabox: { ...fixture.mirabox, keys: null } }).mirabox, null);
  assert.equal(readPcSnapshot({ ...fixture, mirabox: { ...fixture.mirabox, keys: 0, slots: [] } }).mirabox.keys, 0);
  assert.equal(cleaned.weather.days.length, 7);
  assert.equal(readPcSnapshot({ ...fixture, weather: { updatedAt: sourceTime } }).weather, null);
  assert.equal(readPcSnapshot({ ...fixture, usage: {} }).usage, null);
  return snapshot;
}

const timers = new Map();
let timerId = 0;
const schedule = callback => { timers.set(++timerId, callback); return timerId; };
const cancel = id => timers.delete(id);
const document = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = document;
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout: schedule, clearTimeout: cancel, setInterval: schedule, clearInterval: cancel,
  location: { search: '' },
});

const element = React.createElement;
const heading = calendar => calendar.findByType('h2').children.join('');
function renderedText(node) {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(renderedText).join('');
}

async function checkPanels(sample) {
  assert.match(renderToString(element(clock.ClockWeatherPanel)), /––:––/);
  let view;
  const events = [];
  function render(snapshot, desktop = false) {
    return element(React.Fragment, null,
      element(clock.ClockWeatherPanel, { weather: snapshot.weather }),
      element(clock.CalendarPanel),
      element(panels.SystemPanel, { system: snapshot.system, sensors: snapshot.sensors }),
      element(panels.UsagePanel, { usage: snapshot.usage }),
      element(panels.MiraBoxPanel, {
        mirabox: snapshot.mirabox, onAction: id => events.push(id), onPress: (index, revision) => events.push([index, revision]),
      }),
      element(panels.DockPanel, { desktop, onAction: desktop ? id => events.push(id) : undefined }));
  }
  await act(async () => { view = create(render(sample)); });
  try {
    const calendar = view.root.findByType(clock.CalendarPanel);
    const weather = view.root.findByType(clock.ClockWeatherPanel);
    const mira = view.root.findByType(panels.MiraBoxPanel);
    const usage = view.root.findByType(panels.UsagePanel);
    const system = view.root.findByType(panels.SystemPanel);
    assert.equal(heading(calendar), '2024년 2월');
    assert.equal(calendar.findByProps({ 'aria-current': 'date' }).props.dateTime, '2024-02-29');
    assert.equal(calendar.findAllByType('td').length, 42);
    await act(async () => calendar.findByProps({ 'aria-label': '다음 달' }).props.onClick());
    assert.equal(heading(calendar), '2024년 3월');
    await act(async () => calendar.findAllByType('button').find(button => renderedText(button) === '오늘').props.onClick());
    assert.equal(heading(calendar), '2024년 2월');
    assert.equal(weather.findAllByType('time')[0].children[0], '23:59');
    assert.equal(weather.findAllByType('tr').length, 8);
    assert(weather.findAllByType('td').some(cell => renderedText(cell) === '0%'));
    assert(weather.findAllByType('td').some(cell => renderedText(cell) === '—'));
    assert.equal(system.findByProps({ 'aria-label': 'CPU 사용률' }).props.value, 0);
    assert.equal(system.findByProps({ 'aria-label': '메모리 측정값 없음' }).props.role, 'img');
    assert.equal(usage.findByProps({ 'aria-label': '5시간 잔여' }).props.value, 0);
    assert.equal(usage.findByProps({ 'data-provider': 'claude' }).findAllByType('progress').length, 0);
    assert.equal(mira.findAllByType('li').length, 32);
    const rows = mira.findAllByType('li');
    const firstKey = rows[0].findByType('button');
    assert.equal(firstKey.props['aria-label'], '1번 키, 웹 실행 확인');
    assert.equal(firstKey.props.type, 'button');
    assert.notEqual(firstKey.props.tabIndex, -1, 'an enabled key retains native keyboard activation');
    assert.equal(rows[31].findByType('button').props['aria-label'], '32번 키, Codex 실행 확인');
    for (const index of [1, 14, 27]) {
      assert.equal(rows[index].findAllByType('button').length, 0, 'empty, unrecognized and disabled keys are read-only');
      assert.match(rows[index].props.title, new RegExp('^' + (index + 1) + '번 키, '));
    }
    await act(async () => firstKey.props.onClick());
    assert.deepEqual(events.pop(), [0, layoutId], 'displayed key 1 addresses native index 0 and the rendered layout only');
    assert.match(renderedText(mira), /기기 연결 미확인/);
    const controls = mira.findAllByType('button').find(button => renderedText(button).includes('컨트롤 열기'));
    await act(async () => controls.props.onClick());
    assert.deepEqual(events, ['mira-controls']);
    await act(async () => view.update(render({ ...sample, mirabox: { ...sample.mirabox, layoutId: null } })));
    assert(mira.findAllByType('li').every(slot => slot.findAllByType('button').length === 0), 'a legacy layout can be viewed without executing keys');
    const dock = view.root.findByType(panels.DockPanel);
    assert(dock.findAllByType('button').every(button => button.props.disabled));
    assert(dock.findAllByType('a').some(link => link.props.href === 'https://chatgpt.com/'));
    await act(async () => view.update(render(sample, true)));
    for (const name of ['ChatGPT', 'Gemini']) {
      await act(async () => dock.findAllByType('button').find(button => renderedText(button) === name).props.onClick());
    }
    assert.deepEqual(events.slice(-2), ['chatgpt', 'gemini'], 'native web shortcuts use the approved host actions');

    now += 60_000;
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(heading(calendar), '2024년 3월');
    assert.equal(weather.findAllByType('time')[0].children[0], '00:00');
    assert.equal(calendar.findByProps({ 'aria-current': 'date' }).props.dateTime, '2024-03-01');
    now += 3600000;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      for (const tick of [...timers.values()]) tick();
      view.update(render({ ...sample, mirabox: { ...sample.mirabox, online: true } }));
    });
    assert.match(renderedText(weather), /최근 수신/);
    assert.match(renderedText(mira), /마지막 측정 시 연결됨/);
    assert.equal(mira.findByProps({ 'data-live': false }).props['data-live'], false);
  } finally {
    await act(async () => view.unmount());
  }
  assert.equal(timers.size, 0, 'widget timers stop on unmount');
}

async function checkAccountAndBridge() {
  const accounts = [];
  const messages = [];
  const auth = { currentUser: { uid: 'account-a' }, loading: false };
  const firestore = {
    collection: (_db, ...segments) => segments.join('/'),
    limit: size => size,
    query: (source, limit) => ({ source, limit }),
    onSnapshot: (query, next, error) => {
      const stream = { query, next, error, stopped: false };
      accounts.push(stream);
      return () => { stream.stopped = true; };
    },
  };
  const Board = load('PcWidgetBoard.tsx', {
    'firebase/firestore': firestore, '@/firebase/config': { db: {} },
    '@/contexts/AuthContext': { useAuth: () => auth },
    './pcSnapshot': contract, './ClockCalendar': clock, './DevicePanels': panels,
  }).default;
  const bridge = Object.assign(new EventTarget(), { postMessage: message => messages.push(message) });
  window.chrome = { webview: bridge };
  const device = (hex, model, revision = layoutId) => ({
    id: hex.repeat(32),
    get: key => key === 'sample' ? JSON.stringify({
      ...fixture, system: { ...fixture.system, cpuName: model }, mirabox: { ...fixture.mirabox, layoutId: revision },
    }) : undefined,
  });
  let view;
  await act(async () => { view = create(element(Board)); });
  try {
    assert.equal(accounts[0].query.source, 'users/account-a/pcWidgetDevices');
    assert.equal(messages.length, 0, 'a normal page cannot send native requests');
    await act(async () => accounts[0].next({ docs: [device('b', 'A secondary', layoutId + 8), device('a', 'A primary')] }));
    assert.match(renderedText(view.root), /A primary/);
    const chooser = view.root.findByProps({ 'aria-label': '표시할 PC' });
    await act(async () => chooser.props.onChange({ target: { value: 'b'.repeat(32) } }));
    assert.match(renderedText(view.root), /A secondary/);
    const choosePanel = label => view.root.findByType('nav').findAllByType('button').find(button => renderedText(button) === label);
    await act(async () => choosePanel('MiraBox').props.onClick());
    await act(async () => view.root.findByProps({ 'aria-label': '1번 키, 웹 실행 확인' }).props.onClick());
    assert.equal(window.location.href, 'propig-widgets:press/' + 'b'.repeat(32) + '/' + (layoutId + 8) + '/0');
    assert.equal(messages.length, 0, 'browser actions enter the local app through the device-scoped link');
    await act(async () => choosePanel('시스템 정보').props.onClick());
    auth.currentUser = { uid: 'account-b' };
    await act(async () => view.update(element(Board)));
    assert(accounts[0].stopped);
    assert.equal(accounts[1].query.source, 'users/account-b/pcWidgetDevices');
    await act(async () => accounts[0].next({ docs: [device('b', 'old account value')] }));
    assert.doesNotMatch(renderedText(view.root), /old account value|A primary|A secondary/);
    await act(async () => accounts[1].next({ docs: [device('b', 'B device'), device('z', 'Invalid document')] }));
    assert.match(renderedText(view.root), /B device/);
    assert.equal(view.root.findAllByType('select').length, 0);
    await act(async () => accounts[1].error(new Error('Fixture permission denied')));
    assert.match(renderedText(view.root), /PC 목록을 불러오지 못했습니다/);
    assert.doesNotMatch(renderedText(view.root), /B device/);
    auth.currentUser = null;
    await act(async () => view.update(element(Board)));
    assert.match(renderedText(view.root), /로그인하면/);
    assert(accounts[1].stopped);
  } finally { await act(async () => view.unmount()); }

  const response = (id, data) => bridge.dispatchEvent(new MessageEvent('message', {
    data: { version: 1, requestId: id, type: 'pc-widget-state', data: { sample: data, sharing: false } },
  }));
  auth.currentUser = { uid: 'account-a' };
  const first = '2f72dd63-74df-4768-ad80-836fb7f73122';
  const second = '962b86f5-5b40-4120-b4ec-a93f0faedd13';
  await act(async () => { view = create(element(Board, { requestId: first })); });
  try {
    assert.equal(accounts.length, 2, 'native panel reads its own PC');
    assert.deepEqual(messages[0], { version: 1, requestId: first, type: 'pc-widget-read' });
    await act(async () => { response(second, fixture); response(first, { version: 2 }); });
    assert.doesNotMatch(renderedText(view.root), /Fixture CPU/);
    await act(async () => response(first, fixture));
    assert.match(renderedText(view.root), /Fixture CPU/);
    await act(async () => view.root.findByProps({ 'aria-expanded': false }).props.onClick());
    const share = view.root.findAllByType('button').find(button => renderedText(button) === '이 PC를 내 웹에 공유');
    await act(async () => share.props.onClick());
    assert.deepEqual(messages.at(-1), { version: 1, requestId: first, type: 'pc-widget-action', target: 'share-on' });
    await act(async () => view.update(element(Board, { requestId: second })));
    await act(async () => response(first, fixture));
    assert.doesNotMatch(renderedText(view.root), /Fixture CPU/, 'a reply from a retired native session stays hidden');
  } finally { await act(async () => view.unmount()); }

  window.location.search = '?panel=mirabox';
  await act(async () => { view = create(element(Board, { requestId: second })); });
  try {
    await act(async () => response(second, fixture));
    await act(async () => view.root.findByProps({ 'aria-label': '32번 키, Codex 실행 확인' }).props.onClick());
    assert.deepEqual(messages.at(-1), {
      version: 1, requestId: second, type: 'pc-widget-action', target: 'key/' + layoutId + '/31',
    });
  } finally {
    await act(async () => view.unmount());
    window.location.search = '';
  }
  assert.equal(timers.size, 0, 'board timers stop on unmount');
}

async function main() {
  const sample = checkDecoder();
  const originalNow = Date.now;
  const originalClearInterval = globalThis.clearInterval;
  Date.now = () => now;
  globalThis.clearInterval = cancel;
  try {
    await checkAccountAndBridge();
    await checkPanels(sample);
  } finally {
    Date.now = originalNow;
    globalThis.clearInterval = originalClearInterval;
  }
  console.log('PASS PC widgets: bounded readings, six panels, KST rollover, account changes, device-scoped key links, keyboard-accessible slots and native session isolation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
