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
const forecast = load('forecast.ts');
const notes = load('UsageNotes.tsx');
const panels = load('DevicePanels.tsx');
const sourceTime = Date.parse('2024-02-29T14:59:00Z'); // 23:59 on leap day in Korea
const layoutId = 1_812_365_004_517;
let now = sourceTime;
const daily = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(sourceTime + index * 86400000).toISOString().slice(0, 10), tokens: index === 1 ? null : index,
}));
const fixture = {
  version: 1, source: 'windows', sampledAt: sourceTime,
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
      { index: 0, label: '웹', runnable: true }, { index: 14, label: '키 15' },
      { index: 27, label: '비활성' }, { index: 31, label: '폴더', runnable: true },
    ],
  },
  weather: {
    updatedAt: sourceTime, current: { temperature: 0, code: 0, day: false },
    days: daily.map(({ date }, index) => ({ date, code: 71, high: 3, low: -1, rain: index === 0 ? 0 : null })),
  },
};

function checkDecoder() {
  const { readPcSnapshot, isPcPanel, pcPanels } = contract;
  assert.deepEqual(pcPanels.map(({ id }) => id), ['system', 'clock', 'calendar', 'usage', 'mirabox', 'dock', 'market']);
  assert(pcPanels.every(({ id }) => isPcPanel(id)));
  assert.equal(isPcPanel('unknown'), false);
  for (const invalid of [null, {}, [], '{', ' '.repeat(32769), { ...fixture, version: 2 }, { ...fixture, system: {} }]) {
    assert.equal(readPcSnapshot(invalid), null);
  }
  const snapshot = readPcSnapshot(JSON.stringify(fixture));
  assert.deepEqual(snapshot, readPcSnapshot(fixture));
  assert.equal(snapshot.sensors.cpuTempSource, undefined);
  const sensorReading = (temp, source) => readPcSnapshot({ ...fixture, sensors: { ...fixture.sensors, cpuTemp: temp, cpuTempSource: source } }).sensors;
  assert.equal(sensorReading(57.5, 'core-temp').cpuTempSource, 'core-temp');
  assert.equal(sensorReading(0, 'firmware').cpuTempSource, 'firmware');
  assert.equal(sensorReading(null, 'core-temp').cpuTempSource, undefined);
  assert.equal(sensorReading(57.5, 'unknown').cpuTempSource, undefined);
  assert.equal(snapshot.system.cpu, 0);
  assert.equal(snapshot.system.ram, null);
  assert.equal(snapshot.usage.daily[0].tokens, 0);
  assert.equal(snapshot.usage.daily[1].tokens, null);
  const previousStore = readPcSnapshot({ ...fixture, source: undefined });
  assert.equal(previousStore.source, 'legacy');
  assert.equal(previousStore.system.cpu, 0);
  assert.equal(previousStore.mirabox, null);
  assert.equal(previousStore.usage, null);
  assert.equal(previousStore.sensors, null);
  assert(!('weather' in snapshot));
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
  location: { search: '', assign(value) { this.href = value; } },
});

const element = React.createElement;
const heading = calendar => calendar.findByType('h2').children.join('');
function renderedText(node) {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(renderedText).join('');
}

