import type { OfficeRoom } from "./types";
// World-local foot points. Conservative furniture bounds, never DOM/screen pixels.
export interface Point { x: number; y: number }
export interface Footprint extends Point { id: string; width: number; height: number }
export interface Geometry {
  key: string; width: number; height: number; radius: number; valid: boolean;
  obstacles: Footprint[]; nodes: Point[]; edges: number[][]; cells: Map<string,number>;
}
// The two static feet span 28px. The pose is anchored at their common contact.
export const FOOT_RADIUS = 14;
const GRID = 8;
export function pointSafe(g: Geometry, p: Point): boolean {
  return g.valid && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= g.radius &&
    p.y >= g.radius && p.x <= g.width-g.radius && p.y <= g.height-g.radius &&
    !g.obstacles.some(r => p.x >= r.x-g.radius && p.x <= r.x+r.width+g.radius &&
      p.y >= r.y-g.radius && p.y <= r.y+r.height+g.radius);
}
export function segmentSafe(g: Geometry, a: Point, b: Point): boolean {
  if (!pointSafe(g,a) || !pointSafe(g,b)) return false;
  // Slab intersection against radius-expanded closed rectangles (including grazing).
  return !g.obstacles.some(r => {
    let lo=0, hi=1;
    for (const [start,delta,min,max] of [
      [a.x,b.x-a.x,r.x-g.radius,r.x+r.width+g.radius],
      [a.y,b.y-a.y,r.y-g.radius,r.y+r.height+g.radius],
    ]) {
      if (Math.abs(delta)<1e-9) { if (start<min || start>max) return false; }
      else { const t1=(min-start)/delta,t2=(max-start)/delta;
        lo=Math.max(lo,Math.min(t1,t2)); hi=Math.min(hi,Math.max(t1,t2));
        if(lo>hi) return false;
      }
    }
    return true;
  });
}
export function makeGeometry(width: number, height: number, obstacles: Footprint[]): Geometry {
  const valid=Number.isFinite(width) && Number.isFinite(height) && width>0 && height>0 &&
    obstacles.every(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite) && r.width>=0 && r.height>=0);
  const cells=new Map<string,number>();
  const g: Geometry={width,height,valid,radius:FOOT_RADIUS,obstacles,nodes:[],edges:[],cells,
    key:JSON.stringify([width,height,obstacles])};
  if(!valid)return g;
  for(let y=GRID;y<height;y+=GRID) for(let x=GRID;x<width;x+=GRID) {
    const p={x,y}; if(!pointSafe(g,p)) continue;
    const i=g.nodes.length;g.nodes.push(p);g.edges.push([]);cells.set(`${x}:${y}`,i);
    for(const [dx,dy] of [[-GRID,0],[0,-GRID]]) {
      const j=cells.get(`${x+dx}:${y+dy}`);
      if(j!==undefined && segmentSafe(g,p,g.nodes[j])) {g.edges[i].push(j);g.edges[j].push(i);}
    }
  }
  return g;
}
export function planRoute(g: Geometry, from: Point, to: Point): Point[] | null {
  if(!pointSafe(g,from) || !pointSafe(g,to)) return null;
  if(segmentSafe(g,from,to)) return [from,to];
  const links=(p:Point)=>{
    const candidates:{i:number;d:number}[]=[];
    const x=Math.round(p.x/GRID)*GRID,y=Math.round(p.y/GRID)*GRID;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++) {
      const i=g.cells.get(`${x+dx*GRID}:${y+dy*GRID}`);
      if(i===undefined)continue;
      const q=g.nodes[i],d=Math.hypot(q.x-p.x,q.y-p.y);
      if(d<=GRID*2.5 && segmentSafe(g,p,q))candidates.push({i,d});
    }
    return candidates.sort((a,b)=>a.d-b.d || a.i-b.i).slice(0,8).map(v=>v.i);
  };
  const starts=links(from),ends=new Set(links(to));
  const parent=new Int32Array(g.nodes.length).fill(-2),queue:number[]=[];
  for(const i of starts){parent[i]=-1;queue.push(i);}
  let finish=-1;
  for(let head=0;head<queue.length;head++) {
    const i=queue[head];if(ends.has(i)){finish=i;break;}
    for(const j of g.edges[i]) if(parent[j]===-2){parent[j]=i;queue.push(j);}
  }
  if(finish<0)return null;
  const reverse:Point[]=[to];for(let i=finish;i>=0;i=parent[i])reverse.push(g.nodes[i]);
  reverse.push(from);const route=reverse.reverse(),simple=[from];
  for(let i=0;i<route.length-1;) {
    let j=route.length-1;while(j>i+1 && !segmentSafe(g,route[i],route[j]))j--;
    simple.push(route[j]);i=j;
  }
  return simple;
}

