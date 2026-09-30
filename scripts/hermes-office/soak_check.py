"""Isolated HTTP growth/recovery soak. Synthetic employees; no model or Telegram calls."""
from datetime import datetime, timezone
from contextlib import closing
import argparse
import json
from pathlib import Path
import re
import sqlite3
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def run(duration, output):
    started = time.monotonic()
    timings, reads, growth = [], [], []
    sequence = 0
    process = None
    with tempfile.TemporaryDirectory(prefix="office-soak-") as folder:
        data = Path(folder)

        def start():
            child = subprocess.Popen([sys.executable, "-X", "utf8", "-B", str(ROOT / "scripts/hermes-office/server.py"), "--port", "0", "--data", str(data)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            line = child.stdout.readline()
            match = re.search(r"http://127\.0\.0\.1:\d+", line)
            if not match:
                child.terminate()
                child.wait(timeout=10)
                raise RuntimeError("Fixture startup failed")
            return child, match[0]

        def request(path, body=None):
            tick = time.monotonic()
            req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                headers={"Authorization": "Bearer " + key, "Origin": base, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.load(response)
            (reads if body is None else timings).append((time.monotonic()-tick)*1000)
            return result

        def event(kind, **fields):
            nonlocal sequence
            sequence += 1
            item = dict(type=kind, eventId=f"soak-{sequence}", hostId="isolated-fixture", at=datetime.now(timezone.utc).isoformat(), **fields)
            request("/api/ingest?compact=1", item)
            return item

        try:
            process, base = start()
            key = (data / "connector.key").read_text().strip()
            seats = {}
            for count in (8, 25, 50, 100):
                event("inventory", employees=[dict(botId=str(i+1), name=f"합성 검증 직원 {i+1}", profile=f"fixture-{i+1}") for i in range(count)])
                state = request("/api/state")
                current = {e["botId"]:(e["id"], e["seat"]) for e in state["employees"]}
                assert len(current) == count and len({s[1] for s in current.values()}) == count
                assert all(current[k] == v for k,v in seats.items())
                seats = current
                growth.append(count)
            for i in range(100):
                event("agent:start", botId=str(i+1), runId=f"fixture-run-{i}", title="합성 지속 시험", telemetrySource="hook")
            work_started = time.monotonic()
            restarted, cycles = False, 0
            while time.monotonic() - work_started < duration:
                cycle_started = time.monotonic()
                for i in range(100):
                    event("agent:step", botId=str(i+1), runId=f"fixture-run-{i}", summary="합성 이벤트 연결 유지", telemetrySource="hook")
                state = request("/api/state")
                assert len(state["tasks"]) == 100 and all(t["status"] == "running" for t in state["tasks"])
                assert {e["botId"]:(e["id"], e["seat"]) for e in state["employees"]} == seats
                if not restarted and time.monotonic()-work_started >= duration/2:
                    before = {t["id"]:(t["runId"],t["revision"]) for t in state["tasks"]}
                    process.terminate()
                    process.wait(timeout=10)
                    process.stdout.close()
                    process, base = start()
                    state = request("/api/state")
                    assert before == {t["id"]:(t["runId"],t["revision"]) for t in state["tasks"]}
                    restarted = True
                cycles += 1
                time.sleep(max(0, min(10-(time.monotonic()-cycle_started), duration-(time.monotonic()-work_started))))
            last = None
            for i in range(100):
                last = event("agent:end", botId=str(i+1), runId=f"fixture-run-{i}", result="합성 시험 결과", telemetrySource="hook")
            final = request("/api/state")
            assert len(final["tasks"]) == 100 and all(t["status"] == "review" and len(t["resultVersions"]) == 1 for t in final["tasks"])
            request("/api/ingest?compact=1", last)
            repeated = request("/api/state")
            assert [(t["id"],t["revision"]) for t in repeated["tasks"]] == [(t["id"],t["revision"]) for t in final["tasks"]]
            with closing(sqlite3.connect(data / "office.sqlite")) as database:
                assert database.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            result = dict(mode="synthetic-isolated-http", paidCalls=0, growth=growth, employees=100, completedRuns=100,
                events=sequence, cycles=cycles, durationSeconds=round(time.monotonic()-started,2), processRestartPreservedRecords=restarted,
                duplicateSuppressed=True, integrity="ok", writeP95Ms=round(sorted(timings)[int(len(timings)*.95)],2),
                readP95Ms=round(sorted(reads)[int(len(reads)*.95)],2), writeMedianMs=round(statistics.median(timings),2))
            Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
            return result
        finally:
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)
                process.stdout.close()


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=int, default=180)
    parser.add_argument("--output", default="output/hermes-office/soak-verification.json")
    args=parser.parse_args()
    if not 20 <= args.duration <= 1800:
        parser.error("duration must be 20..1800 seconds")
    print(json.dumps(run(args.duration,args.output),ensure_ascii=False))
