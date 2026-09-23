import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  Coffee,
  Gamepad2,
  Maximize,
  Minus,
  Monitor,
  MoveHorizontal,
  Pause,
  Play,
  Plus,
  Sprout,
  Trophy,
  Users,
} from "lucide-react";
import type { OfficeRoom, Snapshot } from "./types";
import { indexSceneInputs, sceneIntent } from "./sceneIntent";
import { deskPosition, deskPoint, officeGeometry, pointSafe, reserveSlots, WORLD_WIDTH, ROW_HEIGHT, type Slot } from "./sceneNavigation";
import { SceneMotion } from "./sceneMotion";
import { SceneTraffic } from "./sceneTraffic";
import GameOfficeActor from "./GameOfficeActor";
import { DeskArt, PlantArt, ReceptionArt, RoomArt } from "./GameOfficeArt";
import "./office-game.css";

// Expiry ticks must not rebuild thousands of decorative SVG nodes.
const StaticDesk = memo(DeskArt);
const StaticRoom = memo(RoomArt);
const subscribeReduced = (listener: () => void) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const getReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeVisible = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
const getVisible = () => !document.hidden;
const fallbackReduced = () => true;
const fallbackVisible = () => false;

const roomIcon = {
  work: Monitor,
  meeting: Users,
  training: BookOpen,
  lounge: Coffee,
  awards: Trophy,
};

