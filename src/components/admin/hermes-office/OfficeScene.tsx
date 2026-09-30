import React, { useState } from "react";
import { Plus, Move, Sprout } from "lucide-react";
import type { Action, OfficeRoom, Snapshot } from "./types";
import "./office-scene.css";
import GameOfficeWorld from "./GameOfficeWorld";
type Props = {
  state: Snapshot;
  floor: number;
  busy: boolean;
  act: (a: Action) => Promise<boolean>;
  openEmployee: (id: string) => void;
  scan: () => void;
  discovering: boolean;
  now: number;
};
const roomNames: Record<string, string> = {
  work: "업무 공간",
  meeting: "회의실",
  training: "교육실",
  lounge: "라운지",
  awards: "시상 공간",
};
export default function OfficeScene({
  state,
  floor,
  busy,
  act,
  openEmployee,
  scan,
  discovering,
  now,
}: Props) {
  const [edit, setEdit] = useState(false),
    [roomDraft, setRoomDraft] = useState<OfficeRoom | null>(null),
    [seatEmployee, setSeatEmployee] = useState("");
  const members = state.employees
    .filter((e) => Math.floor(e.seat / 25) === floor)
    .sort((a, b) => a.seat - b.seat);
  const rooms = state.rooms.filter((r) => r.floor === floor);
  const newRoom = () =>
    setRoomDraft({
      id: "",
      name: "새 공간",
      kind: "meeting",
      floor,
      x: 2,
      y: 2,
      width: 28,
      height: 22,
    });
  const form = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!roomDraft) return;
    const { id, ...values } = roomDraft;
    if (await act({ type: "room.save", ...(id ? { id } : {}), ...values }))
      setRoomDraft(null);
  };
  return (
    <div className="office-scene-wrap">
      <div className="scene-toolbar">
        <div className="scene-floor-identity">
          <span className="scene-floor-number">
            {String(floor + 1).padStart(2, "0")}
          </span>
          <span>
            <strong>{floor + 1}층 업무 공간</strong>
            <small>입주 {members.length}명 · 좌석 25개</small>
          </span>
        </div>
        <button
          className="secondary"
          aria-expanded={edit}
          onClick={() => setEdit(!edit)}
        >
          <Move size={14} />
          {edit ? "배치 편집 닫기" : "사무실 배치 편집"}
        </button>
      </div>
      {edit && (
        <section className="layout-editor">
          <div className="button-row">
            <button className="secondary" onClick={newRoom}>
              <Plus size={13} /> 공용 공간 추가
            </button>
            <span className="muted">공간을 선택해 위치·크기를 조절하세요.</span>
          </div>
          <div className="room-list">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => setRoomDraft({ ...r })}
                className="secondary"
              >
                {r.name}
              </button>
            ))}
          </div>
          {roomDraft && (
            <form className="room-form" onSubmit={form}>
              <div className="form-grid">
                <label className="field">
                  <span>공간 이름</span>
                  <input
                    required
                    value={roomDraft.name}
                    onChange={(e) =>
                      setRoomDraft({ ...roomDraft, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>공간 종류</span>
                  <select
                    value={roomDraft.kind}
                    onChange={(e) =>
                      setRoomDraft({
                        ...roomDraft,
                        kind: e.target.value as OfficeRoom["kind"],
                      })
                    }
                  >
                    {Object.entries(roomNames).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="room-numbers">
                {(["floor", "x", "y", "width", "height"] as const).map(
                  (key) => (
                    <label className="field" key={key}>
                      <span>
                        {
                          {
                            floor: "층 (0~3)",
                            x: "가로 위치 %",
                            y: "세로 위치 %",
                            width: "너비 %",
                            height: "높이 %",
                          }[key]
                        }
                      </span>
                      <input
                        type="number"
                        min={key === "width" || key === "height" ? 1 : 0}
                        max={key === "floor" ? 3 : 100}
                        required
                        value={roomDraft[key]}
                        onChange={(e) =>
                          setRoomDraft({
                            ...roomDraft,
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              <p className="muted">
                가로 위치+너비, 세로 위치+높이는 100 이하여야 합니다. 화살표
                버튼으로 1%씩 이동할 수 있습니다.
              </p>
              <div className="button-row">
                {[
                  ["←", -1, 0],
                  ["↑", 0, -1],
                  ["↓", 0, 1],
                  ["→", 1, 0],
                ].map(([label, dx, dy]) => (
                  <button
                    key={label}
                    type="button"
                    className="secondary"
                    aria-label={`공간 ${label} 이동`}
                    onClick={() =>
                      setRoomDraft({
                        ...roomDraft,
                        x: Math.max(
                          0,
                          Math.min(
                            100 - roomDraft.width,
                            roomDraft.x + Number(dx),
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            100 - roomDraft.height,
                            roomDraft.y + Number(dy),
                          ),
                        ),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    roomDraft.x + roomDraft.width > 100 ||
                    roomDraft.y + roomDraft.height > 100
                  }
                >
                  공간 저장
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setRoomDraft(null)}
                >
                  취소
                </button>
                {roomDraft.id && (
                  <button
                    type="button"
                    className="text-button danger-text"
                    disabled={busy}
                    onClick={async () => {
                      if (await act({ type: "room.delete", id: roomDraft.id }))
                        setRoomDraft(null);
                    }}
                  >
                    공간 제거
                  </button>
                )}
              </div>
            </form>
          )}
          <form
            className="seat-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              await act({
                type: "seat.swap",
                employeeId: seatEmployee,
                targetSeat: Number(d.get("targetSeat")) - 1,
              });
            }}
          >
            <h4>직원 자리 이동·교환</h4>
            <div className="form-grid">
              <label className="field">
                <span>이동할 직원</span>
                <select
                  required
                  value={seatEmployee}
                  onChange={(e) => setSeatEmployee(e.target.value)}
                >
                  <option value="">직원 선택</option>
                  {state.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.seat + 1}번
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>옮길 좌석 (1~100)</span>
                <input
                  type="number"
                  name="targetSeat"
                  min="1"
                  max="100"
                  required
                />
              </label>
            </div>
            <button className="primary" disabled={busy || !seatEmployee}>
              자리 이동·교환
            </button>
            <p className="muted">
              이미 직원이 있는 자리이면 두 직원의 자리를 교환합니다.
            </p>
          </form>
        </section>
      )}
      <GameOfficeWorld
        state={state}
        floor={floor}
        now={now}
        rooms={(roomDraft && !roomDraft.id ? [...rooms, roomDraft] : rooms).map(
          (room) => (roomDraft?.id === room.id ? roomDraft : room),
        )}
        editing={edit}
        selectRoom={(room) => setRoomDraft({ ...room })}
        openEmployee={openEmployee}
        scan={scan}
        discovering={discovering}
      />
      <div className="floor-caption">
        <span>
          <Sprout size={14} /> 직원을 선택하면 업무와 프로필을 볼 수 있어요.
        </span>
        <small>실제 활동 반영 · 이동·포상은 시각적 연출</small>
      </div>
    </div>
  );
}
