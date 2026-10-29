import { planRoute, pointSafe, type Geometry, type Point } from "./sceneNavigation";
import type { SceneTraffic } from "./sceneTraffic";

export type MotionPhase = "stationary" | "walking" | "waiting" | "paused" | "hold";
// Presentation memory only. Never persists or changes tasks/observations/server state.
export class SceneMotion {
  point:Point;
  phase:MotionPhase='stationary';
  generation=0;
  reason='장면 복원 · 실제 이동 기록 아님';
  route:Point[]=[];
  private signature='';
  private segment=1;
  private traffic?:SceneTraffic;
  private employeeId='';
  private elapsed=0;
  private listeners=new Set<()=>void>();
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>`${this.generation}:${this.phase}`;
  private publish(){for(const listener of this.listeners)listener();}
  constructor(point:Point) {this.point={...point};}
  bindTraffic(traffic:SceneTraffic,id:string) {
    this.traffic=traffic;this.employeeId=id;this.signature='';
    traffic.update(id,this.point,[]);
  }
  unbindTraffic() {this.traffic?.remove(this.employeeId);this.traffic=undefined;this.signature='';}
  private syncTraffic() {this.traffic?.update(this.employeeId,this.point,this.phase==='walking'||this.phase==='waiting'?[this.point,...this.route.slice(this.segment)]:[]);}
  reconcile(key:string,target:Point|null,g:Geometry,enabled:boolean) {
    this.applyReconcile(key,target,g,enabled);
    this.publish();
  }
  private applyReconcile(key:string,target:Point|null,g:Geometry,enabled:boolean) {
    const signature=JSON.stringify([key,target,g.key,enabled]);
    if(signature===this.signature)return;
    this.signature=signature;this.generation++;this.route=[];this.segment=1;
    this.traffic?.update(this.employeeId,this.point,[]);
    if(!pointSafe(g,this.point)){this.phase='hold';this.reason='배치 변경 · 안전 위치 확인 필요';return;}
    if(!target){this.phase='hold';this.reason='현재 위치 유지';return;}
    if(!enabled){this.phase='paused';this.reason='동작 정지 · 사실 상태는 계속 갱신';return;}
    const route=planRoute(g,this.point,target);
    if(!route){this.phase='hold';this.reason='안전 경로 없음 · 현재 위치 유지';return;}
    this.route=route;
    if(Math.hypot(this.point.x-target.x,this.point.y-target.y)<.01) {
      this.phase='stationary';this.reason='도착 연출 · 업무 상태 변경 없음';
    } else {this.phase='walking';this.reason='이동 연출 · 실제 이동 기록 아님';}
    this.syncTraffic();
  }
  tick(ms:number,generation:number) {
    this.applyTick(ms,generation);
    this.publish();
  }
  private applyTick(ms:number,generation:number) {
    if(!Number.isFinite(ms) || ms<0)return;
    if(generation!==this.generation || (this.phase!=='walking' && this.phase!=='waiting'))return;
    this.elapsed+=Math.max(0,ms);
    const permission=this.traffic?.permission(this.employeeId,this.elapsed);
    if(permission==='wait'){this.phase='waiting';this.reason='통로 순번 대기 · 현재 위치 유지';return;}
    if(permission==='timeout'){this.phase='hold';this.reason='통로 대기 시간 초과 · 현재 위치 유지';this.route=[];this.syncTraffic();return;}
    this.phase='walking';this.reason='이동 연출 · 실제 이동 기록 아님';
    let distance=Math.min(Math.max(0,ms)*.12,this.traffic?.movementLimit(this.employeeId)??Infinity);
    while(this.segment<this.route.length) {
      const next=this.route[this.segment],dx=next.x-this.point.x,dy=next.y-this.point.y,d=Math.hypot(dx,dy);
      if(distance<d){this.point={x:this.point.x+dx*distance/d,y:this.point.y+dy*distance/d};this.syncTraffic();return;}
      this.point={...next};distance-=d;this.segment++;
    }
    this.finish(generation);
  }
  finish(generation:number) {
    // A late finish cannot move a point or complete a replacement route.
    if(generation!==this.generation || this.segment<this.route.length || this.phase!=='walking')return;
    this.phase='stationary';this.reason='도착 연출 · 업무 상태 변경 없음';
    this.syncTraffic();
    this.publish();
  }
}

// One clock for the visible floor; subscriber lifetime is owned by actor effects.
const listeners=new Set<(ms:number)=>void>();
let frame=0,last=0;
function pulse(time:number) {
  const ms=last ? Math.min(50,Math.max(0,time-last)) : 0;last=time;
  for(const callback of listeners)callback(ms);
  frame=listeners.size?requestAnimationFrame(pulse):0;
  if(!frame)last=0;
}
export function subscribeMotion(callback:(ms:number)=>void):()=>void {
  listeners.add(callback);
  if(!frame){last=0;frame=requestAnimationFrame(pulse);}
  return ()=>{listeners.delete(callback);if(!listeners.size){cancelAnimationFrame(frame);frame=0;last=0;}};
}
export function motionClockSize():number {return listeners.size;}
