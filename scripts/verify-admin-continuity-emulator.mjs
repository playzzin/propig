import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8189','local demo emulator only');
const app=initializeApp({projectId:'demo-propig-rules'});const db=getFirestore(app);
try{
 for(const file of ['src/lib/server/admin-user-update-safety.ts','functions/src/api/adminUserUpdateSafety.ts']){
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const exports=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
 const prefix='continuity-'+crypto.randomUUID(),a=prefix+'-A',b=prefix+'-B',revision='a'.repeat(64);let freshness=0;
 const actor=uid=>({uid,readCurrentUser:async()=>{freshness++;return{uid,disabled:false,customClaims:{admin:true}}}});
 const results=await Promise.allSettled([exports.reserveUserUpdate(db,b,revision,revision,async()=>revision,actor(a)),exports.reserveUserUpdate(db,a,revision,revision,async()=>revision,actor(b))]);
 if(!results.some(x=>x.status==='fulfilled')) console.error(results.map(x=>({status:x.status,error:x.reason?.stack})));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const guard=results.find(x=>x.status==='fulfilled').value;
 assert.equal(guard.refs.length,2);const snapshots=await db.getAll(...guard.refs);assert(snapshots.every(x=>x.exists&&x.data().owner===guard.owner));
 await exports.markUserUpdateUncertain(db,guard);assert((await db.getAll(...guard.refs)).every(x=>x.data().state==='uncertain'));
 await assert.rejects(exports.finishUserUpdate(db,guard),e=>e.code==='USER_UPDATE_UNCERTAIN');
 const c=prefix+'-C';const success=await exports.reserveUserUpdate(db,c,revision,revision,async()=>revision,actor(c));assert.equal(success.refs.length,1);await exports.finishUserUpdate(db,success);assert(!(await success.ref.get()).exists);
 console.log('PASS actual Firestore transaction cross-admin contention/paired uncertainty/self dedup',file,'freshness calls',freshness);
 }
}finally{await db.terminate();await deleteApp(app)}
