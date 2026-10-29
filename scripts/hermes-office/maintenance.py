"""Local office backup and its own observer lifecycle; no Hermes changes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
from contextlib import closing, contextmanager
import time
from datetime import datetime, timezone


COLLECTIONS = ("employees", "departments", "hosts", "tasks", "projects", "records", "workflows", "training", "rooms", "events")
TABLES = {
    "state": ("id", "value"), "seen": ("id",),
    "runs": ("host", "run", "task", "last_at", "ended"),
    "audit": ("id", "value"), "claims": ("host", "run", "day"),
    "run_usage": ("host", "run", "task", "value"),
}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def normalized_state(state):
    """Only the two deliberate restore safety settings differ from the backup."""
    value = json.loads(json.dumps(state))
    value["settings"].pop("dispatchPaused", None)
    value["settings"].pop("executionScope", None)
    return value


def validate_office(connection):
    if connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
        raise ValueError("사무실 데이터베이스 무결성을 확인하지 못했습니다.")
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not TABLES.keys() <= tables:
        raise ValueError("정상 사무실 백업에 필요한 장부가 없습니다.")
    for table, columns in TABLES.items():
        actual = tuple(row[1] for row in connection.execute('PRAGMA table_info("' + table + '")'))
        if actual != columns:
            raise ValueError("사무실 장부 형식을 확인하지 못했습니다.")
    rows = connection.execute("SELECT id,value FROM state").fetchall()
    if len(rows) != 1 or rows[0][0] != 1:
        raise ValueError("사무실 상태가 없습니다.")
    try:
        state = json.loads(rows[0][1])
    except (ValueError, TypeError) as error:
        raise ValueError("사무실 상태 형식이 손상됐습니다.") from error
    if (not isinstance(state, dict) or not isinstance(state.get("settings"), dict)
            or type(state.get("revision")) is not int
            or any(not isinstance(state.get(key), list) for key in COLLECTIONS)):
        raise ValueError("사무실 상태 형식을 확인하지 못했습니다.")
    return state


@contextmanager
def readonly_office(path):
    original = Path(path)
    if original.is_symlink() or not original.is_file():
        raise ValueError("기존 사무실 데이터베이스 파일을 선택하세요.")
    # mode=ro is essential: a wrong path must never create a new source database.
    with closing(sqlite3.connect(original.resolve().as_uri() + "?mode=ro", uri=True, timeout=20)) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA trusted_schema=OFF")
        connection.execute("BEGIN")
        state = validate_office(connection)
        yield connection, state


def database_summary(path):
    """Counts and hashes only; never serialize employee names or result text."""
    with readonly_office(path) as (connection, state):
        tables = {}
        for table in TABLES:
            rows = connection.execute('SELECT * FROM "' + table + '" ORDER BY rowid').fetchall()
            tables[table] = dict(count=len(rows), sha256=digest(normalized_state(state)) if table == "state" else digest(rows))
        results = [(task.get("id"), task.get("result", ""), task.get("resultVersions", [])) for task in state["tasks"]]
        return dict(stateSha256=digest(normalized_state(state)), tables=tables,
            collections={key: dict(count=len(state[key]), sha256=digest(state[key])) for key in COLLECTIONS},
            results=dict(count=sum(bool(task.get("result")) for task in state["tasks"]), sha256=digest(results)))


def backup(data):
    data = Path(data).resolve()
    with readonly_office(data / "office.sqlite") as (source, _):
        folder = data / "backups"
        if folder.is_symlink():
            raise ValueError("백업 폴더의 연결 경로를 확인하세요.")
        folder.mkdir(exist_ok=True)
        target = folder / ("office-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".sqlite")
        # Exclusive reservation prevents an existing backup from being overwritten.
        with target.open("xb"):
            pass
        try:
            with closing(sqlite3.connect(target)) as destination:
                source.backup(destination)
                validate_office(destination)
        except Exception:
            target.unlink(missing_ok=True)  # Only the file reserved by this call.
            raise
    return target


def restore_copy(source, destination):
    """Create an isolated copy; never restore over an existing office or folder."""
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError("복원은 아직 존재하지 않는 새 폴더에만 가능합니다.")
    if not destination.parent.is_dir():
        raise ValueError("복원 폴더를 둘 상위 폴더가 필요합니다.")
    with readonly_office(source) as (original, _):
        destination.mkdir()  # Atomic refusal if another process creates it first.
        target = destination / "office.sqlite"
        pending = destination / ".restore-copy.pending"
        try:
            with closing(sqlite3.connect(pending)) as restored:
                original.backup(restored)
                state = validate_office(restored)
                state["settings"].update(dispatchPaused=True, executionScope=None)
                with restored:
                    restored.execute("UPDATE state SET value=? WHERE id=1", (json.dumps(state, ensure_ascii=False),))
                validate_office(restored)
            # Publish the fully paused copy exclusively: no overwrite, even if a
            # different process creates office.sqlite while the copy is prepared.
            os.link(pending, target)
        finally:
            for suffix in ("", "-wal", "-shm", "-journal"):
                pending.with_name(pending.name + suffix).unlink(missing_ok=True)
    return target


def stop_observer(data):
    if os.name == "nt":
        raise ValueError("이 기능은 Linux 관찰기에만 사용합니다.")
    data = Path(data).resolve()
    script = str(Path(__file__).resolve().with_name("observe.py"))
    stopped = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit() or int(entry.name) == os.getpid():
            continue
        try:
            args = (entry / "cmdline").read_bytes().split(b"\0")
            args = [a.decode("utf-8", "replace") for a in args if a]
            if script not in args or "--data" not in args:
                continue
            target = Path(args[args.index("--data") + 1]).resolve()
            if target != data:
                continue
            os.kill(int(entry.name), signal.SIGTERM)
            stopped.append(int(entry.name))
        except (OSError, ValueError, IndexError):
            continue
    deadline = time.monotonic() + 5
    while any(Path("/proc", str(pid)).exists() for pid in stopped) and time.monotonic() < deadline:
        time.sleep(0.1)
    return len(stopped)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data")
    parser.add_argument("--stop-observer", action="store_true")
    parser.add_argument("--restore-from")
    parser.add_argument("--destination")
    args = parser.parse_args()
    if args.restore_from:
        if not args.destination or args.data or args.stop_observer:
            parser.error("복원에는 --restore-from과 --destination만 사용하세요.")
    elif not args.data or args.destination:
        parser.error("백업 또는 관찰기 관리에는 --data가 필요합니다.")
    try:
        if args.restore_from:
            restore_copy(args.restore_from, args.destination)
            print("office restore copy created; execution paused; connection files not copied")
        elif args.stop_observer:
            print("office observers stopped:", stop_observer(args.data))
        else:
            backup(args.data)
            print("office backup created")
    except (ValueError, OSError, sqlite3.Error):
        print("사무실 유지관리를 완료하지 못했습니다. 원본 파일과 새 목적 경로를 확인하세요.")
        raise SystemExit(1)
