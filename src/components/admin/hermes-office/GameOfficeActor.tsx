import { memo, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { Check, MessageCircle, BookOpen, Star } from "lucide-react";
import type { Employee } from "./types";
import type { SceneActivity } from "./gameSceneState";
import type { SceneIntent } from "./sceneIntent";
import type { Geometry, Point } from "./sceneNavigation";
import { SceneMotion, subscribeMotion } from "./sceneMotion";
import type { SceneTraffic } from "./sceneTraffic";
function GameOfficeActor({
  employee,
  activity,
  intent,
  target,
  compact,
  annotation,
  geometry,
  controller,
  traffic,
  motion,
  openEmployee,
}: {
  employee: Employee;
  activity: SceneActivity;
  intent: SceneIntent;
  target: Point | null;
  compact: boolean;
  annotation: string;
  geometry: Geometry;
  controller: SceneMotion;
  traffic: SceneTraffic;
  motion: boolean;
  openEmployee: (id: string) => void;
}) {
  const node = useRef<HTMLButtonElement>(null);
  const [failedAvatar, setFailedAvatar] = useState("");
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const phase = controller.phase;
  const targetX = target?.x;
  const targetY = target?.y;
  const pointer = useRef<{x:number;y:number}|null>(null);
  // Arrival describes the pose; paused describes movement permission, not location.
  const arrived = target !== null && Math.hypot(controller.point.x-target.x,controller.point.y-target.y)<.01;
  const posing = activity.working && arrived && intent.destination !== "hold";
  const character =
    (
      { "🤖": "robot", "🐱": "cat", "🧑": "person", "🌱": "mascot" } as Record<
        string,
        string
      >
    )[employee.character] ||
    employee.character ||
    "robot";
  useLayoutEffect(() => {
    controller.bindTraffic(traffic,employee.id);
    return () => controller.unbindTraffic();
  }, [controller,traffic,employee.id]);
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) return;
    const destination = targetX === undefined || targetY === undefined ? null : {x:targetX,y:targetY};
    controller.reconcile(`${intent.destination}:${intent.taskId || ""}`,destination,geometry,motion);
    const paint = () => {
      element.style.transform = `translate(${controller.point.x-76}px, ${controller.point.y-114}px)`;
      element.dataset.pointX = String(controller.point.x);
      element.dataset.pointY = String(controller.point.y);
      element.dataset.phase = controller.phase;
      element.dataset.generation = String(controller.generation);
      element.dataset.moving = String(controller.phase === "walking");
    };
    paint();
    if (controller.phase !== "walking" && controller.phase !== "waiting") return;
    const generation=controller.generation;
    const unsubscribe=subscribeMotion(ms => {controller.tick(ms,generation);paint();if(controller.phase!=="walking" && controller.phase!=="waiting")unsubscribe();});
    return unsubscribe;
  }, [controller, traffic, geometry, intent.destination, intent.taskId, targetX, targetY, motion]);
  return (
    <button
      ref={node}
      data-employee-id={employee.id}
      data-destination={intent.destination}
      data-typing={posing}
      className={`scene-employee game-actor ${posing ? "executing" : ""} ${activity.waiting ? "awaiting-reply" : ""} ${activity.unavailable ? "employee-unavailable" : ""} ${compact && arrived ? "in-room" : ""} ${activity.result ? "has-result" : ""} ${activity.ceremonial ? "celebrating" : ""}`}
      style={
        {
          left: 0,
          top: 0,
          transform: `translate(${controller.point.x-76}px, ${controller.point.y-114}px)`,
          "--employee": employee.color || "#387568",
          "--actor-delay": `${(employee.seat % 5) * -0.6}s`,
        } as CSSProperties
      }
      onPointerDown={event => {pointer.current={x:event.clientX,y:event.clientY};}}
      onPointerCancel={() => {pointer.current=null;}}
      onClick={event => {const start=pointer.current;pointer.current=null;if(event.detail===0 || !start || Math.hypot(event.clientX-start.x,event.clientY-start.y)<8)openEmployee(employee.id);}}
      aria-label={`${employee.name}, ${intent.label}, ${annotation}, ${controller.reason}, 상세 보기`}
      title={`${employee.name} · ${intent.label} · ${annotation} · ${controller.reason}`}
    >
      <span className="scene-status">
        <i aria-hidden="true" />
        {intent.label}
      </span>
      <span
        aria-hidden="true"
        className={`office-figure game-character figure-${character} accessory-${employee.accessory || "none"} figure-${activity.kind} ${posing ? "is-working" : ""}`}
        style={{ "--employee": employee.color || "#387568" } as CSSProperties}
      >
        <span className="figure-shadow" />
        <span className="figure-leg left" />
        <span className="figure-leg right" />
        <span className="figure-body">
          <i className="figure-collar" />
          <i className="figure-arm left" />
          <i className="figure-arm right" />
          <i className="figure-tie" />
        </span>
        <span className="figure-head">
          {employee.avatar && failedAvatar !== employee.avatar ? (
            <img
              src={employee.avatar}
              alt=""
              width={48}
              height={48}
              draggable={false}
              onError={() => setFailedAvatar(employee.avatar)}
            />
          ) : (
            <span className="figure-initials">{employee.name.slice(0, 2)}</span>
          )}
          <i className="figure-glasses" />
          <i className="figure-headset" />
        </span>
        <span className="game-emote">
          {activity.waiting ? (
            <MessageCircle size={17} />
          ) : activity.result ? (
            <Check size={18} />
          ) : activity.ceremonial ? (
            <Star size={17} />
          ) : posing && activity.kind === "training" ? (
            <BookOpen size={17} />
          ) : posing ? (
            <span className="game-typing">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </span>
        {activity.ceremonial && (
          <span className="game-sparkles">
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
      <span className="game-nameplate">
        <strong>{employee.name}</strong>
        <small>{phase === "walking" ? "이동 연출" : intent.destination === "lounge" && arrived ? "휴식 연출 · 업무 대기" : phase === "hold" ? "현재 위치 유지" : employee.title || "직책 미지정"}</small>
      </span>
    </button>
  );
}

export default memo(GameOfficeActor, (a,b) =>
  a.employee === b.employee && a.geometry === b.geometry && a.controller === b.controller && a.traffic === b.traffic &&
  a.motion === b.motion && a.compact === b.compact && a.annotation === b.annotation &&
  a.openEmployee === b.openEmployee && a.target?.x === b.target?.x && a.target?.y === b.target?.y &&
  JSON.stringify(a.intent) === JSON.stringify(b.intent));