async function checkPanels(sample) {
  assert.match(renderToString(element(clock.ClockFace)), /––:––/);
  let view;
  const events = [];
  function render(snapshot, desktop = false) {
    return element(React.Fragment, null,
      element(clock.ClockFace),
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
    const weather = view.root.findByType(clock.ClockFace);
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
    assert.equal(system.findByProps({ 'aria-label': 'CPU 사용률' }).props.value, 0);
    await act(async () => view.update(render({ ...sample, sensors: { ...sample.sensors, cpuTemp: 57.5, cpuTempSource: 'core-temp' } })));
    assert.match(renderedText(system), /57.5 °C/);
    assert.match(renderedText(system), /Core Temp · 최고 측정 온도/);
    await act(async () => view.update(render({ ...sample, sensors: null })));
    assert.match(renderedText(system), /측정 대기/);
    await act(async () => view.update(render(sample)));
    assert.equal(system.findByProps({ 'aria-label': '메모리 측정값 없음' }).props.role, 'img');
    assert.equal(usage.findByProps({ 'aria-label': '5시간 잔여' }).props.value, 0);
    assert.equal(usage.findByProps({ 'data-provider': 'claude' }).findAllByType('progress').length, 0);
    assert.equal(mira.findAllByType('li').length, 32);
    const rows = mira.findAllByType('li');
    const firstKey = rows[0].findByType('button');
    assert.equal(firstKey.props['aria-label'], '1번 키, 웹 실행 확인');
    assert.equal(firstKey.props.type, 'button');
    assert.notEqual(firstKey.props.tabIndex, -1, 'an enabled key retains native keyboard activation');
    assert.equal(rows[31].findByType('button').props['aria-label'], '32번 키, 폴더 실행 확인');
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
  const host = { isWindowsDashboard: false };
  const market = load('../market/MarketDashboard.tsx', {
    '@/lib/desktopWorkspaceRoute': host,
    './MarketChart': load('../market/MarketChart.tsx'),
    './marketData': load('../market/marketData.ts'),
    './marketClient': {
      loadPrices: async () => [{ date: '2024-02-29', close: 1234.5, open: 1200, high: 1300, low: 1190, change: 1.2 }],
    },
  }).default;
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
    'next/dynamic': () => market,
    '@/lib/desktopWorkspaceRoute': host,
    '../_lib/mobileDashboardWidget': load('../_lib/mobileDashboardWidget.ts', { '@/lib/desktopWorkspaceRoute': host }),
    'firebase/firestore': firestore, '@/firebase/config': { db: {} },
    '@/contexts/AuthContext': { useAuth: () => auth },
    './pcSnapshot': contract, './ClockCalendar': clock, './DevicePanels': panels, './UsageNotes': notes,
    './WeatherPanel': { WeatherPanel: () => element('h2', null, '독립 예보') },
  }).default;
  const bridge = Object.assign(new EventTarget(), { postMessage: message => messages.push(message) });
  window.chrome = { webview: bridge };
  const windowsBrowser = { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', userAgentData: { platform: 'Windows', mobile: false } };
  window.navigator = windowsBrowser;
  const missingTemperature = { ...fixture, sensors: { ...fixture.sensors, cpuTemp: null } };
  const device = (hex, model, revision = layoutId, cpuTemp = null) => ({
    id: hex.repeat(32),
    get: key => key === 'sample' ? JSON.stringify({
      ...fixture, system: { ...fixture.system, cpuName: model }, sensors: { ...fixture.sensors, cpuTemp }, mirabox: { ...fixture.mirabox, layoutId: revision },
    }) : undefined,
  });
  let view;
  const setupButton = () => view.root.findAllByType('button').find(button =>
    renderedText(button) === '이 PC에서 Core Temp 설정');
  function checkSharedSystemLinks(platform, opensWidget) {
    const links = view.root.findAllByType('a');
    const store = links.find(link => link.props.href === 'https://apps.microsoft.com/detail/restricted/9P80XDSKT26X');
    assert(store && renderedText(store).includes('Windows'), `${platform} identifies the Windows product in Microsoft Store`);
    assert.equal(links.some(link => link.props.href === 'propig-widgets:system'), opensWidget, `${platform} system widget protocol`);
    assert(!links.some(link => /core-temp-setup|\.(?:exe|msi)(?:[?#]|$)/i.test(link.props.href)), `${platform} cannot start a local installer`);
    assert(!setupButton(), `${platform} cannot request native setup for a shared PC`);
    assert.match(renderedText(view.root), /선택한 PC/);
  }
  await act(async () => { view = create(element(Board)); });
  try {
    assert.equal(accounts[0].query.source, 'users/account-a/pcWidgetDevices');
    assert.equal(messages.length, 0, 'a normal page cannot send native requests');
    await act(async () => accounts[0].next({ docs: [device('b', 'A secondary', layoutId + 8, 57.5), device('a', 'A primary')] }));
    assert.match(renderedText(view.root), /A primary/);
    checkSharedSystemLinks('Windows browser', true);
    host.isWindowsDashboard = true;
    await act(async () => view.update(element(Board)));
    assert(!setupButton(), 'a Windows main dashboard showing a cloud device still cannot install for it');
    assert(view.root.findAllByType('a').some(link => link.props.href === 'propig-widgets:system'), 'the Windows dashboard opens the local widget');
    host.isWindowsDashboard = false;
    await act(async () => view.update(element(Board)));
    const chooser = view.root.findByProps({ 'aria-label': '표시할 PC' });
    await act(async () => chooser.props.onChange({ target: { value: 'b'.repeat(32) } }));
    assert.match(renderedText(view.root), /A secondary/);
    try {
      for (const [age, expected] of [[60_000, '57.5 °C'], [181_000, '이전 측정 57.5 °C']]) {
        now = sourceTime + age;
        await act(async () => { for (const tick of [...timers.values()]) tick(); });
        const panel = view.root.findByType(panels.SystemPanel);
        const temp = panel.findAllByType('strong').find(node => renderedText(node).includes('57.5 °C'));
        assert(temp && renderedText(temp) === expected, `shared temperature at ${age / 1000}s`);
        for (const label of ['Windows 리소스', '하드웨어 센서']) {
          const row = panel.findAllByType('dt').find(dt => renderedText(dt) === label).parent;
          assert.equal(renderedText(row.findByType('dd')).startsWith('이전 측정'), age > 180_000, `${label} uses the sharing interval`);
        }
      }
    } finally { now = sourceTime; }
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
    await act(async () => choosePanel('시계·날씨').props.onClick());
    assert.match(renderedText(view.root), /독립 예보/);
    assert.doesNotMatch(renderedText(view.root), /로그인하면|PC가 없습니다/);
    await act(async () => choosePanel('달력').props.onClick());
    assert.match(renderedText(view.root), /2024년/);
    await act(async () => choosePanel('국내 증시').props.onClick());
    assert.match(renderedText(view.root), /시세 데이터 연결/);
    assert.doesNotMatch(renderedText(view.root), /로그인하면|PC 목록을/);
    assert(view.root.findAllByType('a').some(link => link.props.href === 'propig-widgets:market'));
    await act(async () => view.root.findByProps({type: 'password'}).props.onChange({target: {value: 'public-data-test-fixture'}}));
    await act(async () => view.root.findByType('form').props.onSubmit({preventDefault() {}}));
    assert.match(renderedText(view.root), /코스피/);
    assert.match(renderedText(view.root), /1,234.5/);
    assert(view.root.findAllByType('polyline').length > 0);
    host.isWindowsDashboard = true;
    await act(async () => choosePanel('국내 증시').props.onClick());
    assert.equal(window.location.href, 'propig-widgets:market');
    host.isWindowsDashboard = false;
  } finally { await act(async () => view.unmount()); }

  const androidBrowser = { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15) Mobile', userAgentData: { platform: 'Android', mobile: true } };
  const iphoneBrowser = { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' };
  auth.currentUser = { uid: 'account-a' };
  for (const [name, browser, nativePlatform, opensWidget] of [
    ['Windows browser without client hints', { platform: 'Win32', userAgent: windowsBrowser.userAgent }, null, true],
    ['Android browser', androidBrowser, null, false], ['Android app', androidBrowser, 'android', false],
    ['iPhone browser', iphoneBrowser, null, false], ['iPhone app', iphoneBrowser, 'ios', false],
  ]) {
    window.navigator = browser;
    window.Capacitor = nativePlatform ? { getPlatform: () => nativePlatform } : undefined;
    await act(async () => { view = create(element(Board)); });
    try {
      await act(async () => accounts.at(-1).next({ docs: [device('a', 'Shared CPU')] }));
      assert.match(renderedText(view.root), /Shared CPU/);
      checkSharedSystemLinks(name, opensWidget);
    } finally { await act(async () => view.unmount()); }
  }
  window.navigator = windowsBrowser;
  delete window.Capacitor;
  assert.equal(messages.length, 0, 'shared system panels cannot send native setup requests');
  const cloudStreamCount = accounts.length;
  const response = (id, sample, capability, result) => bridge.dispatchEvent(new MessageEvent('message', {
    data: { version: 1, requestId: id, type: 'pc-widget-state', result,
      data: { sample, sharing: false, ...(capability !== undefined && { temperatureSetupSupported: capability }) } },
  }));
  const first = '2f72dd63-74df-4768-ad80-836fb7f73122';
  const second = '962b86f5-5b40-4120-b4ec-a93f0faedd13';
  await act(async () => { view = create(element(Board, { requestId: first })); });
  try {
    assert.equal(accounts.length, cloudStreamCount, 'native panel reads its own PC');
    assert.deepEqual(messages[0], { version: 1, requestId: first, type: 'pc-widget-read' });
    assert(!setupButton(), 'loading a widget must not offer installation');
    await act(async () => { response(second, missingTemperature, true); response(first, { version: 2 }, true); });
    assert.doesNotMatch(renderedText(view.root), /Fixture CPU/);
    assert(!setupButton(), 'only a valid sample for this native session may offer setup');
    for (const [label, sample, capability] of [
      ['older host', missingTemperature, undefined],
      ['disabled capability', missingTemperature, false],
      ['nonboolean capability', missingTemperature, 'true'],
      ['missing sensor block', { ...fixture, sensors: null }, true],
      ['old sensor reading', { ...missingTemperature, sensors: { ...missingTemperature.sensors, updatedAt: now - 31_000 } }, true],
      ['legacy source', { ...missingTemperature, source: undefined }, true],
      ['zero degrees', fixture, true],
      ['reported temperature', { ...fixture, sensors: { ...fixture.sensors, cpuTemp: 57.5 } }, true],
    ]) {
      await act(async () => response(first, sample, capability));
      assert(!setupButton(), label + ' must not offer installation');
    }
    await act(async () => response(first, missingTemperature));
    assert(!messages.some(message => message.type === 'pc-widget-action'), 'observing a missing temperature cannot start setup');
    const legacyHelp = view.root.findAllByType('button').find(button => renderedText(button) === 'Core Temp 공식 사이트');
    assert(legacyHelp, 'older hosts keep the official-site help');
    await act(async () => legacyHelp.props.onClick());
    await act(async () => response(first, missingTemperature, false, '지원하지 않는 동작입니다.'));
    assert.match(renderedText(view.root), /https:\/\/www\.alcpu\.com\/CoreTemp\//, '1.3.x can still reach the vendor in a regular browser');
    await act(async () => response(first, missingTemperature, true));
    assert(setupButton() && !setupButton().props.disabled, 'a fresh local missing temperature can request native setup');
    assert(!messages.some(message => message.target === 'core-temp-setup'), 'new capability notification does not install anything');
    const officialSite = view.root.findAllByType('button').find(button => renderedText(button) === 'Core Temp 공식 사이트');
    assert(officialSite, 'the latest host also offers the official site independently of setup');
    await act(async () => officialSite.props.onClick());
    assert.deepEqual(messages.at(-1), { version: 1, requestId: first, type: 'pc-widget-action', target: 'core-temp-info' });
    await act(async () => response(first, missingTemperature, true, '공식 사이트를 열었습니다.'));
    const previousClick = setupButton().props.onClick;
    now += 31_000;
    try {
      await act(async () => previousClick());
      assert(!messages.some(message => message.target === 'core-temp-setup'), 'a sample that expires before the click cannot start setup');
      await act(async () => { for (const tick of [...timers.values()]) tick(); });
      assert(!setupButton(), 'an open widget removes the offer when the sensor reading expires');
    } finally { now -= 31_000; }
    await act(async () => response(first, missingTemperature, true));
    await act(async () => setupButton().props.onClick());
    assert.deepEqual(messages.at(-1), { version: 1, requestId: first, type: 'pc-widget-action', target: 'core-temp-setup' });
    await act(async () => response(first, missingTemperature, true)); // a normal poll while consent is pending
    assert(setupButton().props.disabled, 'another setup request is disabled while Windows asks for consent');
    await act(async () => response(first, missingTemperature, true, '설정을 취소했습니다.'));
    assert.match(renderedText(view.root), /설정을 취소했습니다/);
    assert.equal(messages.filter(message => message.target === 'core-temp-setup').length, 1, 'a native response cannot retry installation');
    await act(async () => response(first, fixture, true));
    assert(!setupButton(), 'the setup offer disappears once a real temperature arrives');
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
    await act(async () => view.root.findByProps({ 'aria-label': '32번 키, 폴더 실행 확인' }).props.onClick());
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
  const store = load('../../../constants/propigStore.ts');
  assert(store.isAvailablePropigStoreAppId('market'));
  assert(store.PROPIG_WIDGET_IDS.includes('market'));
  assert.equal(store.getPropigStoreAppForWidget('market').path, '/propig/market');
  assert(store.PROPIG_STORE_MENU_ITEMS.some(item => item.id === 'shop-market' && item.propigAppId === 'market'));
  const originalNow = Date.now;
  const originalClearInterval = globalThis.clearInterval;
  Date.now = () => now;
  globalThis.clearInterval = cancel;
  try {
    await checkForecast();
    await checkAccountAndBridge();
    await checkPanels(sample);
  } finally {
    Date.now = originalNow;
    globalThis.clearInterval = originalClearInterval;
  }
  console.log('PASS PC widgets: temperature sources, shared reading age, platform links, local setup consent, market registration and launch, KST rollover, account changes, device-scoped key links and native session isolation.');
}

async function checkForecast() {
  const { forecastCities, forecastUrl, startOfKoreanDay, koreanDate, parseForecast, describeForecast, loadForecast } = forecast;
  const seoul = forecastCities[0], start = startOfKoreanDay(sourceTime);
  const url = forecastUrl(seoul, sourceTime);
  assert.equal(url.origin, 'https://api.brightsky.dev');
  assert.equal(url.searchParams.get('tz'), 'Asia/Seoul');
  assert.equal(url.searchParams.get('wmo_station_id'), seoul.station);
  assert.equal(koreanDate(start), '2024-02-29');
  const stations = [{ id: 3, observation_type: 'forecast', wmo_station_id: seoul.station }];
  const rows = Array.from({ length: 168 }, (_, hour) => ({ source_id: 3, timestamp: new Date(start + hour * 3_600_000).toISOString(),
    temperature: hour % 24 - 3, precipitation_probability_6h: hour < 24 ? 0 : null, icon: 'clear-day' }));
  const payload = { sources: stations, weather: rows };
  const result = describeForecast(parseForecast(payload, seoul, sourceTime), sourceTime);
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].high, 20);
  assert.equal(result.days[0].low, -3);
  assert.equal(result.days[0].rain, 0);
  assert.equal(result.days[1].rain, null);
  assert.throws(() => parseForecast(payload, forecastCities[1], sourceTime));
  assert.throws(() => parseForecast({ sources: stations, weather: [] }, seoul, sourceTime));
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (target, options) => { requests.push({target, options}); return {ok:true, json: async () => payload}; };
  try {
    const [first, second] = await Promise.all([loadForecast(seoul), loadForecast(seoul)]);
    assert.equal(first, second);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.credentials, 'omit');
    await loadForecast(seoul);
    assert.equal(requests.length, 1, 'a fresh station forecast is reused');
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(loadForecast(seoul, true));
    assert.equal(forecast.readCachedForecast(seoul).fetchedAt, first.fetchedAt);
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
