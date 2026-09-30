import assert from 'node:assert/strict';
import {mkdtempSync,copyFileSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const ts=require('typescript');
const root=process.cwd();const dir=mkdtempSync(path.join(tmpdir(),'propig-static-types-'));
try {
 for(const f of ['tsconfig.json','tsconfig.typecheck.json','tsconfig.static-export.json'])copyFileSync(path.join(root,f),path.join(dir,f));
 for(const d of ['src','.next-apk-build/types','.next-static-export/types'])mkdirSync(path.join(dir,d),{recursive:true});
 writeFileSync(path.join(dir,'src/probe.ts'),'export const value: string = "ok";');
 writeFileSync(path.join(dir,'.next-apk-build/types/stale.ts'),'import "./missing-disabled-route"; export const bad:string=42;');
 const c=ts.readConfigFile(path.join(dir,'tsconfig.static-export.json'),ts.sys.readFile);assert.ok(!c.error);
 const parsed=ts.parseJsonConfigFileContent(c.config,ts.sys,dir);assert.deepEqual(parsed.errors,[]);
 assert.ok(!parsed.fileNames.some(f=>f.includes('.next-apk-build')));
 const diagnostics=()=>{const config=ts.parseJsonConfigFileContent(c.config,ts.sys,dir);return ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames,config.options));};
 assert.deepEqual(diagnostics(),[],'stale generated server types must not enter export');
 writeFileSync(path.join(dir,'src/probe.ts'),'export const value: string = 42;');
 assert.ok(diagnostics().some(d=>d.code===2322),'real source type error must still fail');
 writeFileSync(path.join(dir,'src/probe.ts'),'export const value: string = "ok";');
 writeFileSync(path.join(dir,'.next-static-export/types/probe.ts'),'export const value: string = 42;');
 assert.ok(diagnostics().some(d=>d.code===2322),'active export validators must still be checked');
 const next=readFileSync(path.join(root,'next.config.ts'),'utf8');assert.match(next,/tsconfigPath: 'tsconfig\.static-export\.json'/);assert.ok(!next.includes('ignoreBuildErrors: true'));
 console.log('PASS static export types: stale output excluded; real source and active validators rejected; type-check not bypassed');
}finally{rmSync(dir,{recursive:true,force:true});}