export default function GameOfficeWorld({
  state,
  floor,
  now,
  rooms,
  editing,
  selectRoom,
  openEmployee,
  scan,
  discovering,
}: {
  state: Snapshot;
  floor: number;
  now: number;
  rooms: OfficeRoom[];
  editing: boolean;
  selectRoom: (room: OfficeRoom) => void;
  openEmployee: (id: string) => void;
  scan: () => void;
  discovering: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [positions] = useState(() => new Map<string, { seat: number; controller: SceneMotion }>());
  const [reservations] = useState(() => new Map<number, Map<string, Slot>>());
  const [clock, setClock] = useState({source:now,time:now});
  const factNow = clock.source === now ? clock.time : now;
  useEffect(() => {
    const anchor = Date.now();
    const tick = () => setClock({source:now,time:now+Math.max(0,Date.now()-anchor)});
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [now]);
  useEffect(() => {
    const ids = new Set(state.employees.map(e => e.id));
    for (const id of positions.keys()) if (!ids.has(id)) positions.delete(id);
    for (const slots of reservations.values()) for (const id of slots.keys()) if (!ids.has(id)) slots.delete(id);
  }, [state.employees, positions, reservations]);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<number | "auto" | "fit">("auto");
  const [motionPreference, setMotionPreference] = useState(() => {
    try {
      return localStorage.getItem("hermes-office-motion") !== "off";
    } catch {
      return true;
    }
  });
  const reduced = useSyncExternalStore(
    subscribeReduced,
    getReduced,
    fallbackReduced,
  );
  const visible = useSyncExternalStore(
    subscribeVisible,
    getVisible,
    fallbackVisible,
  );
  const motion = motionPreference && !reduced && visible && !editing;
  const members = state.employees
    .filter((employee) => Math.floor(employee.seat / 25) === floor)
    .sort((a, b) => a.seat - b.seat);
  const rows = Math.max(
    2,
    ...members.map((e) => Math.floor((e.seat % 25) / 5) + 1),
  );
  const empty = !members.length && !editing;
  const worldHeight = empty
    ? 430
    : Math.ceil((116 + rows * ROW_HEIGHT + 44) / 0.75);
  const naturalScale = width >= 620 ? Math.min(1, width / WORLD_WIDTH) : 1;
  const scale = empty
    ? 1
    : zoom === "fit"
      ? Math.min(1, Math.max(0.2, width / WORLD_WIDTH), 620 / worldHeight)
      : zoom === "auto"
        ? naturalScale
        : zoom;
  const mapWidth = empty ? Math.max(280, width) : WORLD_WIDTH;
  const roomKey = JSON.stringify(rooms);
  const geometry = useMemo(() => officeGeometry(rows, JSON.parse(roomKey), worldHeight), [rows, roomKey, worldHeight]);
  // Door claims are swept-foot passage reservations, separate from room slots.
  // Each visible floor owns its manager; actor layout-effect cleanup releases it.
  const traffic = useMemo(() => new SceneTraffic(geometry.rooms.map(({door}) => ({
    ...door,x:door.x-geometry.radius,y:door.y-geometry.radius,
    width:door.width+geometry.radius*2,height:door.height+geometry.radius*2,
  }))), [geometry,floor]);
  const sceneInputs = useMemo(() => indexSceneInputs(state), [state]);
  const intents = new Map(members.map(e => [e.id, sceneIntent(sceneInputs.get(e.id)!, e, factNow)]));
  const statuses = new Map(members.map(e => [e.id, intents.get(e.id)!.activity]));
  const working = [...statuses.values()].filter((s) => s.working).length;
  const waiting = [...statuses.values()].filter((s) => s.waiting).length;
  const scrolls = !empty && WORLD_WIDTH * scale > width + 2;
  useEffect(() => {
    const target = viewport.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    viewport.current?.scrollTo({ top: 0, left: 0 });
  }, [floor]);
  const changeZoom = (next: typeof zoom) => {
    setZoom(next);
    if (next === "fit" || next === "auto")
      requestAnimationFrame(() =>
        viewport.current?.scrollTo({ top: 0, left: 0 }),
      );
  };
  const toggleMotion = () => {
    const next = !motionPreference;
    setMotionPreference(next);
    try {
      localStorage.setItem("hermes-office-motion", next ? "on" : "off");
    } catch {
      /* Storage is optional for the visual preference. */
    }
  };
  const jump = (zone: "desks" | "rooms") =>
    viewport.current?.scrollTo({
      top: zone === "desks" ? 0 : worldHeight * 0.69 * scale,
      behavior: motion ? "smooth" : "instant",
    });
  const slotKey = JSON.stringify(members.map(e => ({id:e.id,destination:intents.get(e.id)!.destination})));
  const roomPositions = reserveSlots(geometry, JSON.parse(slotKey), reservations.get(floor) || new Map());
  useEffect(() => { reservations.set(floor, roomPositions); }, [floor, roomPositions, reservations]);
  return (
    <section
      className={`game-world ${!motion ? "game-motion-off" : ""} ${editing ? "game-editing" : ""}`}
      aria-label="게임형 사무실"
    >
      <div className="game-hud">
        <div className="game-world-title">
          <span className="game-emblem">
            <Gamepad2 size={20} />
          </span>
          <span>
            <strong>OFFICE WORLD</strong>
            <small>{floor + 1}층 · 함께 일하는 공간</small>
          </span>
        </div>
        <div className="game-live-states">
          <span>
            <i className="game-indicator" />
            작업 {working}
          </span>
          <span className={waiting ? "has-waiting" : ""}>
            답변 대기 {waiting}
          </span>
        </div>
      </div>
      <div className="game-controls">
        <div className="game-camera" aria-label="지도 확대 조절">
          <button
            type="button"
            aria-label="지도 축소"
            disabled={empty || scale <= 0.5}
            onClick={() =>
              changeZoom(Math.max(0.5, Math.round((scale - 0.15) * 100) / 100))
            }
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="game-zoom-value"
            aria-label="지도 기본 크기"
            onClick={() => changeZoom("auto")}
            disabled={empty}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            aria-label="지도 확대"
            disabled={empty || scale >= 1.5}
            onClick={() =>
              changeZoom(Math.min(1.5, Math.round((scale + 0.15) * 100) / 100))
            }
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => changeZoom("fit")}
            disabled={empty}
            className="game-fit"
          >
            <Maximize size={14} />
            전체 보기
          </button>
        </div>
        <button
          className="game-motion-button"
          type="button"
          onClick={toggleMotion}
          aria-pressed={motionPreference && !reduced}
          disabled={reduced}
        >
          {motionPreference && !reduced ? (
            <Pause size={13} />
          ) : (
            <Play size={13} />
          )}
          {reduced
            ? "동작 줄이기 적용 중"
            : motionPreference
              ? "애니메이션 끄기"
              : "애니메이션 켜기"}
        </button>
      </div>
      {scrolls && (
        <p className="scene-scroll-hint game-scroll-hint">
          <MoveHorizontal size={14} />
          지도를 좌우로 움직이거나 전체 보기를 눌러보세요.
        </p>
      )}
      <div
        className="scene-map-viewport game-viewport"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label={`${floor + 1}층 사무실 지도. 방향키와 스크롤로 이동할 수 있습니다.`}
      >
        <div
          className="game-world-size"
          style={{ width: mapWidth * scale, height: worldHeight * scale }}
        >
          <div
            className={`live-office-map game-map ${empty ? "map-empty" : ""}`}
            style={{
              width: mapWidth,
              height: worldHeight,
              transform: `scale(${scale})`,
            }}
            aria-label={`${floor + 1}층 사무실 지도`}
          >
            <div className="game-architecture" aria-hidden="true">
              <span className="game-wall back-wall" />
              <span className="game-wall left-wall" />
              <span className="game-floor-edge" />
              <span className="game-window window-a">
                <i />
                <i />
                <i />
              </span>
              <span className="game-window window-b">
                <i />
                <i />
                <i />
              </span>
              <span className="game-reception">
                <ReceptionArt />
              </span>
              <span className="game-plant plant-a">
                <PlantArt />
              </span>
              <span className="game-plant plant-b">
                <PlantArt />
              </span>
              {!empty && (
                <>
                  <span className="game-zone-sign work-zone">
                    WORK SPACE <b>{String(floor + 1).padStart(2, "0")}</b>
                  </span>
                  <span
                    className="game-corridor"
                    style={{ top: worldHeight * 0.75 - 33 }}
                  >
                    <i />
                    <i />
                    <i />
                    <span>COMMON AREA</span>
                  </span>
                  {Array.from({ length: rows }, (_, row) => (
                    <span
                      key={row}
                      className="game-row-rug"
                      style={{ top: 136 + row * ROW_HEIGHT }}
                    />
                  ))}
                </>
              )}
            </div>
            {geometry.rooms.map((layout) => {
              const room = layout.room;
              const Icon = roomIcon[room.kind];
              return (
                <div
                  key={room.id || "draft"}
                  className={`scene-room game-room room-${room.kind} ${editing ? "room-editable" : ""}`}
                  style={{
                    left: layout.x,
                    top: layout.y,
                    width: layout.width,
                    height: layout.height,
                  }}
                >
                  <button
                    className="room-label"
                    disabled={!editing}
                    onClick={() => selectRoom(room)}
                  >
                    <Icon size={13} />
                    <span>{room.name}</span>
                    {editing && <span className="game-edit-room">편집</span>}
                  </button>
                  <div className="game-furniture" style={{left:layout.furniture.x-layout.x-3,top:layout.furniture.y-layout.y-8,width:layout.furniture.width,height:layout.furniture.height,right:"auto",bottom:"auto"}}>
                    <StaticRoom kind={room.kind} />
                  </div>
                  <span className="game-room-door" style={{left:layout.door.x-layout.x-3,width:layout.door.width}} aria-hidden="true" />
                </div>
              );
            })}
            {!empty &&
              Array.from({ length: rows * 5 }, (_, index) => {
                const employee = members.find((e) => e.seat % 25 === index);
                const position = deskPosition(index);
                return (
                  <div
                    key={index}
                    className={`game-station ${!employee ? "vacant" : ""}`}
                    style={{ left: position.x, top: position.y + 66 }}
                    aria-hidden="true"
                  >
                    {employee ? (
                      <StaticDesk
                        active={
                          !!statuses.get(employee.id)?.working &&
                          !roomPositions.has(employee.id)
                        }
                      />
                    ) : (
                      <span className="game-vacant-desk">
                        <Monitor size={21} />
                        <small>빈 좌석</small>
                      </span>
                    )}
                    <span className="game-desk-number">
                      {String(floor * 25 + index + 1).padStart(2, "0")}
                    </span>
                  </div>
                );
              })}
            {members.map((employee) => {
              const desk = deskPoint(employee.seat);
              const intent = intents.get(employee.id)!;
              const slot = roomPositions.get(employee.id);
              let cached = positions.get(employee.id);
              if (!cached || cached.seat !== employee.seat) {
                const spawn = pointSafe(geometry, desk) ? desk : geometry.nodes.find(p => pointSafe(geometry,p) && ![...positions.values()].some(c => Math.hypot(c.controller.point.x-p.x,c.controller.point.y-p.y)<24));
                if (!spawn) return null;
                cached = { seat:employee.seat, controller:new SceneMotion(spawn) };
                positions.set(employee.id,cached);
              }
              const target = intent.destination === "hold" ? null : slot || desk;
              const annotation = intent.destination === "hold" ? intent.reason : !slot && intent.destination !== "desk" ? `${intent.reason} · 목적지 자리 없음, 업무석 유지` : intent.reason;
              return (
                <GameOfficeActor
                  key={`${floor}:${employee.id}:${employee.seat}`}
                  employee={employee}
                  activity={statuses.get(employee.id)!}
                  intent={intent}
                  target={target}
                  compact={!!slot}
                  annotation={annotation}
                  geometry={geometry}
                  controller={cached.controller}
                  traffic={traffic}
                  motion={motion}
                  openEmployee={openEmployee}
                />
              );
            })}
            {empty && (
              <div className="scene-empty">
                <Sprout size={28} />
                <h3>
                  {state.employees.length
                    ? "새 동료를 위한 공간"
                    : "첫 출근을 기다리고 있어요"}
                </h3>
                <p>실제 봇을 연결하면 나만의 사무실이 채워집니다.</p>
                <button
                  className="primary"
                  onClick={scan}
                  disabled={discovering}
                >
                  봇 정보 확인
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="game-bottom-bar">
        <div className="game-zone-buttons">
          <button type="button" onClick={() => jump("desks")} disabled={empty}>
            <Monitor size={13} />
            업무석
          </button>
          <button
            type="button"
            onClick={() => jump("rooms")}
            disabled={empty || !rooms.length}
          >
            <Coffee size={13} />
            공용 공간
          </button>
        </div>
        <span>
          <i className="game-indicator" />
          실제 활동 기반 · 이동·대기 동작은 연출
        </span>
      </div>
      {!empty && <details className="game-member-list">
        <summary>직원 선택 · {members.length}명 (이동·휴식은 연출)</summary>
        <div>{members.map(employee => <button type="button" key={employee.id} onClick={() => openEmployee(employee.id)}>
          <strong>{employee.name}</strong><span>{intents.get(employee.id)!.label}</span>
        </button>)}</div>
      </details>}
    </section>
  );
}
