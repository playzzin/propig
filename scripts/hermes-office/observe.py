"""Observe NEW Telegram message records without modifying Hermes or calling models.

SQLite cursor/outbox survives restart. This records observed activity, not an
assertion that the UI controls the gateway. Never reads reasoning/system prompts.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import time
import sys
from discover import clean
from gateway_hook import process_signature


def iso(value=None):
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value else datetime.now(timezone.utc).isoformat()


def plain(content):
    if not isinstance(content, str):
        return ""
    if content.startswith("["):
        try:
            parts = json.loads(content)
            content = "\n".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text")
        except (ValueError, TypeError):
            return "구조화된 응답이 기록되었습니다. 원본 대화에서 확인하세요."
    return clean(content, 10000)


class Observer:
    def __init__(self, home, inventory_path, data):
        self.home, self.inventory_path, self.data = Path(home), Path(inventory_path), Path(data)
        self.data.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.data / "observer.sqlite")
        self.db.executescript("CREATE TABLE IF NOT EXISTS cursors (profile TEXT PRIMARY KEY, last_id INTEGER); CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT);")

    def emit(self, value):
        self.db.execute("INSERT OR IGNORE INTO outbox VALUES (?,?)", (value["eventId"], json.dumps(value, ensure_ascii=False)))

    def flush(self):
        inbox = self.data / "inbox"
        inbox.mkdir(exist_ok=True)
        for identity, raw in self.db.execute("SELECT id,data FROM outbox LIMIT 200").fetchall():
            name = hashlib.sha256(identity.encode()).hexdigest()
            target = inbox / (name + ".json")
            temp = inbox / (name + ".tmp")
            temp.write_text(raw, encoding="utf-8")
            temp.replace(target)
            self.db.execute("DELETE FROM outbox WHERE id=?", (identity,))
        self.db.commit()

    def observe_input_wait(self, connection, active_runs, mapping, host):
        # Some gateway versions emit agent:step only after a blocking tool returns.
        # Supplement only the known hook run; never import history or question text.
        for profile, session, run in active_runs:
            employee = mapping.get(profile)
            if employee is None:
                continue
            row = connection.execute("SELECT m.id,m.role,m.tool_calls,m.timestamp,s.profile_name FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.session_id=? AND m.active=1 AND s.source='telegram' ORDER BY m.id DESC LIMIT 1", (session,)).fetchone()
            if row is None or (row["profile_name"] or "default") != profile:
                continue
            try:
                calls = json.loads(row["tool_calls"] or "[]")
            except (ValueError, TypeError):
                continue
            waiting = row["role"] == "assistant" and isinstance(calls, list) and any(isinstance(c, dict) and isinstance(c.get("function"), dict) and c["function"].get("name") == "clarify" for c in calls)
            identity = "hook-input:" + run
            previous = self.db.execute("SELECT last_id FROM cursors WHERE profile=?", (identity,)).fetchone()
            if (waiting and previous and previous[0] == row["id"]) or (not waiting and (not previous or previous[0] <= 0)):
                continue
            self.emit(dict(type="agent:step", eventId=identity+":"+str(row["id"]), hostId=host, botId=employee["botId"], runId=run,
                at=iso(row["timestamp"]), telemetrySource="observer", existingRunOnly=True,
                stage="input_wait" if waiting else "processing",
                summary="Telegram에서 추가 질문에 대한 답변을 기다리고 있습니다. 해당 대화에서 답해주세요." if waiting else "추가 질문 이후 새 활동 기록을 확인했습니다."))
            self.db.execute("INSERT OR REPLACE INTO cursors VALUES (?,?)", (identity, row["id"] if waiting else -row["id"]))
        self.db.commit()

    def tick(self):
        inventory = json.loads(self.inventory_path.read_text(encoding="utf-8"))
        mapping = {e["profile"]: e for e in inventory["employees"]}
        host = inventory["hostId"]
        accessible = 0
        hooked = set()
        live_hooked = set()
        active_runs = []
        recovering = set()
        hook_db = self.data / "hook.sqlite"
        if hook_db.is_file():
            try:
                with closing(sqlite3.connect(hook_db.resolve().as_uri() + "?mode=ro", uri=True)) as hooks:
                    for profile_name, pid, birth in hooks.execute("SELECT profile,pid,birth FROM receivers"):
                        if pid and birth and process_signature(pid) == birth:
                            hooked.add(profile_name)
                            live_hooked.add(profile_name)
                        elif pid and birth:
                            recovering.add(profile_name)
                        else:
                            hooked.add(profile_name)  # Legacy receiver needs explicit reconnect, not a guessed takeover.
                    active_runs = [(p, s, r) for p, s, r in hooks.execute("SELECT profile,session,run FROM sessions WHERE ended=0") if p in live_hooked]
            except sqlite3.Error:
                pass
        for profile, employee in mapping.items():
            folder = self.home if profile == "default" else self.home / "profiles" / profile
            file = folder / "state.db"
            if not file.is_file():
                continue
            connection = None
            try:
                connection = sqlite3.connect(file.resolve().as_uri() + "?mode=ro", uri=True, timeout=1)
                connection.row_factory = sqlite3.Row
                self.observe_input_wait(connection, active_runs, mapping, host)
                cursor = self.db.execute("SELECT last_id FROM cursors WHERE profile=?", (profile,)).fetchone()
                recovery_key = "recovered:" + profile
                if profile in recovering and not self.db.execute("SELECT 1 FROM cursors WHERE profile=?", (recovery_key,)).fetchone():
                    latest = connection.execute("SELECT COALESCE(MAX(id),0) FROM messages").fetchone()[0]
                    self.db.execute("INSERT OR REPLACE INTO cursors VALUES (?,?)", (profile, latest))
                    self.db.execute("INSERT OR REPLACE INTO cursors VALUES (?,?)", (recovery_key, latest))
                    self.db.commit()
                    accessible += 1
                    continue  # Establish a new boundary; do not import partial turns from a stopped hook.
                if profile in hooked:
                    self.db.execute("DELETE FROM cursors WHERE profile=?", (recovery_key,))
                if cursor is None:
                    latest = connection.execute("SELECT COALESCE(MAX(id),0) FROM messages").fetchone()[0]
                    accessible += 1
                    self.db.execute("INSERT INTO cursors VALUES (?,?)", (profile, latest))
                    self.db.commit()
                    continue  # Explicit no historical private conversation import.
                rows = connection.execute("SELECT m.id,m.session_id,m.role,m.content,m.tool_calls,m.tool_name,m.timestamp,m.finish_reason,s.profile_name FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.id>? AND m.active=1 AND s.source='telegram' ORDER BY m.id LIMIT 300", (cursor[0],)).fetchall()
                accessible += 1
                for row in rows:
                    routed = mapping.get(row["profile_name"] or profile)
                    if routed is None:
                        continue  # Unknown multiplex identity must never fall back to another bot.
                    if routed["profile"] in hooked:
                        continue  # Exact gateway hooks own this profile; avoid duplicate employees' tasks.
                    user = connection.execute("SELECT id,content FROM messages WHERE session_id=? AND role='user' AND id<=? AND active=1 ORDER BY id DESC LIMIT 1", (row["session_id"], row["id"])).fetchone()
                    if not user:
                        continue
                    base = dict(hostId=host, botId=routed["botId"], runId=profile + ":" + row["session_id"] + ":" + str(user["id"]),
                                eventId="observe:" + host + ":" + profile + ":" + str(row["id"]), at=iso(row["timestamp"]),
                                title=plain(user["content"])[:200] or "Telegram 업무", telemetrySource="observer")
                    if row["role"] == "user":
                        self.emit(dict(base, type="agent:start", summary="Telegram 요청 기록을 확인했습니다. 기록 관찰 방식으로 진행을 표시합니다."))
                    elif row["role"] == "tool" or (row["role"] == "assistant" and row["tool_calls"]):
                        self.emit(dict(base, type="agent:step", summary=clean(row["tool_name"] or "도구 실행", 180) + " 관련 활동이 기록되었습니다."))
                    elif row["role"] == "assistant" and row["content"]:
                        self.emit(dict(base, type="agent:end", summary="응답이 기록되었습니다. 실제 결과와 완료 조건을 검토해주세요.", result=plain(row["content"])))
                # Advance over non-Telegram messages too; never ingest those contents.
                if rows:
                    last = rows[-1]["id"]
                else:
                    last = connection.execute("SELECT COALESCE(MAX(id),0) FROM messages").fetchone()[0]
                self.db.execute("UPDATE cursors SET last_id=? WHERE profile=?", (last, profile))
                self.db.commit()
            except (sqlite3.Error, OSError):
                self.db.rollback()
            finally:
                if connection:
                    connection.close()
        if accessible and time.time() - getattr(self, "last_heartbeat", 0) >= 15:
            stamp = iso()
            self.emit(dict(type="heartbeat", eventId="observer-heartbeat:" + stamp, hostId=host, at=stamp))
            self.db.commit()
            self.last_heartbeat = time.time()
        self.flush()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    Path(args.data).mkdir(parents=True, exist_ok=True)
    lock = open(Path(args.data) / "observer.lock", "a+")
    try:
        if sys.platform != "win32":
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        else:
            import msvcrt
            lock.seek(0)
            if not lock.read(1):
                lock.write("1"); lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        print("이미 실행 중인 기록 관찰기를 유지합니다.", flush=True)
        sys.exit(0)
    observer = Observer(args.home, args.inventory, args.data)
    print("새 Telegram 업무 기록 관찰 시작 (기존 기록·봇 설정 변경 없음)", flush=True)
    while True:
        try:
            observer.tick()
        except (OSError, ValueError):
            pass
        if args.once:
            break
        time.sleep(2)
