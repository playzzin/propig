const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = process.cwd() + '/';
const paths = ['src/lib/server/admin-user-update-safety.ts', 'functions/src/api/adminUserUpdateSafety.ts'];
assert.equal(fs.readFileSync(root + paths[0], 'utf8'), fs.readFileSync(root + paths[1], 'utf8'));
function load(path) {
 const text = fs.readFileSync(root + path, 'utf8');
 const out = ts.transpileModule(text, { compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}, reportDiagnostics: true });
 assert.equal(out.diagnostics.length, 0);
 const exports = {};
 vm.runInNewContext(out.outputText, {exports, require: (name) => {assert.equal(name, 'node:crypto'); return require(name);}, console, Buffer, process: {env:{}}});
 return exports;
}
function database() {
 const docs = new Map(); let queue = Promise.resolve(); let fail = false;
 const ref = (path) => ({path});
 return {docs, setFail: v => {fail=v;}, collection: c => ({doc: id => ref(c+'/'+id)}), runTransaction(fn) {
  const work = queue.then(async () => {
   if (fail) throw Error('mock firestore unavailable');
   const writes = [];
   const tx = {get: async r => ({exists: docs.has(r.path), data: () => docs.get(r.path)}),
    create: (r,d) => writes.push(() => {assert(!docs.has(r.path)); docs.set(r.path,d);}),
    update: (r,d) => writes.push(() => docs.set(r.path,{...docs.get(r.path),...d})),
    delete: r => writes.push(() => docs.delete(r.path))};
   const result = await fn(tx); writes.forEach(w => w()); return result;
  });
  queue=work.catch(()=>{}); return work;
 }};
}
(async () => {
 for (const path of paths) {
  const h=load(path), db=database();
  const u={uid:'fixture',disabled:false,customClaims:{role:'user',unrelated:{b:2,a:1}}};
  const r=h.managedUserRevision(u,{permissions:{photoManagement:true},position:'staff'},false);
  assert.match(r,/^[a-f0-9]{64}$/);
  assert.equal(r,h.managedUserRevision({...u,metadata:{lastSignInTime:'new'},customClaims:{unrelated:{a:1,b:2},role:'user'}},{position:'staff',permissions:{photoManagement:true}},false));
  for (const variant of [{...u,disabled:true},{...u,customClaims:{...u.customClaims,photoManager:true}}]) assert.notEqual(r,h.managedUserRevision(variant,{permissions:{photoManagement:true},position:'staff'},false));
  assert.notEqual(r,h.managedUserRevision(u,{permissions:{photoManagement:false},position:'staff'},false));
  assert.notEqual(r,h.managedUserRevision(u,{permissions:{photoManagement:true},position:'staff'},true));
  const code = c => e => e.code === c;
  await assert.rejects(h.reserveUserUpdate(db,'fixture','stale',r,async()=>r),code('USER_UPDATE_CONFLICT')); assert.equal(db.docs.size,0);
  await assert.rejects(h.reserveUserUpdate(db,'fixture',r,r,async()=>'changed-in-between'),code('USER_UPDATE_CONFLICT')); assert.equal(db.docs.size,0);
  await assert.rejects(h.reserveUserUpdate(db,'fixture',r,'prepared-stale',async()=>r),code('USER_UPDATE_CONFLICT'));
  const attempts=await Promise.allSettled(Array.from({length:12},()=>h.reserveUserUpdate(db,'fixture',r,r,async()=>r)));
  assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);
  assert(attempts.filter(v=>v.status==='rejected').every(v=>v.reason.code==='USER_UPDATE_IN_PROGRESS'));
  const guard=attempts.find(v=>v.status==='fulfilled').value;
  const other=await h.reserveUserUpdate(db,'different',r,r,async()=>r); await h.finishUserUpdate(db,other);
  await assert.rejects(h.finishUserUpdate(db,{...guard,owner:'wrong'}),code('USER_UPDATE_UNCERTAIN'));
  assert.equal(db.docs.get(guard.ref.path).state,'running');
  db.setFail(true); await h.markUserUpdateUncertain(db,guard); db.setFail(false);
  assert.equal(db.docs.get(guard.ref.path).state,'running');
  db.docs.get(guard.ref.path).startedAt='1900-01-01T00:00:00Z';
  await assert.rejects(h.reserveUserUpdate(db,'fixture',r,r,async()=>r),code('USER_UPDATE_IN_PROGRESS'));
  await h.markUserUpdateUncertain(db,guard);
  await assert.rejects(h.reserveUserUpdate(db,'fixture',r,r,async()=>r),code('USER_UPDATE_UNCERTAIN'));
  await assert.rejects(h.finishUserUpdate(db,guard),code('USER_UPDATE_UNCERTAIN'));
  const success=await h.reserveUserUpdate(db,'success',r,r,async()=>r); await h.finishUserUpdate(db,success);
  assert(!db.docs.has(success.ref.path)); await h.markUserUpdateUncertain(db,success); assert(!db.docs.has(success.ref.path));
  const fresh=await h.reserveUserUpdate(db,'success',r,r,async()=>r); await h.markUserUpdateUncertain(db,success); assert.equal(db.docs.get(fresh.ref.path).state,'running');
  const paired=database();const adminUser=id=>({uid:id,disabled:false,customClaims:{admin:true}});
  const actor=id=>({uid:id,readCurrentUser:async()=>adminUser(id)});
  const cross=await Promise.allSettled([
    h.reserveUserUpdate(paired,'B',r,r,async()=>r,actor('A')),
    h.reserveUserUpdate(paired,'A',r,r,async()=>r,actor('B')),
  ]);
  assert.equal(cross.filter(x=>x.status==='fulfilled').length,1);assert.equal(paired.docs.size,2);
  const pair=cross.find(x=>x.status==='fulfilled').value;
  assert.equal(pair.refs.length,2);assert([...paired.docs.values()].every(x=>x.owner===pair.owner));
  await h.markUserUpdateUncertain(paired,pair);assert([...paired.docs.values()].every(x=>x.state==='uncertain'));
  await assert.rejects(h.finishUserUpdate(paired,pair),code('USER_UPDATE_UNCERTAIN'));assert.equal(paired.docs.size,2);
  const same=database();const self=await h.reserveUserUpdate(same,'A',r,r,async()=>r,actor('A'));assert.equal(same.docs.size,1);await h.finishUserUpdate(same,self);assert.equal(same.docs.size,0);
  const altered=database();const owned=await h.reserveUserUpdate(altered,'B',r,r,async()=>r,actor('A'));altered.docs.get(owned.refs[1].path).owner='external-owner';
  await assert.rejects(h.finishUserUpdate(altered,owned),code('USER_UPDATE_UNCERTAIN'));assert.equal(altered.docs.size,2);
  for(const user of [null,{uid:'A',disabled:true,customClaims:{admin:true}},{uid:'A',disabled:false,customClaims:{}},{uid:'WRONG',disabled:false,customClaims:{admin:true}}]){
    const unsafe=database();await assert.rejects(h.reserveUserUpdate(unsafe,'B',r,r,async()=>r,{uid:'A',readCurrentUser:async()=>{if(!user)throw Object.assign(Error('missing'),{code:'auth/user-not-found'});return user;}}),code('USER_UPDATE_ACTOR_UNSAFE'));assert.equal(unsafe.docs.size,0);
  }
  console.log('PASS',path,'paired cross-demotion single winner, self dedup, all-lock uncertainty, partial-owner failure, fresh actor rejection');
  const map=Object.fromEntries(Array.from({length:100},(_,i)=>['key'+i,i%2===0]));
  const audit=h.userAccessAudit({role:'user',position:'staff',disabled:false,permissions:{photoManagement:true},siteAccess:map,menuAccess:map,isAdminDocLinked:false,customClaims:{secret:'not-logged'}});
  function sanitize(v,d=0){if(v==null||['boolean','number','string'].includes(typeof v))return v;if(d>=4)return '[truncated]';if(Array.isArray(v))return v.slice(0,40).map(x=>sanitize(x,d+1));return Object.fromEntries(Object.entries(v).slice(0,60).map(([k,x])=>[k,sanitize(x,d+1)]));}
  const logged=sanitize({before:audit,after:audit});
  assert.equal(Object.values(logged.before.siteAccess).flatMap(Object.keys).length,100);
  assert(!JSON.stringify(logged).includes('truncated')); assert(!JSON.stringify(logged).includes('secret'));
  console.log('PASS',path,'revision + transaction contention (12 callers) + stale + ownership + uncertainty persistence + no expiry + audit 100-map preservation');
 }
 for(const path of ['src/app/api/admin/users/route.ts','functions/src/api/hostingAdminUsers.ts']) {
  const out=ts.transpileModule(fs.readFileSync(root+path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true}); assert.equal(out.diagnostics.length,0); console.log('PASS syntax',path);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
