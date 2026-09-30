"""Loopback-only office service. No cloud deployment and no provider calls."""
from __future__ import annotations
import argparse
import hashlib
import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src/lib/server/hermes-office"))
from store import Store, ValidationError, ConflictError
from roster_refresh import refresh as refresh_roster, monitor as monitor_roster


def report(state):
    names = {e["id"]: e["name"] for e in state["employees"]}
    labels = dict(queued="실행 대기", running="진행 중", blocked="도움 필요", review="검토 대기",
                  approval="승인 대기", completed="완료", failed="실패", cancelled="취소", cancel_requested="중지 요청")
    lines = ["# " + state["settings"]["companyName"] + " 업무 보고", "", "## 직원", ""]
    for employee in state["employees"]:
        lines.append("- " + employee["name"] + " · " + employee["title"] + " · " + employee["profile"])
    for task in state["tasks"]:
        lines += ["", "## " + task["title"], "", "- 담당: " + names.get(task["employeeId"], "미배정"),
                  "- 상태: " + ("답변 대기" if task["status"] == "running" and task.get("activity") == "input_wait" else labels.get(task["status"], task["status"])), "- 요청: " + task["request"],
                  "- 완료 조건: " + task["criteria"], "- 진행 내용: " + task["summary"],
                  "- 결과물: " + task["result"], "- 다음 행동: " + task["nextAction"]]
        lines += ["- 재작업 횟수: " + str(task.get("reworkCount", 0)), "- 품질 평가: " + str(task.get("qualityScore") if task.get("qualityScore") is not None else "미평가"), "- 검토 의견: " + task.get("reviewNote", "")]
        usage = task.get("usage", {})
        lines.append("- 수집된 실행 비용(USD): " + (str(usage["costUsd"]) if usage.get("costUsd") is not None else "미수집"))
        for version in task.get("resultVersions", []):
            lines += ["", "### 보존된 결과 · 시도 " + str(version["attempt"]), version["result"]]
    lines += ["", "## 협업과 회의", ""]
    for workflow in state.get("workflows", []):
        lines += ["### " + workflow["name"], "목표: " + workflow["goal"], "상태: " + {"draft":"계획 검토 중", "active":"진행 중", "completed":"완료", "cancelled":"취소"}.get(workflow["status"], workflow["status"])]
        for step in workflow["steps"]:
            lines.append("- " + step["title"] + " · " + names.get(step["employeeId"], "미배정") + " · 완료 조건: " + step["criteria"])
    lines += ["", "## 교육 적용 이력", ""]
    for item in state.get("training", []):
        lines += ["### " + names.get(item["employeeId"], "직원") + " · 교육 버전 " + str(item["version"]), "상태: " + ("적용 중" if item["status"] == "active" else "적용 철회"), item["content"], "검증 근거: " + item["evidence"]]
    lines += ["", "## 회사 기록", ""]
    for item in state["records"]:
        lines += ["### " + item["title"], item["content"], "근거: " + item["evidence"], ""]
    return "\n".join(lines)


class OfficeServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, store, data):
        super().__init__(address, Handler)
        self.store, self.data = store, data
        self.stop = threading.Event()
        self.stream_slots = threading.BoundedSemaphore(16)
        self.discover_lock = threading.Lock()
        self.last_discovery = time.monotonic()
        self.discovery_status = {}
        keyfile = data / "connector.key"
        if not keyfile.exists():
            keyfile.write_text(secrets.token_urlsafe(40), encoding="utf-8")
            keyfile.chmod(0o600)
        self.connector_key = keyfile.read_text(encoding="utf-8").strip()


