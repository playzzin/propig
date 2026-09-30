import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import * as f from 'firebase/firestore';
import {initializeApp as adminApp,deleteApp as deleteAdmin} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8191','Isolated localhost:8191 emulator only');
const source=fs.readFileSync('src/hooks/usePropigAppRegistry.ts','utf8');const ast=ts.createSourceFile('hook.ts',source,ts.ScriptTarget.Latest,true);let callback;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='runTransaction')callback=n.arguments[1].getText(ast);ts.forEachChild(n,visit)}visit(ast);assert(callback);
const js=ts.transpileModule(`const callback=${callback}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const make=new Function('env',`const {createRegistryRef,uid,current,session,normalizeInstalledAppIds,DEFAULT_PROPIG_INSTALLED_APP_IDS,previous,normalized,serverTimestamp}=env;${js};return callback;`);
const projectId='demo-propig-memo',uid='registry-'+randomUUID(),path=`users/${uid}/propigStore/registration`;
const admin=adminApp({projectId},randomUUID()),store=getFirestore(admin,'pppp');const apps=[];
try{
 const clients=[0,1].map(()=>{const app=initializeApp({projectId,apiKey:'demo-key',appId:'demo'},randomUUID());apps.push(app);const db=f.getFirestore(app,'pppp');f.connectFirestoreEmulator(db,'127.0.0.1',8191,{mockUserToken:{sub:uid}});return db});
 await store.doc(path).set({installedAppIds:[],unrelated:'keep'});
 const execute=(db,ids)=>f.runTransaction(db,make({uid,current:()=>true,session:{ready:true},createRegistryRef:()=>f.doc(db,path),normalizeInstalledAppIds:(v,d)=>Array.isArray(v)?v:d,DEFAULT_PROPIG_INSTALLED_APP_IDS:[],previous:[],normalized:ids,serverTimestamp:f.serverTimestamp}));
 const results=await Promise.allSettled([execute(clients[0],['memo']),execute(clients[1],['habit'])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'REGISTRY_CONFLICT');
 const saved=(await store.doc(path).get()).data();assert.equal(saved.installedAppIds.length,1);assert.equal(saved.unrelated,'keep');console.log('PASS actual hook transaction callback + real Firestore/client Rules: two clients same baseline exactly one commits, other conflicts; merge preserves unrelated fields');
}finally{await Promise.all(apps.map(async a=>{await f.terminate(f.getFirestore(a,'pppp'));await deleteApp(a)}));await store.terminate();await deleteAdmin(admin)}
