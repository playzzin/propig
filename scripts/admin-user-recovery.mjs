import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
const stable = value => value === undefined || value === null ? 'null' : Array.isArray(value) ? `[${value.map(stable).join(',')}]` : typeof value === 'object' ? `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')}}` : JSON.stringify(value);
export function validateRecoveryUids(uids) {
  if (!Array.isArray(uids) || uids.length < 1 || uids.length > 10 || uids.some(uid=>typeof uid!=='string'||uid.length<1||uid.length>128||/[\x00-\x20/\x7f]/.test(uid)) || new Set(uids).size!==uids.length) throw Error('대상 UID는 중복 없이 1~10개를 명시해야 합니다.');
  return uids;
}
// Deliberately read-only: this tool cannot delete locks or alter identity/authority.
export async function inspectUserUpdateRecovery({db,auth}, uids) {
  validateRecoveryUids(uids);
  const observations=[];
  for(const uid of uids){
    let user;
    try {user=await auth.getUser(uid);} catch(error){if(error?.code!=='auth/user-not-found')throw Error('Auth 조회 실패: 보고서는 생성하지 않았습니다.');user=null;}
    const key='admin-user-update-'+digest(uid);
    let access, admin, guard;
    try {[access,admin,guard]=await Promise.all([db.collection('userAccess').doc(uid).get(),db.collection('admins').doc(uid).get(),db.collection('serverRateLimits').doc(key).get()]);}catch{throw Error('권한/잠금 조회 실패: 보고서는 생성하지 않았습니다.');}
    const data=guard.exists?guard.data():null;
    const claims=user?.customClaims??{};
    const state=!guard.exists?'absent':data?.state==='running'?'running':data?.state==='uncertain'?'uncertain':'unknown';
    observations.push({uid,authExists:!!user,disabled:user?user.disabled:null,authority:{claim:claims.admin===true||claims.role==='admin',access:access.data()?.role==='admin',adminDocument:admin.exists},observationFingerprint:digest(stable({uid,user:user?{disabled:user.disabled,claims}:null,access:access.exists?access.data():null,admin:admin.exists,guard:data})),guard:{state,operationFingerprint:typeof data?.owner==='string'?digest(data.owner):null,declaredLockCount:Array.isArray(data?.lockPaths)?data.lockPaths.length:null,suppliedScopeCoversDeclaredLocks:Array.isArray(data?.lockPaths)&&data.lockPaths.length>0?data.lockPaths.every(path=>uids.some(candidate=>path==='serverRateLimits/admin-user-update-'+digest(candidate))):null},unlockPermitted:false});
  }
  return {schema:1,readOnly:true,atomicSnapshot:false,observations,warning:'현재 조회는 분산 원자 스냅샷이 아니며 writer 종료를 증명하지 않습니다. 잠금이 오래되었거나 기록이 일치해도 해제를 승인하지 않습니다.',requiredBeforeManualRecovery:['Next/Hosting 및 외부 Admin SDK writer와 모든 진행 요청의 종료 확인','작업에 관련된 모든 UID의 잠금과 Auth/userAccess/admins 상태를 재조회·대조','승인된 운영 절차로 권한 정합화 후 owner가 일치하는 전체 잠금 묶음 검토','별도 명시 승인하에 복구 수행; 이 도구에는 수정·해제 기능이 없음']};
}
export function parseRecoveryArgs(args){
  const values={};
  for(let i=0;i<args.length;i++){const key=args[i];if(key==='--ack-read-only'){if(values.ack)throw Error('중복 옵션');values.ack=true;continue;}if(!['--project','--database','--uid'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('허용되지 않거나 누락된 옵션');const value=args[++i];if(key==='--uid'){(values.uids??=[]).push(value);}else{if(values[key])throw Error('중복 옵션');values[key]=value;}}
  if(!values.ack||!values['--project']||!values['--database'])throw Error('--project, --database, --uid, --ack-read-only가 필요합니다.');
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(values['--project'])||!(/^[a-z][a-z0-9-]{0,62}$/.test(values['--database'])||values['--database']==='(default)'))throw Error('프로젝트/데이터베이스 형식을 확인하세요.');
  validateRecoveryUids(values.uids);return values;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {const args=parseRecoveryArgs(process.argv.slice(2));const {initializeApp,applicationDefault,deleteApp}=await import('firebase-admin/app');const {getAuth}=await import('firebase-admin/auth');const {getFirestore}=await import('firebase-admin/firestore');const app=initializeApp({credential:applicationDefault(),projectId:args['--project']});try{console.log(JSON.stringify(await inspectUserUpdateRecovery({auth:getAuth(app),db:getFirestore(app,args['--database'])},args.uids),null,2));}finally{await deleteApp(app);}}
  catch(error){console.error(error?.message?.startsWith('--')||/대상 UID|옵션|형식|조회 실패/.test(error?.message??'')?error.message:'복구 진단 실패: 인증·연결을 확인하세요. 민감 오류 내용은 출력하지 않습니다.');process.exitCode=1;}
}
