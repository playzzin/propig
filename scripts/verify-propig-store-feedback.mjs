import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const ts=require('typescript');
const file=ts.createSourceFile('PropigStore.tsx',fs.readFileSync('src/components/propig/PropigStore.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const callbacks=new Map();
function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['handleStoreToggle','handleConfirmRegistration','handleMoveApp'].includes(node.name.text)) callbacks.set(node.name.text,node.initializer.arguments[0].getText(file));ts.forEachChild(node,visit);}
visit(file);assert.equal(callbacks.size,3);
let checks=0;
for(const [name,source] of callbacks) for(const failure of [false,true]) {
 const events=[];let closed=false;
 const operation=async()=>{if(failure)throw new Error('fixture denied');};
 const context={appRegistry:{isInstalled:()=>false,toggleApp:operation,installApp:operation,moveApp:operation},toast:{success:()=>events.push('success'),error:()=>events.push('error')},setPreviewAppId:()=>{closed=true;}};
 const callback=vm.runInNewContext(ts.transpileModule(`(${source})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 await callback({id:'fixture',title:'검사 앱',status:'available'},1);
 assert.deepEqual(events,[failure?'error':'success']);
 if(failure)assert.equal(closed,false);
 checks++;
}
console.log(`PASS store feedback ${checks}: actual callbacks, success only after ACK, caught failure preserves preview`);