export const WORLD_WIDTH = 960;
export const ROW_HEIGHT = 174;
export const deskPosition = (seat: number): Point => ({x:44+(seat%5)*176,y:116+Math.floor((seat%25)/5)*ROW_HEIGHT});
// Behind the solid desk footprint, not in its chair/table rectangle.
export const deskPoint = (seat: number): Point => { const p=deskPosition(seat);return {x:p.x+80,y:p.y+74}; };
export interface Slot extends Point { key:string; kind:string; roomId:string }
export interface RoomGeometry extends Footprint { room:OfficeRoom; door:Footprint; furniture:Footprint }
export interface OfficeGeometry extends Geometry { rooms:RoomGeometry[]; slots:Slot[] }
export function officeGeometry(rows:number, rooms:OfficeRoom[], height:number):OfficeGeometry {
  const obstacles:Footprint[]=[
    {id:'back-wall',x:0,y:0,width:960,height:88},
    {id:'left-wall',x:0,y:0,width:20,height},
    {id:'bottom-edge',x:0,y:height-9,width:960,height:9},
    {id:'right-edge',x:951,y:0,width:9,height},
    {id:'reception',x:38,y:13,width:234,height:63},
    {id:'plant-a',x:23,y:44,width:47,height:64},
    {id:'plant-b',x:888,y:44,width:47,height:64},
  ];
  for(let i=0;i<rows*5;i++) {
    const p=deskPosition(i),s=100/108,dx=(164-160*s)/2;
    // DeskArt viewBox 160x108, x17..143, y29..104 including chair/wheels.
    obstacles.push({id:`desk:${i}`,x:p.x+dx+16*s,y:p.y+66+28*s,width:128*s,height:77*s});
  }
  const layouts=rooms.map(room=>{
    const x=room.x*960/100,y=room.y*height/100,w=room.width*960/100,h=room.height*height/100;
    // CSS border-box 3/8/3/7; furniture inset 32/8/48 inside padding box.
    const inner=w-6,door={id:`${room.id}:door`,x:x+3+inner*.42,y:y+h-7,width:inner*.18,height:7};
    const furniture={id:`${room.id}:art`,x:x+11,y:y+40,width:Math.max(0,w-22),height:Math.max(0,h-95)};
    obstacles.push(
      {id:`${room.id}:wall-top`,x,y,width:w,height:8},
      {id:`${room.id}:wall-left`,x,y,width:3,height:h},
      {id:`${room.id}:wall-right`,x:x+w-3,y,width:3,height:h},
      {id:`${room.id}:wall-bottom-left`,x,y:y+h-7,width:door.x-x,height:7},
      {id:`${room.id}:wall-bottom-right`,x:door.x+door.width,y:y+h-7,width:x+w-door.x-door.width,height:7},
    );
    // Conservative bounding union of solid RoomArt furniture in viewBox 240x135.
    // Includes chairs, tables, sofa, cabinets, podium and floor plants, excludes rugs.
    const bounds:Record<OfficeRoom['kind'],number[]>={meeting:[24,14,223,133],training:[28,9,230,134],lounge:[15,23,228,135],awards:[7,22,233,124],work:[17,16,230,135]};
    const [l,t,r,b]=bounds[room.kind],s=Math.max(0,Math.min(furniture.width/240,furniture.height/135));
    obstacles.push({id:`${room.id}:furniture`,x:furniture.x+(furniture.width-240*s)/2+l*s,y:furniture.y+(furniture.height-135*s)/2+t*s,width:(r-l)*s,height:(b-t)*s});
    return {id:room.id,x,y,width:w,height:h,room,door,furniture};
  });
  const g:OfficeGeometry={...makeGeometry(960,height,obstacles),rooms:layouts,slots:[]};
  if(rooms.some(r=>![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.x<0 || r.y<0 || r.width<=0 || r.height<=0 || r.x+r.width>100 || r.y+r.height>100)) {
    g.valid=false;g.nodes=[];g.edges=[];return g;
  }
  for(const r of layouts) {
    for(let y=r.y+32;y<r.y+r.height-24;y+=48)for(let x=r.x+24;x<r.x+r.width-24;x+=48) {
      if(pointSafe(g,{x,y}))g.slots.push({x,y,key:`${r.id}:${x-r.x}:${y-r.y}`,kind:r.room.kind==='work'?'review':r.room.kind,roomId:r.id});
    }
  }
  return g;
}
export function reserveSlots(g:OfficeGeometry, requests:{id:string;destination:string}[], previous:Map<string,Slot>):Map<string,Slot> {
  const result=new Map<string,Slot>(),used=new Set<string>();
  const ordered=[...requests].sort((a,b)=>a.id.localeCompare(b.id));
  const available=[...g.slots].sort((a,b)=>a.key.localeCompare(b.key));
  for(const request of ordered) {
    const old=previous.get(request.id),slot=old && available.find(s=>s.key===old.key);
    if(slot && !used.has(slot.key) && (request.destination==='hold' || slot.kind===request.destination)) {
      result.set(request.id,slot);used.add(slot.key);
    }
  }
  for(const request of ordered) {
    if(result.has(request.id))continue;
    const slot=available.find(s=>s.kind===request.destination && !used.has(s.key));
    if(slot){result.set(request.id,slot);used.add(slot.key);}
  }
  return result;
}
