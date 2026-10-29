"""Opt-in local worker pool. Configuration names key files, never key values."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import threading
import time
import urllib.request
from urllib.parse import urlparse
from worker import Worker, endpoint, read_key


def key_path(value, data):
    """Resolve Linux key references for the Windows pool without copying keys."""
    if sys.platform != "win32" or not value.startswith("/"):
        return value
    connection = json.loads((Path(data) / "connection.json").read_text(encoding="utf-8-sig"))
    distro = connection.get("distro", "")
    home = PurePosixPath(connection.get("home", ""))
    source = PurePosixPath(value)
    if (connection.get("kind") != "wsl" or not re.fullmatch(r"[A-Za-z0-9._-]+", distro)
            or not home.is_absolute() or ".." in source.parts or not source.is_relative_to(home)):
        raise ValueError("등록한 WSL Hermes 폴더 안의 키 파일을 지정하세요.")
    return "\\\\wsl.localhost\\" + distro + str(source).replace("/", "\\")


def validate(config):
    if not isinstance(config, dict):
        raise ValueError("직원 연결 설정은 객체여야 합니다.")
    entries = config.get("workers", [])
    if not isinstance(entries, list) or len(entries) > 100:
        raise ValueError("직원 연결은 최대 100개입니다.")
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) - {"employeeId", "profile", "endpoint", "keyFile", "keyField", "enabled", "monitor"}:
            raise ValueError("직원 연결 설정 형식이 다릅니다.")
        if not all(isinstance(entry.get(k), str) and entry[k] for k in ("employeeId", "profile", "endpoint", "keyFile")):
            raise ValueError("직원·프로필·주소·키 파일을 지정하세요.")
        if type(entry.get("enabled", False)) is not bool or entry["employeeId"] in seen:
            raise ValueError("중복 직원 또는 잘못된 활성화 값입니다.")
        if "monitor" in entry and type(entry["monitor"]) is not bool:
            raise ValueError("연결 확인 설정은 참/거짓이어야 합니다.")
        seen.add(entry["employeeId"])
        endpoint(entry["endpoint"])
        if urlparse(entry["endpoint"]).hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("현재 PC 단계에서는 로컬 Hermes 주소만 지원합니다.")
    return entries


def reconcile_monitor(config, slots, launch):
    """Validate the full replacement before stopping anyone; monitor mode only."""
    desired = {e["employeeId"]:e for e in validate(config) if e.get("monitor", e.get("enabled", False))}
    for identity, slot in list(slots.items()):
        if desired.get(identity) != slot["entry"] or not slot["thread"].is_alive():
            slot["stop"].set()
            slot["thread"].join(25)
            if not slot["thread"].is_alive():
                del slots[identity]
    for identity, entry in desired.items():
        if identity not in slots:
            slots[identity] = launch(entry)


def run_entry(entry, stop, create, tick, on_error, retry_seconds=30):
    """A missing new employee key must not terminate other employees' loops."""
    worker = None
    try:
        while not stop.is_set():
            try:
                if worker is None:
                    worker = create(entry)
                tick(worker)
                stop.wait(2)
            except Exception:
                on_error(entry)
                stop.wait(retry_seconds)
    finally:
        if worker:
            worker.close()


def monitor_tick(worker):
    """Check API readiness only, even if the office queue is unpaused."""
    state = worker.request(worker.office, worker.office_key, "/api/state")
    employee = next((e for e in state["employees"] if e["id"] == worker.employee_id), None)
    if employee is None or time.monotonic() - worker.last_heartbeat < 15:
        return
    worker.last_heartbeat = time.monotonic()
    try:
        worker.probe(employee)
        worker.runtime_status(employee, "ready", "실행·조회·중지 연결 확인 완료 · 현재 연결 상태만 확인하며 업무 실행은 꺼져 있습니다.")
    except Exception:
        worker.runtime_status(employee, "error", "직원 실행 서버 연결·프로필을 확인하지 못했습니다.")


