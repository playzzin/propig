import type { Employee, Snapshot, Task } from "./types";
import { sceneActivity, type SceneActivity } from "./gameSceneState";
import { assessObservation, attentionReasons } from "./dashboardEvidence";
import { awaitingReply } from "./taskDisplay";

export interface SceneIntent {
  destination: "desk" | "meeting" | "training" | "awards" | "review" | "lounge" | "hold";
  activity: SceneActivity;
  label: string;
  reason: string;
  provenance: "confirmed" | "legacy" | "unknown";
  taskId: string | null;
}

// Build once per immutable snapshot. Array order is retained: the canonical
// helper's first running task is not silently replaced by a preferred task.
export function indexSceneInputs(state:Snapshot):Map<string,Snapshot> {
  const group = <T extends {employeeId:string}>(values:T[]) => {
    const result=new Map<string,T[]>();
    for(const value of values) {const bucket=result.get(value.employeeId)||[];bucket.push(value);result.set(value.employeeId,bucket);}
    return result;
  };
  const tasks=group(state.tasks),records=group(state.records),training=group(state.training);
  const hosts=new Map(state.hosts.map(h=>[h.id,h]));
  return new Map(state.employees.map(e=>{const host=hosts.get(e.hostId);return [e.id,{
    ...state,tasks:tasks.get(e.id)||[],records:records.get(e.id)||[],training:training.get(e.id)||[],hosts:host?[host]:[],
  }];}));
}
// No events/summary inference, reordered running tasks, or overrides of working.
// The unchanged canonical helper is the sole authority for all work counters.
export function sceneIntent(state: Snapshot, employee: Employee, now: number): SceneIntent {
  const activity=sceneActivity(state,employee,now);
  const tasks=state.tasks.filter(t=>t.employeeId===employee.id);
  const running=tasks.find(t=>t.status==='running');
  const observation=assessObservation(employee.observations?.work,now);
  const provenance=activity.working ? (Object.prototype.hasOwnProperty.call(employee.observations||{},'work')?'confirmed':'legacy') : 'unknown';
  const intent:SceneIntent={activity,destination:'hold',label:activity.label,reason:'현재 위치 유지 · 이동은 업무 기록이 아닌 연출',provenance,taskId:running?.id||null};
  if(activity.unavailable) return {...intent,label:employee.status!=='active'?'활동 중지':'관측 확인 필요 · 마지막 기록'};
  if(tasks.some(t=>awaitingReply(t)))return {...intent,label:'답변 대기'};
  const stop=tasks.find(t=>['failed','blocked','cancel_requested'].includes(t.status));
  if(stop && !activity.working)return {...intent,label:stop.status==='cancel_requested'?'중지 요청 대기':'중단 · 도움 필요',taskId:stop.id};
  if(running && !activity.working)return {...intent,label:'확인 필요 · 실행 확인 중',reason:observation.reason};
  if(activity.working)return {...intent,destination:activity.kind==='work'?'desk':activity.kind==='lounge'?'desk':activity.kind,reason:provenance==='legacy'?'레거시 실행 근거 · work 채널 부재':'유효 업무 관측 근거'};
  const pending=tasks.find(t=>['review','approval'].includes(t.status) && Boolean(t.result));
  if(pending)return {...intent,destination:'review',label:pending.status==='review'?'검토 대기':'승인 대기',taskId:pending.id,reason:'결과 제출 후 대기 · 검토 수행 아님'};
  if(activity.ceremonial)return {...intent,destination:activity.kind==='awards'?'awards':'training'};
  if(observation.currentStatus==='idle' && !tasks.some((t:Task)=>attentionReasons(t).length || t.status==='running' || t.status==='cancel_requested')) {
    return {...intent,destination:'lounge',label:'업무 대기',reason:'휴식 연출 · 실제 휴식 기록 아님',provenance:'confirmed'};
  }
  if(tasks.some(t=>t.status==='completed'||t.status==='cancelled'))return {...intent,destination:'desk',reason:'업무석 복귀 연출 · 납품 검증과 무관'};
  return {...intent,label:'확인 필요',reason:observation.reason};
}
