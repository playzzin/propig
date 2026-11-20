"""Verify a backup in an isolated directory and read-only loopback HTTP server."""
from __future__ import annotations
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import tempfile
import threading
from maintenance import database_summary, digest, normalized_state, readonly_office, restore_copy
from server import Handler, OfficeServer, Store, report


class ReadOnlyHandler(Handler):
    def do_POST(self):
        self.reply(405, {"error": "복원 확인 사본은 읽기 전용입니다."})


def file_hash(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def normalized_http_state(state):
    """Ignore only Store._project response fields, not persisted data checks."""
    value = normalized_state(state)
    value.pop("generatedAt", None)
    for employee in value["employees"]:
        employee.pop("observations", None)
    for task in value["tasks"]:
        task.pop("deliveryEvidence", None)
    return value


def verify_backup(backup_path):
    backup_path = Path(backup_path).resolve()
    before = file_hash(backup_path)
    expected = database_summary(backup_path)
    with readonly_office(backup_path) as (_, state):
        expected_export = hashlib.sha256(report(state).encode()).hexdigest()
        expected_http_state = digest(normalized_http_state(state))
    with tempfile.TemporaryDirectory(prefix="hermes-office-restore-check-") as temp:
        folder = Path(temp) / "restored"
        restored_path = restore_copy(backup_path, folder)
        if {p.name for p in folder.iterdir()} != {"office.sqlite"}:
            raise ValueError("복원 사본에 연결 파일이 포함됐습니다.")
        if database_summary(restored_path) != expected:
            raise ValueError("복원 사본의 업무와 장부가 백업과 다릅니다.")
        store = Store(restored_path)
        server, thread = None, None
        try:
            server = OfficeServer(("127.0.0.1", 0), store, folder)
            server.RequestHandlerClass = ReadOnlyHandler
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def get(path):
                client = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=10)
                try:
                    client.request("GET", path)
                    response = client.getresponse()
                    body = response.read()
                    if response.status != 200:
                        raise ValueError("복원 사본 HTTP 확인에 실패했습니다.")
                    return body
                finally:
                    client.close()
            health = json.loads(get("/api/health"))
            restored_state = json.loads(get("/api/state"))
            exported = get("/api/export")
            export_hash = hashlib.sha256(exported).hexdigest()
            if (health.get("ok") is not True or health.get("mode") != "local"
                    or restored_state["settings"].get("dispatchPaused") is not True
                    or restored_state["settings"].get("executionScope") is not None
                    or digest(normalized_http_state(restored_state)) != expected_http_state
                    or export_hash != expected_export):
                raise ValueError("복원 HTTP 상태·보고서·실행 차단 검증에 실패했습니다.")
        finally:
            if server:
                server.stop.set()
                if thread:
                    server.shutdown()
                server.server_close()
            if thread:
                thread.join(5)
            store.close()
        if database_summary(restored_path) != expected:
            raise ValueError("복원 확인 과정에서 업무 장부가 변경됐습니다.")
    after = file_hash(backup_path)
    if before != after:
        raise ValueError("원본 백업 파일이 변경됐습니다.")
    return dict(ok=True, backupUnchanged=True, backupSha256=after,
        isolatedCopy=True, executionPaused=True, connectionFilesCopied=False,
        http=dict(health=True, state=True, export=True, exportBytes=len(exported), exportSha256=export_hash),
        data=expected)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        # Do not overwrite a source, another report, or an operator-owned file.
        destination = Path(args.report)
        if destination.exists() or destination.is_symlink():
            raise ValueError("새 보고서 경로를 지정하세요.")
        result = verify_backup(args.backup)
        with destination.open("x", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, indent=2)
        print(json.dumps(dict(ok=True, backupUnchanged=True, executionPaused=True,
            employees=result["data"]["collections"]["employees"]["count"],
            tasks=result["data"]["collections"]["tasks"]["count"])))
    except Exception as error:
        print("복원 확인 실패: " + type(error).__name__ + ". 원문이나 연결 정보는 출력하지 않았습니다.")
        raise SystemExit(1)
