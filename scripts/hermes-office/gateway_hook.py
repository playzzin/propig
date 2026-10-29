"""Hermes gateway hook adapter: allowlisted local records, no network calls.

Loaded by a generated HOOK.yaml/handler.py pair after explicit installation.
The durable outbox and active session keys are local to this office connector.
"""
from __future__ import annotations
from datetime import datetime, timezone
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import threading
import uuid
from discover import clean

LOCK = threading.RLock()


def stamp():
    return datetime.now(timezone.utc).isoformat()


def process_signature(pid):
    try:
        return Path("/proc", str(pid), "stat").read_text().rsplit(")", 1)[1].split()[19]
    except (OSError, IndexError):
        return ""


def resolve_profile(home, context, configured_profile):
    """Resolve multiplexed sessions through their persisted profile identity."""
    session = context.get("session_id")
    if not isinstance(session, str) or not session:
        return None
    if configured_profile != "default":
        return configured_profile
    database = Path(home) / "state.db"
    if database.is_file():
        try:
            with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=0.5)) as connection:
                row = connection.execute("SELECT profile_name FROM sessions WHERE id=?", (session,)).fetchone()
                if row:
                    return row[0] or "default"
        except sqlite3.Error:
            return None
    # If a multiplexed session cannot be identified, do not guess another bot.
    return None


def handle(event_type, context, config_path):
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    data = Path(config["data"])
    data.mkdir(parents=True, exist_ok=True)
    if event_type != "gateway:startup" and (not isinstance(context, dict) or context.get("platform") != "telegram"):
        return
    inventory = json.loads((data / "inventory.json").read_text(encoding="utf-8"))
    with LOCK, closing(sqlite3.connect(data / "hook.sqlite", timeout=2)) as database, database:
        database.executescript("CREATE TABLE IF NOT EXISTS sessions(profile TEXT, session TEXT, run TEXT, ended INTEGER, PRIMARY KEY(profile,session)); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE IF NOT EXISTS receivers(profile TEXT PRIMARY KEY, at TEXT);")
        columns = {row[1] for row in database.execute("PRAGMA table_info(receivers)")}
        for name, sql_type in (("pid", "INTEGER"), ("birth", "TEXT")):
            if name not in columns:
                database.execute("ALTER TABLE receivers ADD COLUMN " + name + " " + sql_type)
        if event_type == "gateway:startup":
            database.executemany("INSERT OR REPLACE INTO receivers VALUES (?,?,?,?)", [(p, stamp(), os.getpid(), process_signature(os.getpid())) for p in config.get("coveredProfiles", [config["profile"]])])
            value = dict(type="heartbeat", eventId="hook-startup:" + uuid.uuid4().hex, hostId=inventory["hostId"], at=stamp())
        else:
            profile = resolve_profile(config["home"], context, config["profile"])
            employee = next((e for e in inventory["employees"] if e["profile"] == profile), None)
            if employee is None or event_type not in ("agent:start", "agent:step", "agent:end"):
                return
            session = context["session_id"]
            previous = database.execute("SELECT run,ended FROM sessions WHERE profile=? AND session=?", (profile, session)).fetchone()
            if event_type == "agent:start":
                run = "hook-" + uuid.uuid4().hex
                database.execute("INSERT OR REPLACE INTO sessions VALUES (?,?,?,0)", (profile, session, run))
            elif not previous or previous[1]:
                return
            else:
                run = previous[0]
            at = stamp()
            value = dict(type=event_type, eventId=run + ":" + event_type + ":" + uuid.uuid4().hex,
                runId=run, hostId=inventory["hostId"], botId=employee["botId"], at=at, telemetrySource="hook")
            if event_type == "agent:start":
                value.update(title=clean(context.get("message"), 200) or "Telegram 업무", summary="Hermes가 Telegram 요청을 받아 실제 처리를 시작했습니다.")
            elif event_type == "agent:step":
                names = context.get("tool_names", [])
                names = [clean(n, 80) for n in names[:10] if isinstance(n, str)] if isinstance(names, list) else []
                value.update(summary="도구 사용: " + ", ".join(names) if names else "Hermes가 다음 작업 단계를 처리하고 있습니다.", stage="tool" if names else "processing")
            else:
                value.update(result=clean(context.get("response"), 10000), summary="Hermes 처리 종료를 확인했습니다. 결과와 완료 조건을 검토해주세요. (공식 이벤트의 응답 요약)")
                database.execute("UPDATE sessions SET ended=1 WHERE profile=? AND session=?", (profile, session))
        database.execute("INSERT OR IGNORE INTO outbox VALUES (?,?)", (value["eventId"], json.dumps(value, ensure_ascii=False)))
        database.commit()
        inbox = data / "inbox"
        inbox.mkdir(exist_ok=True)
        for identity, raw in database.execute("SELECT id,data FROM outbox ORDER BY rowid LIMIT 100").fetchall():
            name = hashlib.sha256(identity.encode()).hexdigest()
            temp = inbox / (name + ".tmp")
            temp.write_text(raw, encoding="utf-8")
            temp.replace(inbox / (name + ".json"))
            database.execute("DELETE FROM outbox WHERE id=?", (identity,))
