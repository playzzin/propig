"""Independent HTTP/observer checks. Only temporary synthetic fixtures are used."""
import http.client
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from server import OfficeServer, Store
from observe import Observer
import discover
from worker import Worker, endpoint


def inventory():
    return dict(type="inventory", eventId="fixture-inventory", hostId="fixture",
                at="2026-09-16T00:00:00Z", employees=[dict(botId="123456", name="테스트 직원", profile="default")])


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)
        self.store = Store(self.data / "office.sqlite")
        self.server = OfficeServer(("127.0.0.1", 0), self.store, self.data)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = "http://127.0.0.1:" + str(self.server.server_port)

    def tearDown(self):
        self.server.stop.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(3)
        self.store.close()
        self.temp.cleanup()

    def request(self, method="GET", path="/api/state", body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def post(self, value, path="/api/action", **headers):
        return self.request("POST", path, json.dumps(value), {"Content-Type": "application/json", "Origin": self.origin, **headers})

    def ingest(self, value):
        return self.post(value, "/api/ingest", Authorization="Bearer " + self.server.connector_key)

    def test_host_and_csrf_boundaries(self):
        self.assertEqual(self.request(headers={"Host": "attacker.example"})[0], 403)
        self.assertEqual(self.post({"type": "settings.update", "companyName": "x"}, Origin="https://attacker.example")[0], 403)
        self.assertEqual(self.request("POST", "/api/action", "{}", {"Content-Type": "application/json"})[0], 403)
        self.assertEqual(self.store.snapshot()["revision"], 0)

    def test_bearer_ingest_and_dedup(self):
        self.assertEqual(self.post(inventory(), "/api/ingest")[0], 401)
        self.assertEqual(self.ingest(inventory())[0], 200)
        revision = self.store.snapshot()["revision"]
        self.assertEqual(self.ingest(inventory())[0], 200)
        self.assertEqual(self.store.snapshot()["revision"], revision)
        self.assertEqual(len(self.store.snapshot()["employees"]), 1)

    def test_content_type_size_and_invalid_json(self):
        self.assertEqual(self.request("POST", "/api/action", "{}", {"Origin": self.origin, "Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("POST", "/api/action", "", {"Origin": self.origin, "Content-Type": "application/json", "Content-Length": "4000001"})[0], 413)
        self.assertEqual(self.request("POST", "/api/action", "{", {"Origin": self.origin, "Content-Type": "application/json"})[0], 400)
        self.assertEqual(self.post([])[0], 400)

    def test_invalid_entity_rollback(self):
        self.assertEqual(self.post(dict(type="employee.update", id="missing", name="invalid"))[0], 400)
        self.assertEqual(self.store.snapshot()["revision"], 0)

    def test_export_and_traversal(self):
        self.ingest(inventory())
        status, headers, body = self.request(path="/api/export")
        self.assertEqual(status, 200)
        self.assertIn("text/markdown", headers["Content-Type"])
        self.assertIn("테스트 직원", body.decode())
        for path in ("/../connector.key", "/avatars/../connector.key", "/avatars/%2e%2e/connector.key", "/connector.key"):
            status, _, body = self.request(path=path)
            self.assertEqual(status, 404)
            self.assertNotIn(self.server.connector_key.encode(), body)

    def test_late_event_cannot_reopen_ended_run(self):
        self.ingest(inventory())
        base = dict(hostId="fixture", botId="123456", runId="run", title="fixture")
        self.assertEqual(self.ingest(dict(base, type="agent:end", eventId="end", at="2026-09-16T00:02:00Z", result="완료 초안"))[0], 200)
        self.assertEqual(self.ingest(dict(base, type="agent:start", eventId="late", at="2026-09-16T00:01:00Z"))[0], 200)
        task = self.store.snapshot()["tasks"][0]
        self.assertEqual(task["status"], "review")
        self.assertEqual(task["result"], "완료 초안")

    def test_dispatch_requires_key_and_excludes_employee_instructions(self):
        self.ingest(inventory())
        self.assertEqual(self.request(path="/api/dispatch")[0], 401)
        status, _, body = self.request(path="/api/dispatch", headers={"Authorization": "Bearer " + self.server.connector_key})
        self.assertEqual(status, 200)
        state = json.loads(body)
        self.assertNotIn("instructions", state["employees"][0])
        self.assertNotIn("capabilities", state["employees"][0])
        self.assertIn("dispatchPaused", state["settings"])

    def test_compact_ingest_ack_avoids_full_roster_response(self):
        status, _, body = self.post(inventory(), "/api/ingest?compact=1", Authorization="Bearer " + self.server.connector_key)
        self.assertEqual(status, 200)
        self.assertEqual(set(json.loads(body)), {"ok", "revision"})


class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home, self.data = self.root / "home", self.root / "data"
        self.home.mkdir()
        self.inventory_path = self.root / "inventory.json"
        self.inventory_path.write_text(json.dumps(inventory()), encoding="utf-8")
        self.source = sqlite3.connect(self.home / "state.db")
        self.source.executescript("CREATE TABLE sessions(id TEXT PRIMARY KEY, source TEXT, profile_name TEXT); CREATE TABLE messages(id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL, finish_reason TEXT, active INTEGER);")
        self.source.executemany("INSERT INTO sessions VALUES (?,?,?)", [("telegram", "telegram", "default"), ("cli", "cli", "default")])
        self.source.commit()
        self.observer = Observer(self.home, self.inventory_path, self.data)

    def tearDown(self):
        self.observer.db.close()
        self.source.close()
        self.temp.cleanup()

    def add(self, number, role="user", content="새 테스트 업무", session="telegram", calls=None, tool=None):
        self.source.execute("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,1)", (number, session, role, content, calls, tool, 1789516800 + number, "stop"))
        self.source.commit()

    def events(self):
        return [json.loads(p.read_text(encoding="utf-8")) for p in (self.data / "inbox").glob("*.json")]

    def activity(self):
        return [e for e in self.events() if e["type"] != "heartbeat"]

    def test_baseline_does_not_import_history(self):
        self.add(1, content="과거 기록")
        self.add(2, role="assistant", content="과거 응답")
        self.observer.tick()
        self.assertEqual(self.activity(), [])

    def test_new_user_tool_assistant_restart_dedup(self):
        self.observer.tick()
        self.add(1)
        self.add(2, "tool", "synthetic tool output", tool="search")
        self.add(3, "assistant", "초안 결과")
        self.observer.tick()
        self.assertEqual({e["type"] for e in self.activity()}, {"agent:start", "agent:step", "agent:end"})
        self.assertEqual(len({e["runId"] for e in self.activity()}), 1)
        self.observer.db.close()
        self.observer = Observer(self.home, self.inventory_path, self.data)
        self.observer.tick()
        self.assertEqual(len(self.activity()), 3)

    def test_nontelegram_not_imported_and_later_telegram_seen(self):
        self.observer.tick()
        self.add(1, content="cli private fixture", session="cli")
        self.observer.tick()
        self.assertEqual(self.activity(), [])
        self.add(2)
        self.observer.tick()
        self.assertEqual(len(self.activity()), 1)
        self.assertNotIn("cli private", json.dumps(self.events()))

    def test_durable_outbox_recovers_after_write_failure(self):
        self.observer.tick()
        self.add(1)
        with patch.object(self.observer, "flush", side_effect=OSError("fixture disk unavailable")):
            with self.assertRaises(OSError):
                self.observer.tick()
        self.observer.db.close()
        self.observer = Observer(self.home, self.inventory_path, self.data)
        self.observer.tick()
        self.assertEqual(len(self.activity()), 1)
        self.assertEqual(self.observer.db.execute("SELECT count(*) FROM outbox").fetchone()[0], 0)

    def test_unknown_profile_must_not_be_attributed_to_default_employee(self):
        self.observer.tick()
        self.source.execute("INSERT INTO sessions VALUES ('unknown','telegram','unregistered-profile')")
        self.source.commit()
        self.add(1, session="unknown")
        self.observer.tick()
        self.assertEqual(self.activity(), [], "Unknown profile activity must not be assigned to an unrelated employee")

    def test_hook_clarification_wait_resume_and_restart_do_not_copy_private_text(self):
        self.source.row_factory = sqlite3.Row
        mapping={"default":inventory()["employees"][0]}
        active=[("default","telegram","hook-live")]
        self.add(1,"assistant","private question",calls=json.dumps([{"function":{"name":"clarify","arguments":"private arguments"}}]))
        self.observer.observe_input_wait(self.source,active,mapping,"fixture")
        self.observer.flush()
        self.assertEqual(len(self.activity()),1)
        self.assertEqual(self.activity()[0]["stage"],"input_wait")
        self.assertTrue(self.activity()[0]["existingRunOnly"])
        self.assertNotIn("private",json.dumps(self.activity()))
        self.observer.db.close()
        self.observer=Observer(self.home,self.inventory_path,self.data)
        self.observer.observe_input_wait(self.source,active,mapping,"fixture")
        self.observer.flush()
        self.assertEqual(len(self.activity()),1)
        self.add(2,"tool","private answer",tool="clarify")
        self.observer.observe_input_wait(self.source,active,mapping,"fixture")
        self.observer.flush()
        self.assertEqual({e["stage"] for e in self.activity()},{"input_wait","processing"})
        self.assertEqual({e["runId"] for e in self.activity()},{"hook-live"})
        self.assertNotIn("private",json.dumps(self.activity()))


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / "worker.sqlite"
        self.worker = Worker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:9999", "fixture", "employee", self.database)
        self.calls = []
        self.state = dict(settings=dict(dispatchPaused=False, taskTimeoutMinutes=20), employees=[dict(id="employee", botId="123456", hostId="fixture", status="active")], tasks=[
            dict(id="dependency", employeeId="other", source="office", status="completed", dependencies=[], title="조사", result="검증된 조사 결과"),
            dict(id="task", employeeId="employee", source="office", status="queued", dependencies=["dependency"], request="기획안 작성", criteria="조사 반영")])
        self.remote_status = "running"

    def tearDown(self):
        self.worker.db.close()
        self.temp.cleanup()

    def request(self, base, key, path, body=None):
        self.calls.append((base, path, body))
        if path == "/api/state":
            return self.state
        if path == "/api/ingest" and body.get("type", "").startswith("agent:"):
            task = self.state["tasks"][1]
            kind = body["type"]
            task["status"] = {"agent:start":"running", "agent:end":"review" if body.get("result") else "blocked", "agent:cancelled":"cancelled", "agent:error":"failed"}.get(kind, task["status"])
            task["runId"] = body["runId"]
            return self.state
        if path == "/v1/runs":
            return dict(run_id="fixture-run")
        if path == "/v1/runs/fixture-run":
            return dict(status=self.remote_status, output="fixture output")
        return {}

    def test_cli_requires_execute_before_loading_keys(self):
        result = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("worker.py")), "--office-key", "missing", "--hermes", "http://127.0.0.1:9999", "--hermes-key", "missing", "--employee", "fixture", "--profile", "default", "--database", str(self.database)], capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"--execute", result.stderr)

    def test_endpoint_rejects_remote_plaintext_and_credentials(self):
        for value in ("http://example.com", "https://name:password@example.com", "https://example.com?key=fixture", "file:///tmp/test"):
            with self.assertRaises(ValueError):
                endpoint(value)
        self.assertEqual(endpoint("http://localhost:9999/"), "http://localhost:9999")

    def test_dependency_prompt_and_restart_do_not_duplicate_launch(self):
        with patch.object(self.worker, "request", side_effect=self.request):
            self.worker.tick()
        launch = [c for c in self.calls if c[1] == "/v1/runs"]
        self.assertEqual(len(launch), 1)
        self.assertIn("검증된 조사 결과", launch[0][2]["input"])
        self.worker.db.close()
        self.worker = Worker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:9999", "fixture", "employee", self.database)
        with patch.object(self.worker, "request", side_effect=self.request):
            self.worker.tick()
        self.assertEqual(len([c for c in self.calls if c[1] == "/v1/runs"]), 1)

    def test_only_verified_scoped_knowledge_is_handed_to_worker(self):
        self.state["records"] = [dict(kind="knowledge",status="verified",employeeId="employee",title="보고 기준",content="출처를 표시",evidence="검토 통과"),dict(kind="knowledge",status="candidate",employeeId="",title="미검증",content="아직 적용 금지",evidence=""),dict(kind="education",status="verified",employeeId="other",title="다른 직원",content="비공유 교육",evidence="확인")]
        self.state["training"] = [dict(status="active",employeeId="employee",content="출처를 표시",evidence="검토 통과",version=1),dict(status="rolled_back",employeeId="employee",content="철회 교육",evidence="이전 근거",version=2),dict(status="active",employeeId="other",content="비공유 교육",evidence="근거",version=1)]
        with patch.object(self.worker,"request",side_effect=self.request):
            self.worker.tick()
        prompt = next(c[2]["input"] for c in self.calls if c[1] == "/v1/runs")
        self.assertIn("출처를 표시",prompt)
        self.assertNotIn("아직 적용 금지",prompt)
        self.assertNotIn("비공유 교육",prompt)
        self.assertNotIn("철회 교육",prompt)

    def test_claimed_job_after_restart_never_launches(self):
        self.worker.db.execute("INSERT INTO jobs VALUES ('task','run',NULL,'launching','123456','fixture',0)")
        self.worker.db.commit()
        with patch.object(self.worker, "request", side_effect=self.request):
            self.worker.tick()
        self.assertFalse(any(c[1] == "/v1/runs" for c in self.calls))
        self.assertEqual(self.worker.db.execute("SELECT state FROM jobs").fetchone()[0], "finished")

    def test_cancel_waits_for_remote_confirmation(self):
        with patch.object(self.worker, "request", side_effect=self.request):
            self.worker.tick()
            self.state["tasks"][1]["status"] = "cancel_requested"
            self.worker.tick()
            self.assertFalse(any(c[2] and c[2].get("type") == "agent:cancelled" for c in self.calls))
            self.remote_status = "cancelled"
            self.worker.tick()
        self.assertEqual(len([c for c in self.calls if c[1].endswith("/stop")]), 1)
        self.assertTrue(any(c[2] and c[2].get("type") == "agent:cancelled" for c in self.calls))

    def test_ambiguous_launch_does_not_retry(self):
        def uncertain(base, key, path, body=None):
            value = self.request(base, key, path, body)
            if path == "/v1/runs":
                raise OSError("fixture connection reset after send")
            return value
        with patch.object(self.worker, "request", side_effect=uncertain):
            self.worker.tick()
            self.worker.tick()
        self.assertEqual(len([c for c in self.calls if c[1] == "/v1/runs"]), 1)


class DiscoveryTests(unittest.TestCase):
    def test_hundred_unique_bots_are_found_after_blank_and_duplicate_profiles(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for index in range(102):
                profile=root/"profiles"/f"profile-{index:03}"
                profile.mkdir(parents=True)
                if index:
                    identity=100000+max(1,index-1)
                    (profile/".env").write_text(f"TELEGRAM_BOT_TOKEN={identity}:"+"x"*30,encoding="utf-8")
            def identity(token,method,payload=None):
                return dict(id=int(token.split(":")[0]),is_bot=True,first_name="Fixture",username="fixture_bot")
            with patch.object(discover,"telegram",side_effect=identity):
                result=discover.inventory(root,verify=True)
            self.assertEqual(len(result["employees"]),100)
            self.assertEqual(len({e["botId"] for e in result["employees"]}),100)
            self.assertIn("100100",{e["botId"] for e in result["employees"]})

    def test_no_network_without_verify_and_secret_not_exported(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fake_token = "123456:" + "x" * 30
            (root / ".env").write_text("TELEGRAM_BOT_TOKEN=" + fake_token, encoding="utf-8")
            with patch.object(discover, "telegram", side_effect=AssertionError("network forbidden")):
                result = discover.inventory(root, verify=False)
            self.assertEqual(result["employees"], [])
            self.assertNotIn(fake_token, json.dumps(result))

    def test_verified_fixture_identity_and_capability(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / ".env").write_text("TELEGRAM_BOT_TOKEN=123456:" + "x" * 30, encoding="utf-8")
            skill = root / "skills" / "fixture"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text("description: fixture description", encoding="utf-8")
            with patch.object(discover, "telegram", return_value=dict(id=123456, is_bot=True, first_name="Fixture", username="fixture_bot")):
                result = discover.inventory(root, verify=True)
            self.assertEqual(result["employees"][0]["botId"], "123456")
            self.assertTrue(any(c["name"] == "fixture" for c in result["employees"][0]["capabilities"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