def run(config_path, data, execute=False, monitor=False):
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    entries = validate(config)
    if execute and monitor:
        raise ValueError("연결 확인과 업무 실행 모드는 함께 선택할 수 없습니다.")
    if not execute and not monitor:
        return {"configured": len(entries), "selected": sum(e.get("enabled", False) for e in entries), "execution": "disabled"}
    data = Path(data)
    data.mkdir(parents=True, exist_ok=True)
    lock = (data / "workers.lock").open("a+")
    if sys.platform == "win32":
        import msvcrt
        lock.seek(0)
        if not lock.read(1):
            lock.write("1"); lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    import os
    (data / "workers.pid").write_text(str(os.getpid()), encoding="utf-8")
    stop = threading.Event()
    slots = {}
    shared = {"state": None, "at": 0.0}
    shared_lock = threading.Lock()
    office_url = endpoint(config.get("office", "http://127.0.0.1:3010"))
    office_key = read_key(data / "connector.key")
    class PooledWorker(Worker):
        def request(self, base, key, path, body=None):
            if monitor and base == self.hermes and body is not None:
                raise ValueError("연결 확인 모드에서는 Hermes 작업 요청을 보낼 수 없습니다.")
            if base == self.office and path == "/api/state":
                with shared_lock:
                    if time.monotonic() - shared["at"] > 10 or shared["state"] is None:
                        raise ValueError("회사 실행 상태 연결이 오래되었습니다.")
                    return shared["state"]
            return super().request(base, key, path, body)
    def refresh_state():
        while not stop.is_set():
            try:
                request = urllib.request.Request(office_url + "/api/dispatch", headers={"Authorization": "Bearer " + office_key})
                with urllib.request.urlopen(request, timeout=5) as response:
                    state = json.load(response)
                with shared_lock:
                    shared.update(state=state, at=time.monotonic())
            except Exception:
                pass
            stop.wait(2)
    def report_entry_error(entry):
        try:
            import uuid
            with shared_lock:
                employee = next((e for e in (shared["state"] or {}).get("employees", []) if e["id"] == entry["employeeId"]), None)
            if employee:
                body = dict(type="runtime:status", eventId="connection-error:"+uuid.uuid4().hex, hostId=employee["hostId"], botId=employee["botId"],
                    at=datetime.now(timezone.utc).isoformat(), status="error", summary="이 직원의 연결 파일·주소를 확인해주세요. 다른 직원의 연결은 유지됩니다.")
                request = urllib.request.Request(office_url+"/api/ingest?compact=1", data=json.dumps(body).encode(), headers={"Authorization":"Bearer "+office_key,"Content-Type":"application/json"})
                with urllib.request.urlopen(request, timeout=5) as response:
                    response.read()
        except Exception:
            pass
    def create_worker(entry):
        return PooledWorker(office_url, office_key, entry["endpoint"],
            read_key(key_path(entry["keyFile"], data), entry.get("keyField", "")), entry["employeeId"],
            data / ("worker-" + hashlib.sha256(entry["employeeId"].encode()).hexdigest()[:20] + ".sqlite"), entry["profile"])
    def launch(entry):
        local_stop = threading.Event()
        thread = threading.Thread(target=run_entry, args=(entry, local_stop, create_worker, monitor_tick if monitor else lambda w:w.tick(), report_entry_error), daemon=True)
        thread.start()
        return dict(entry=dict(entry), stop=local_stop, thread=thread)
    try:
        threading.Thread(target=refresh_state, daemon=True).start()
        if monitor:
            reconcile_monitor(config, slots, launch)
        else:
            for entry in entries:
                if entry.get("enabled", False):
                    slots[entry["employeeId"]] = launch(entry)
        if not slots and not monitor:
            return {"configured": len(entries), "execution": "no-selected-workers"}
        print("직원 연결 상태 확인 시작 · 모델 업무 호출 없음" if monitor else "선택 직원의 실행 연결 시작 · 회사 일시정지와 실행 한도 적용", flush=True)
        while not stop.wait(3):
            if monitor:
                try:
                    updated = json.loads(Path(config_path).read_text(encoding="utf-8"))
                    validate(updated)
                    if endpoint(updated.get("office", "http://127.0.0.1:3010")) != office_url:
                        raise ValueError("회사 주소 변경은 연결 재시작이 필요합니다.")
                    reconcile_monitor(updated, slots, launch)
                except (OSError, ValueError):
                    pass  # Keep valid existing connections if a replacement is incomplete.
    finally:
        stop.set()
        for slot in slots.values():
            slot["stop"].set()
        for slot in slots.values():
            slot["thread"].join(25)
        lock.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--monitor", action="store_true", help="Readiness only; never submit, resume, or stop model work")
    args = parser.parse_args()
    try:
        result = run(args.config, args.data, args.execute, args.monitor)
        if result:
            print(json.dumps(result))
    except KeyboardInterrupt:
        pass
    except Exception:
        print("연결 설정을 확인하지 못했습니다. 실행이 활성화되지 않았거나 연결이 종료되었습니다.", file=sys.stderr)
        sys.exit(1)
