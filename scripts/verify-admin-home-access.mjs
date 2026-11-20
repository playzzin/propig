import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = process.cwd();
const require = createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME || root, 'package.json'));
const { build } = require('esbuild');
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mocks = {
  '@/contexts/AuthContext': 'export const useAuth = () => ({loginWithGoogle: async()=>{},isConfigured:true});',
  '@/hooks/useCurrentUserAccess': 'export const useCurrentUserAccess = () => globalThis.__adminHomeFixture;',
  '@/components/site-home/SiteHomePage': 'import React from "react"; export const SiteHomePage = props => React.createElement("h1", {"data-admin-home":true}, props.title);',
  'next/link': 'import React from "react"; export default function Link({children,...props}) {return React.createElement("a",props,children);}',
};
const bundle = await build({entryPoints:[path.join(root,'src/app/admin/page.tsx')],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identity-fixture',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
const mod={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);
const Page=mod.exports.default;
for (const [label,fixture,expected] of [
  ['loading',{currentUser:null,isLoading:true,access:{role:'guest'}},'관리자 접근 권한을 확인하고 있습니다.'],
  ['guest',{currentUser:null,isLoading:false,access:{role:'guest'}},'로그인이 필요합니다'],
  ['user denied',{currentUser:{uid:'fixture'},isLoading:false,access:{role:'user',permissions:{}}},'관리 권한이 필요합니다'],
  ['admin',{currentUser:{uid:'fixture'},isLoading:false,access:{role:'admin'}},'관리 사이트 홈'],
  ...['menuManagement','userManagement','projectBoardManagement','photoManagement','storageManagement'].map(p=>[p,{currentUser:{uid:'fixture'},isLoading:false,access:{role:'user',permissions:{[p]:true}}},'관리 사이트 홈']),
]) {
  globalThis.__adminHomeFixture=fixture;
  let tree;
  await act(async()=>{tree=create(React.createElement(Page));});
  const rendered=JSON.stringify(tree.toJSON());
  assert.ok(rendered.includes(expected),label);
  if (expected!=='관리 사이트 홈') assert.ok(!rendered.includes('data-admin-home'),label);
  await act(async()=>tree.unmount());
}
delete globalThis.__adminHomeFixture;
console.log('PASS admin home: loading, guest, denied, administrator, delegated feature permissions');