class Handler(BaseHTTPRequestHandler):
    server: OfficeServer
    def log_message(self, *_):
        pass  # Never log requests, credentials, or user text.

    def trusted_host(self):
        return self.headers.get("Host", "") in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}

    def headers_out(self, code, kind, length=None):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def reply(self, code, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.headers_out(code, "application/json; charset=utf-8", len(payload))
        self.wfile.write(payload)

    def do_GET(self):
        if not self.trusted_host():
            return self.reply(403, {"error": "로컬 사무실 주소로 접속하세요."})
        path = urlparse(self.path).path
        if path == "/api/dispatch":
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.connector_key):
                return self.reply(401, {"error": "실행 연결 인증이 필요합니다."})
            state = self.server.store.snapshot()
            active = [t for t in state["tasks"] if t["status"] in ("queued", "blocked", "running", "cancel_requested")]
            ids = {t["id"] for t in active} | {d for t in active for d in t["dependencies"]}
            return self.reply(200, dict(settings=state["settings"], employees=[{k:e[k] for k in ("id", "botId", "hostId", "profile", "status")} for e in state["employees"]],
                tasks=[{k:v for k,v in t.items() if k != "resultVersions"} for t in state["tasks"] if t["id"] in ids], training=[t for t in state["training"] if t["status"] == "active"]))
        if path == "/api/state":
            return self.reply(200, self.server.store.snapshot())
        if path == "/api/health":
            return self.reply(200, {"ok": True, "mode": "local", "execution": "opt-in-worker", "version": 2, "discovery": self.server.discovery_status})
        if path == "/api/history":
            try:
                query = parse_qs(urlparse(self.path).query, keep_blank_values=True, strict_parsing=True, max_num_fields=3)
                if set(query) - {"taskId", "cursor", "offset"} or any(len(values) != 1 for values in query.values()):
                    raise ValidationError("이력 조회 인수를 확인하세요.")
                if "taskId" in query:
                    if "offset" in query:
                        raise ValidationError("업무 이력 커서와 offset은 함께 사용할 수 없습니다.")
                    page = self.server.store.history_page(query["taskId"][0], query["cursor"][0] if "cursor" in query else None)
                    return self.reply(200, page)
                if "cursor" in query:
                    raise ValidationError("커서 조회에는 업무 ID가 필요합니다.")
                offset = query.get("offset", ["0"])[0]
                if not re.fullmatch(r"[0-9]{1,16}", offset) or int(offset) > Store.HISTORY_MAX_INTEGER:
                    raise ValidationError("기록 페이지 번호를 확인하세요.")
                return self.reply(200, {"events": self.server.store.history(100, int(offset))})
            except (ValidationError, ValueError) as error:
                return self.reply(400, {"error": str(error) if isinstance(error, ValidationError) else "이력 조회 형식을 확인하세요."})
            except Exception:
                return self.reply(500, {"error": "이력을 조회하지 못했습니다. 다시 시도하세요."})
        if path == "/api/export":
            payload = report(self.server.store.snapshot()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/markdown; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="office-report.md"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            return self.wfile.write(payload)
        if path == "/api/stream":
            if not self.server.stream_slots.acquire(blocking=False):
                return self.reply(429, {"error": "연결 수가 많습니다. 잠시 후 다시 연결합니다."})
            try:
                self.headers_out(200, "text/event-stream; charset=utf-8")
                previous = -1
                while not self.server.stop.wait(1):
                    revision = self.server.store.snapshot()["revision"]
                    event = f"event: revision\ndata: {revision}\n\n" if revision != previous else ": heartbeat\n\n"
                    self.wfile.write(event.encode())
                    self.wfile.flush()
                    previous = revision
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                self.server.stream_slots.release()
            return
        if path.startswith("/avatars/"):
            name = path.removeprefix("/avatars/")
            if not name.endswith(".jpg") or not name[:-4].isdigit():
                return self.reply(404, {"error": "사진을 찾을 수 없습니다."})
            target, kind = self.server.data / "avatars" / name, "image/jpeg"
        else:
            files = {"/": ("index.html", "text/html; charset=utf-8"),
                     "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                     "/app.css": ("app.css", "text/css; charset=utf-8")}
            if path not in files:
                return self.reply(404, {"error": "페이지를 찾을 수 없습니다."})
            name, kind = files[path]
            target = ROOT / "output/hermes-office-web" / name
        if not target.is_file() or target.is_symlink():
            return self.reply(404, {"error": "화면 파일이 없습니다. 먼저 화면 빌드를 실행하세요."})
        payload = target.read_bytes()
        self.headers_out(200, kind, len(payload))
        self.wfile.write(payload)

    def do_POST(self):
        if not self.trusted_host():
            return self.reply(403, {"error": "로컬 주소만 허용됩니다."})
        path = urlparse(self.path).path
        if path == "/api/ingest":
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.connector_key):
                return self.reply(401, {"error": "연결 인증이 필요합니다."})
        elif self.headers.get("Origin") not in {f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"}:
            return self.reply(403, {"error": "사무실 화면에서 요청하세요."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4_000_000:
                return self.reply(413, {"error": "요청 크기가 허용 범위를 벗어났습니다."})
            if self.headers.get_content_type() != "application/json":
                return self.reply(415, {"error": "JSON 요청만 지원합니다."})
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValidationError("요청 형식을 확인하세요.")
            if path == "/api/action":
                return self.reply(200, self.server.store.action(body))
            if path == "/api/ingest":
                state = self.server.store.ingest(body)
                compact = parse_qs(urlparse(self.path).query).get("compact") == ["1"]
                return self.reply(200, {"ok": True, "revision": state["revision"]} if compact else state)
            if path == "/api/discover":
                return self.discover()
            return self.reply(404, {"error": "지원하지 않는 요청입니다."})
        except ConflictError as error:
            self.reply(409, {"error": str(error)})
        except (ValidationError, ValueError, TypeError) as error:
            self.reply(400, {"error": str(error) if isinstance(error, ValidationError) else "입력 형식을 확인하세요."})
        except Exception:
            self.reply(500, {"error": "저장하지 못했습니다. 상태를 새로고침한 뒤 다시 시도하세요."})

    def discover(self):
        return self.reply(200, refresh_roster(self.server))


def consume(server):
    seen_inventory = ""
    spool = server.data / "inbox"
    spool.mkdir(exist_ok=True)
    rejected = server.data / "rejected"
    rejected.mkdir(exist_ok=True)
    while not server.stop.wait(1):
        inventory_path = server.data / "inventory.json"
        try:
            if inventory_path.is_file():
                raw = inventory_path.read_bytes()
                digest = hashlib.sha256(raw).hexdigest()
                if digest != seen_inventory:
                    server.store.ingest(json.loads(raw))
                    seen_inventory = digest
        except (ValueError, OSError, ValidationError, ConflictError):
            pass
        pending = []
        for path in sorted(spool.glob("*.json"))[:1000]:
            try:
                if path.is_symlink() or path.stat().st_size > 4_000_000:
                    continue
                value = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(value, dict):
                    raise ValueError("event")
                pending.append((str(value.get("at", "")), path, value))
            except (ValueError, OSError):
                if path.exists():
                    path.replace(rejected / path.name)
        for _, path, value in sorted(pending, key=lambda item: item[0]):
            try:
                server.store.ingest(value)
                path.unlink()  # Only acknowledged transport copies in this app's inbox.
            except (ValueError, ValidationError, ConflictError):
                path.replace(rejected / path.name)
            except OSError:
                continue


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=3010)
    parser.add_argument("--data", default=str(ROOT / "output/hermes-office"))
    args = parser.parse_args()
    data = Path(args.data).resolve()
    data.mkdir(parents=True, exist_ok=True)
    server = OfficeServer(("127.0.0.1", args.port), Store(data / "office.sqlite"), data)
    (data / "server.pid").write_text(str(os.getpid()), encoding="utf-8")
    threading.Thread(target=consume, args=(server,), daemon=True).start()
    threading.Thread(target=monitor_roster, args=(server,), daemon=True).start()
    print(f"Hermes AI Office: http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
