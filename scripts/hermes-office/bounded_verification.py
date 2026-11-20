"""Explicit, finite live verification. No background dispatcher is enabled."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.request
from urllib.parse import quote
from worker import Worker, read_key, usage_for
from runtime_pool import key_path


def office(path, body=None):
    base = "http://127.0.0.1:3010"
    request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "Origin": base})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def action(action_type, **fields):
    return office("/api/action", dict(type=action_type, **fields))


def save(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


class BoundedWorker(Worker):
    def configure(self, allowed, ledger, ledger_path, maximum, deadline):
        self.allowed, self.ledger, self.ledger_path = set(allowed), ledger, ledger_path
        self.maximum, self.deadline = maximum, deadline

    def request(self, base, key, path, body=None):
        if base == self.hermes and path == "/v1/runs" and body is not None:
            if time.time() >= self.deadline or len(self.ledger["submitted"]) >= self.maximum:
                raise ValueError("승인된 검증 횟수·시간 한도에 도달했습니다.")
            if self.submission_key in self.ledger["submitted"]:
                raise ValueError("동일 실행의 재전송을 차단했습니다.")
            # Durable before the paid boundary. Even ambiguous transport consumes a slot.
            self.ledger["submitted"].append(self.submission_key)
            save(self.ledger_path, self.ledger)
        try:
            result = super().request(base, key, path, body)
        except Exception:
            if base == self.hermes and path == "/v1/runs" and body is not None:
                self.ledger.setdefault("ambiguousSubmissions", []).append(self.submission_key)
                save(self.ledger_path, self.ledger)
            raise
        if base == self.hermes and body is None and path.startswith("/v1/runs/") and result.get("status") == "completed" and isinstance(result.get("output"), str) and result["output"].strip():
            self.ledger.setdefault("completedRuns", {})[path.removeprefix("/v1/runs/")] = hashlib.sha256(result["output"].encode()).hexdigest()
            save(self.ledger_path, self.ledger)
        if base == self.office and path == "/api/state":
            result["tasks"] = [t for t in result["tasks"] if t["id"] in self.allowed]
        return result


def cleanup(workers, ids, previous, ledger, ledger_path):
    try:
        action("settings.update", dispatchPaused=True, executionScope=None, **previous)
    except Exception:
        ledger["officeRestorePending"] = True
    try:
        current = [t for t in office("/api/state")["tasks"] if t["id"] in ids]
        for task in current:
            if task["status"] in ("running", "queued", "blocked"):
                try:
                    action("task.update", id=task["id"], revision=task["revision"], status="cancel_requested" if task["status"] == "running" else "cancelled")
                except Exception:
                    ledger["officeRestorePending"] = True
    except Exception:
        ledger["officeRestorePending"] = True
    for worker in workers:
        try:
            rows = worker.db.execute("SELECT * FROM jobs WHERE state!='finished'").fetchall()
            for row in rows:
                if row[0] not in ids:
                    continue
                if not row[2]:
                    ledger["stopConfirmationPending"] = True
                    continue
                path = "/v1/runs/" + quote(row[2], safe="")
                try:
                    # The stop uses this runner's own remote id, even if Office is down.
                    worker.request(worker.hermes, worker.hermes_key, path + "/stop", {})
                    deadline = time.monotonic() + 20
                    confirmed = False
                    while time.monotonic() < deadline:
                        result = worker.request(worker.hermes, worker.hermes_key, path)
                        if result.get("status") in ("completed", "cancelled", "failed"):
                            kind = {"completed":"agent:end", "cancelled":"agent:cancelled", "failed":"agent:error"}[result["status"]]
                            worker.finish(row, kind, result=result.get("output", "") if isinstance(result.get("output"), str) else "", usage=usage_for(result.get("usage")), summary="검증 정리 단계에서 실제 종료를 확인했습니다.")
                            confirmed = True
                            break
                        time.sleep(1)
                    if not confirmed:
                        ledger["stopConfirmationPending"] = True
                except Exception:
                    ledger["stopConfirmationPending"] = True
            try:
                worker.flush()
            except Exception:
                ledger["officeRestorePending"] = True
        except Exception:
            ledger["stopConfirmationPending"] = True
        finally:
            worker.close()
    save(ledger_path, ledger)


def execute(data, plan_path, execute_plan=False):
    data, plan_path = Path(data).resolve(), Path(plan_path).resolve()
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    ids = plan["taskIds"]
    if not isinstance(ids, list) or not 1 <= len(ids) <= 7 or len(set(ids)) != len(ids) or any(not isinstance(i, str) for i in ids):
        raise ValueError("검증은 중복 없는 실제 업무 1~7개로 제한합니다.")
    if not execute_plan:
        return dict(tasks=len(ids), mode="review-only", paidCalls=0)
    ledger_path = data / ("verification-" + hashlib.sha256(str(plan_path).encode()).hexdigest()[:16] + ".json")
    if ledger_path.exists():
        raise ValueError("이 검증 계획에는 이미 실행 기록이 있습니다. 자동 재실행하지 않습니다.")
    state = office("/api/state")
    tasks = {t["id"]: t for t in state["tasks"]}
    if not state["settings"]["dispatchPaused"] or state["settings"].get("executionScope"):
        raise ValueError("검증 전 회사의 실행 일시정지가 필요합니다.")
    if any(i not in tasks or tasks[i]["source"] != "office" or tasks[i]["status"] not in ("queued", "blocked") or tasks[i]["attempts"] != 0 for i in ids):
        raise ValueError("검토한 미실행 Office 업무만 허용됩니다.")
    if any(d not in ids for i in ids for d in tasks[i]["dependencies"]):
        raise ValueError("검증 계획에 모든 선행 업무를 포함하세요.")
    selected = {tasks[i]["employeeId"] for i in ids}
    config = json.loads((data / "workers.json").read_text(encoding="utf-8"))
    entries = {e["employeeId"]:e for e in config["workers"] if e.get("enabled")}
    if not selected <= entries.keys():
        raise ValueError("검증 직원의 연결을 먼저 확인하세요.")
    previous = {k:state["settings"][k] for k in ("maxConcurrent", "taskTimeoutMinutes")}
    deadline = time.time() + 900
    ledger = dict(taskIds=ids, maxSubmissions=len(ids), deadline=deadline, submitted=[], state="prepared")
    save(ledger_path, ledger)
    workers, last = [], {}
    try:
        for identity in selected:
            e = entries[identity]
            worker = BoundedWorker("http://127.0.0.1:3010", read_key(data / "connector.key"), e["endpoint"], read_key(key_path(e["keyFile"], data), e.get("keyField", "")), identity, data / ("check-" + hashlib.sha256((str(plan_path)+identity).encode()).hexdigest()[:20] + ".sqlite"), e["profile"])
            worker.configure(ids, ledger, ledger_path, len(ids), deadline)
            workers.append(worker)
        action("settings.update", dispatchPaused=False, maxConcurrent=2, taskTimeoutMinutes=3,
            executionScope=dict(taskIds=ids, expiresAt=datetime.fromtimestamp(deadline, timezone.utc).isoformat()))
        while time.time() < deadline:
            for worker in workers:
                worker.tick()
            if ledger.get("ambiguousSubmissions"):
                raise ValueError("실행 접수 여부가 불명확합니다. 재전송 없이 확인이 필요합니다.")
            current = {t["id"]:t for t in office("/api/state")["tasks"] if t["id"] in ids}
            if set(current) != set(ids):
                raise ValueError("검증 업무 상태가 누락됐습니다.")
            statuses = {i:t["status"] for i,t in current.items()}
            if statuses != last:
                print(json.dumps(dict(statuses=list(statuses.values()), submitted=len(ledger["submitted"])), ensure_ascii=False), flush=True)
                last = statuses
            if any(s in ("failed", "cancelled") for s in statuses.values()):
                raise ValueError("검증 업무 종료 상태를 확인해야 합니다. 추가 자동 재시도는 하지 않습니다.")
            if all(s in ("review", "approval", "completed") for s in statuses.values()):
                remote_by_task = {task:remote for worker in workers for task,remote in worker.db.execute("SELECT task,remote FROM jobs")}
                if any(not t["result"].strip() or t["attempts"] != 1 or remote_by_task.get(t["id"]) not in ledger.get("completedRuns", {}) for t in current.values()):
                    raise ValueError("실제 원격 실행 완료와 결과를 확인하지 못했습니다.")
                ledger.update(state="results-ready", results=[dict(taskId=t["id"], status=t["status"], attempts=t["attempts"], resultHash=hashlib.sha256(t["result"].encode()).hexdigest(), usage=t["usage"]) for t in current.values()])
                save(ledger_path, ledger)
                return dict(tasks=len(ids), submitted=len(ledger["submitted"]), state=ledger["state"])
            time.sleep(2)
        raise TimeoutError("검증 제한 시간에 도달했습니다.")
    finally:
        cleanup(workers, ids, previous, ledger, ledger_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="output/hermes-office")
    parser.add_argument("--plan", required=True)
    parser.add_argument("--execute-plan", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(execute(args.data, args.plan, args.execute_plan), ensure_ascii=False))
    except Exception as error:
        print("검증 실행 종료: " + type(error).__name__ + ". 저장된 실행 기록과 업무 상태를 확인하세요.")
        raise SystemExit(1)
