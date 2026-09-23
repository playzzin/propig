import type { Footprint, Point } from "./sceneNavigation";

// Presentation-only passage claims. Not room destination slots or work status.
interface Claim { point:Point; route:Point[]; gates:Set<string>; wave:number; owned:boolean; waitingSince?:number; limit?:number }
const inside=(p:Point,r:Footprint)=>p.x>=r.x && p.x<=r.x+r.width && p.y>=r.y && p.y<=r.y+r.height;
function crossing(a:Point,b:Point,r:Footprint):[number,number]|null {
  let lo=0,hi=1;
  for(const [p,d,min,max] of [[a.x,b.x-a.x,r.x,r.x+r.width],[a.y,b.y-a.y,r.y,r.y+r.height]]) {
    if(Math.abs(d)<1e-9){if(p<min || p>max)return null;}
    else {const t=(min-p)/d,u=(max-p)/d;lo=Math.max(lo,Math.min(t,u));hi=Math.min(hi,Math.max(t,u));if(lo>hi)return null;}
  }
  return [lo,hi];
}
const crosses=(a:Point,b:Point,r:Footprint)=>crossing(a,b,r)!==null;
export class SceneTraffic {
  private claims=new Map<string,Claim>();
  private order:string[]|null=null;
  private wave=0;
  constructor(private gates:Footprint[], private timeoutMs=15000) {}
  remove(id:string) {if(this.claims.delete(id))this.order=null;}
  clear() {this.claims.clear();this.order=null;}
  get size() {return this.claims.size;}
  movementLimit(id:string) {return this.claims.get(id)?.limit??Infinity;}
  update(id:string,point:Point,route:Point[]) {
    const gates=new Set(this.gates.filter(g=>route.some((p,i)=>i>0 && crosses(route[i-1],p,g))).map(g=>g.id));
    const old=this.claims.get(id);
    // Advancing past one gate preserves the ticket and ownership of remaining
    // gates. A new/non-subset request joins the current wave instead.
    const same=old && ((old.gates.size===0 && gates.size===0) ||
      (old.gates.size>0 && gates.size>0 && [...gates].every(g=>old.gates.has(g))));
    if(!same)this.order=null;
    this.claims.set(id,{point:{...point},route,gates,wave:same?old.wave:this.wave,owned:!!same && old.owned && gates.size>0,waitingSince:same?old.waitingSince:undefined});
  }
  // A blocked occupant may only leave its current doors, never reserve later
  // doors out of turn. Stop just outside the closed boundary, then recheck FIFO.
  private exitLimit(claim:Claim):number|null {
    const occupied=this.gates.filter(g=>inside(claim.point,g));
    if(!occupied.length || claim.route.length<2)return null;
    if([...this.claims.values()].some(other=>other!==claim && occupied.some(g=>inside(other.point,g))))return null;
    let distance=0;
    const left=new Set<string>();
    for(let i=1;i<claim.route.length;i++) {
      const a=claim.route[i-1],b=claim.route[i],length=Math.hypot(b.x-a.x,b.y-a.y);
      if(!length)continue;
      const exits=occupied.map(g=>crossing(a,b,g));
      if(occupied.some((g,j)=>left.has(g.id) && exits[j]))return null;
      const outside=occupied.every(g=>!inside(b,g));
      const t=outside?Math.min(1,Math.max(0,...exits.map(v=>v?.[1]??0))+1e-4/length):1;
      const end={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      if(this.gates.some(g=>!occupied.includes(g) && crosses(a,end,g)))return null;
      distance+=length*t;
      if(outside)return occupied.every(g=>!inside(end,g))?distance:null;
      for(const g of occupied)if(!inside(b,g))left.add(g.id);
    }
    return null;
  }
  permission(id:string,now:number):'go'|'wait'|'timeout' {
    const claim=this.claims.get(id);if(!claim)return 'wait';
    claim.limit=undefined;
    const wait=(): 'wait'|'timeout'=>{
      claim.waitingSince??=now;
      if(now-claim.waitingSince<this.timeoutMs)return 'wait';
      claim.gates.clear();claim.owned=false;return 'timeout';
    };
    this.wave++;
    this.order??=[...this.claims.keys()].sort((a,b)=>this.claims.get(a)!.wave-this.claims.get(b)!.wave || (a<b?-1:a>b?1:0));
    let blocked=false;
    for(const otherId of this.order) {
      if(otherId===id)continue;
      const other=this.claims.get(otherId)!;
      if(this.gates.some(g=>claim.gates.has(g.id) && inside(other.point,g)) ||
        ([...claim.gates].some(g=>other.gates.has(g)) && (other.owned || other.wave<claim.wave || (other.wave===claim.wave && otherId<id)))) {blocked=true;break;}
    }
    if(blocked) {
      const limit=this.exitLimit(claim);
      if(limit===null)return wait();
      claim.limit=limit;claim.owned=false;return 'go';
    }
    claim.owned=true;claim.waitingSince=undefined;return 'go';
  }
}
