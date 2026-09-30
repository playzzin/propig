// Real page wrapper functions in React StrictMode; identity, data views and dialog are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const qa = createRequire(path.join(process.env.PROPIG_QA_TOOLS || process.cwd(), 'package.json'));
const React = qa('react');
const { act, create } = qa('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function verify(name, filename) {
  let session = { loading: false, currentUser: null, allowed: false, isFullAdmin: false, sessionKey: 'guest' };
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert(wrapper, `${name}: real page wrapper is required`);
  const code = ts.transpileModule(`import React, { useState } from 'react';\n${wrapper.getText(source)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  function Dialog({ isOpen, onClose }) {
    const [identity] = React.useState(() => ({}));
    return isOpen ? React.createElement('dialog', { identity }, React.createElement('button', { onClick: onClose }, 'close')) : null;
  }
  const Workspace = ({ onOpenLogin }) => React.createElement('button', { onClick: onOpenLogin }, 'open');
  vm.runInNewContext(code, {
    module, exports: module.exports, require: id => { assert.equal(id, 'react'); return React; },
    useAdminUsersSession: () => session, LoginModal: Dialog, PageShell: 'main', Link: 'a',
    OpenRouterUsageWorkspace: Workspace, OpenRouterSettingsWorkspace: Workspace,
  }, { filename });
  const Page = module.exports.default;
  const tree = () => React.createElement(React.StrictMode, null, React.createElement(Page));
  let root;
  await act(async () => { root = create(tree()); });
  await act(async () => root.root.findAllByType('button').find(node => node.children[0] === 'open').props.onClick());
  const identity = root.root.findByType('dialog').props.identity;
  for (const next of [
    { loading: true, currentUser: { uid: 'member' }, sessionKey: 'member-loading' },
    { loading: false, currentUser: { uid: 'member' }, allowed: false, isFullAdmin: false, sessionKey: 'member' },
    { loading: false, currentUser: { uid: 'admin' }, allowed: true, isFullAdmin: true, sessionKey: 'admin' },
  ]) {
    session = { ...session, ...next };
    await act(async () => root.update(tree()));
    assert.equal(root.root.findByType('dialog').props.identity, identity, `${name}: login completion must survive access/loading/session replacement`);
  }
  await act(async () => root.root.findAllByType('button').find(node => node.children[0] === 'close').props.onClick());
  assert.equal(root.root.findAllByType('dialog').length, 0);
  await act(async () => root.unmount());
  console.log(`PASS ${name}: dialog survives auth and permission transitions until its own completion`);
}

(async () => {
  await verify('OpenRouterUsagePage', 'src/app/admin/openrouter-usage/page.tsx');
  await verify('OpenRouterSettingsPage', 'src/app/admin/openrouter-settings/page.tsx');
})().catch(error => { console.error(error); process.exitCode = 1; });
