"""Independent phase-two contract tests; synthetic temporary state only."""
from datetime import datetime, timedelta, timezone
import copy
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import math
import json
from pathlib import Path
import sys
import tempfile
import time
import sqlite3
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src/lib/server/hermes-office"))
from store import Store, ValidationError, ConflictError
from worker import Worker
from gateway_hook import handle, resolve_profile
from observe import Observer
from runtime_pool import validate as validate_pool, run as run_pool, key_path, monitor_tick
from prepare_connections import prepare


class PhaseTwoTests(unittest.TestCase):
    def setUp(self):
        self.clock = datetime.now(timezone.utc)
        self.response_clock = patch("store.now", return_value=self.clock.isoformat())
        self.response_clock.start()
        self.addCleanup(self.response_clock.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "fixture.sqlite"
        self.store = Store(self.path)
        self.sequence = 0
        self.register(3)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def emit(self, kind, **extra):
        self.sequence += 1
        return self.store.ingest(dict(type=kind, eventId=f"event-{self.sequence}", hostId="fixture", at=(self.clock + timedelta(seconds=self.sequence)).isoformat(), **extra))

    def register(self, count):
        return self.emit("inventory", employees=[dict(botId=str(i + 1), name=f"검증 직원 {i + 1}", profile=f"fixture-{i}") for i in range(count)])

    def action(self, action_type, **extra):
        return self.store.action(dict(type=action_type, **extra))

    def employee(self, index=0):
        return self.store.snapshot()["employees"][index]["id"]

    def workflow(self, kind="project"):
        return self.action("workflow.create", name="검증 협업", goal="근거 있는 결과 만들기", kind=kind, employeeIds=[self.employee(0), self.employee(1)])["workflows"][-1]

    def task(self):
        return self.action("task.create", title="검증 업무", request="합성 입력", criteria="결과 확인", employeeId=self.employee())["tasks"][-1]

    def enabled(self, **extra):
        return self.action("settings.update", dispatchPaused=False, **extra)

    def reject_atomic(self, action):
        before = self.store.snapshot()
        with self.assertRaises((ValidationError, ConflictError)):
            action()
        self.assertEqual(before, self.store.snapshot())

    def test_default_pause_and_shared_rooms(self):
        state = self.store.snapshot()
        self.assertTrue(state["settings"]["dispatchPaused"])
        self.assertGreater(len(state["rooms"]), 0)
        task = self.task()
        self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="paused", taskId=task["id"]))

    def test_execution_scope_rejects_unrelated_repeat_and_expired_claims(self):
        first, other = self.task(), self.task()
        expires = (datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()
        self.action("settings.update", dispatchPaused=False, executionScope=dict(taskIds=[first["id"]], expiresAt=expires))
        self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="outside-scope", taskId=other["id"]))
        self.emit("agent:start", botId="1", runId="within-scope", taskId=first["id"])
        self.emit("agent:end", botId="1", runId="within-scope", result="검증 결과")
        current=self.store.snapshot()["tasks"][0]
        self.action("task.review", id=first["id"], revision=current["revision"], qualityScore=50, reviewNote="다음 실행 범위에서 수정", accepted=False)
        self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="repeat-scope", taskId=first["id"]))
        self.action("settings.update", executionScope=dict(taskIds=[other["id"]], expiresAt=expires))
        with patch("store.now", return_value=(datetime.now(timezone.utc)+timedelta(minutes=6)).isoformat()):
            self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="expired-scope", taskId=other["id"]))

    def test_observed_input_wait_never_creates_or_reopens_a_task(self):
        self.reject_atomic(lambda: self.emit("agent:step",botId="1",runId="missing",existingRunOnly=True,stage="input_wait"))
        self.emit("agent:start",botId="1",runId="existing")
        state=self.emit("agent:step",botId="1",runId="existing",existingRunOnly=True,stage="input_wait")
        self.assertEqual(len(state["tasks"]),1)
        self.assertEqual(state["tasks"][0]["activity"],"input_wait")
        self.emit("agent:end",botId="1",runId="existing",result="실제 종료")
        state=self.emit("agent:step",botId="1",runId="existing",existingRunOnly=True,stage="input_wait")
        self.assertEqual(state["tasks"][0]["status"],"review")

    def test_workflow_edit_launch_dependencies_and_duplicate_launch(self):
        plan = self.workflow()
        self.assertEqual(self.store.snapshot()["tasks"], [])
        steps = copy.deepcopy(plan["steps"])
        steps[0]["criteria"] = "검증 근거를 포함"
        plan = self.action("workflow.update", id=plan["id"], revision=plan["revision"], steps=steps)["workflows"][-1]
        state = self.action("workflow.launch", id=plan["id"], revision=plan["revision"])
        self.assertEqual(len(state["tasks"]), len(steps))
        self.assertTrue(all(t["workflowId"] == plan["id"] and t["dependencyPolicy"] == "result" for t in state["tasks"]))
        self.reject_atomic(lambda: self.action("workflow.launch", id=plan["id"], revision=plan["revision"]))
        first, second = state["tasks"][:2]
        self.enabled()
        self.reject_atomic(lambda: self.emit("agent:start", botId="2", runId="premature", taskId=second["id"]))
        self.emit("agent:start", botId="1", runId="first", taskId=first["id"])
        self.emit("agent:end", botId="1", runId="first", result="검증된 선행 결과")
        self.emit("agent:start", botId="2", runId="second", taskId=second["id"])
        current = self.store.snapshot()["tasks"]
        self.assertEqual(current[0]["status"], "review")
        self.assertEqual(current[1]["status"], "running")

    def test_ai_plan_import_is_draft_strict_and_never_autolaunches(self):
        self.enabled()
        planning = self.action("workflow.plan", name="AI 계획", goal="검증", kind="project", plannerId=self.employee(), employeeIds=[self.employee()])["tasks"][-1]
        self.emit("agent:start", botId="1", runId="ai-planning", taskId=planning["id"])
        generated = dict(name="결과 계획", goal="검증", kind="project", steps=[dict(id="one", title="작업", request="검증 작업", criteria="근거 포함", stage="work", employeeId=self.employee(), dependencies=[])])
        self.emit("agent:end", botId="1", runId="ai-planning", result=json.dumps(generated))
        state = self.action("workflow.import", taskId=planning["id"])
        self.assertEqual(len(state["tasks"]), 1)
        self.assertEqual(state["workflows"][-1]["status"], "draft")
        self.reject_atomic(lambda: self.action("workflow.import", taskId=planning["id"]))

    def test_ai_plan_cannot_expand_selected_employee_scope(self):
        self.enabled()
        planning = self.action("workflow.plan", name="범위 검증", goal="검증", kind="project", plannerId=self.employee(), employeeIds=[self.employee()])["tasks"][-1]
        self.emit("agent:start", botId="1", runId="outside-plan", taskId=planning["id"])
        generated = dict(name="범위 밖 계획", goal="검증", kind="project", steps=[dict(id="one", title="작업", request="검증 작업", criteria="근거 포함", stage="work", employeeId=self.employee(1), dependencies=[])])
        self.emit("agent:end", botId="1", runId="outside-plan", result=json.dumps(generated))
        self.reject_atomic(lambda: self.action("workflow.import", taskId=planning["id"]))

    def test_cycle_invalid_employee_and_stale_edit_are_atomic(self):
        plan = self.workflow()
        steps = copy.deepcopy(plan["steps"])
        steps[0]["dependencies"] = [steps[-1]["id"]]
        steps[-1]["dependencies"] = [steps[0]["id"]]
        self.reject_atomic(lambda: self.action("workflow.update", id=plan["id"], revision=plan["revision"], steps=steps))
        steps = copy.deepcopy(plan["steps"])
        steps[0]["employeeId"] = "unregistered"
        self.reject_atomic(lambda: self.action("workflow.update", id=plan["id"], revision=plan["revision"], steps=steps))
        self.reject_atomic(lambda: self.action("workflow.update", id=plan["id"], revision=0, steps=plan["steps"]))

    def test_meeting_plan_is_bounded_and_has_summary(self):
        plan = self.workflow("meeting")
        self.assertEqual(plan["kind"], "meeting")
        self.assertGreaterEqual(len(plan["steps"]), 3)
        self.assertLessEqual(len(plan["steps"]), 11)
        self.assertTrue(plan["steps"][-1]["dependencies"])
        self.register(12)
        self.reject_atomic(lambda: self.action("workflow.create", name="과대 회의", goal="검증", kind="meeting", employeeIds=[e["id"] for e in self.store.snapshot()["employees"]]))

    def test_cancel_preserves_started_work_and_cancels_waiting_work(self):
        plan = self.workflow()
        state = self.action("workflow.launch", id=plan["id"], revision=plan["revision"])
        plan = state["workflows"][-1]
        self.enabled()
        self.emit("agent:start", botId="1", runId="cancel-workflow", taskId=state["tasks"][0]["id"])
        state = self.action("workflow.cancel", id=plan["id"], revision=plan["revision"])
        self.assertEqual(state["tasks"][0]["status"], "cancel_requested")
        self.assertTrue(all(task["status"] == "cancelled" for task in state["tasks"][1:]))
        self.assertEqual(state["workflows"][-1]["status"], "cancelled")

    def test_daily_limit_and_blocked_task_are_not_claimable(self):
        self.enabled(dailyRunLimit=1)
        task = self.task()
        self.emit("agent:start", botId="1", runId="once", taskId=task["id"])
        self.emit("agent:end", botId="1", runId="once", result="결과")
        second = self.task()
        self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="twice", taskId=second["id"]))
        self.enabled(dailyRunLimit=20)
        second = self.action("task.update", id=second["id"], revision=second["revision"], status="blocked")["tasks"][-1]
        self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="blocked", taskId=second["id"]))

    def test_simultaneous_claim_only_one_run_is_registered(self):
        self.enabled()
        task = self.task()
        second_store = Store(self.path)
        def claim(store, identity):
            try:
                store.ingest(dict(type="agent:start", eventId=identity, hostId="fixture", botId="1", runId=identity, taskId=task["id"], at=datetime.now(timezone.utc).isoformat()))
                return True
            except ConflictError:
                return False
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                a = pool.submit(claim, self.store, "claim-a")
                b = pool.submit(claim, second_store, "claim-b")
                self.assertEqual(sum((a.result(), b.result())), 1)
            self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM claims").fetchone()[0], 1)
            self.assertEqual(self.store.snapshot()["tasks"][-1]["attempts"], 1)
        finally:
            second_store.close()

    def test_review_rework_counts_and_requires_evidence(self):
        self.enabled()
        task = self.task()
        self.emit("agent:start", botId="1", runId="review", taskId=task["id"])
        task = self.emit("agent:end", botId="1", runId="review", result="초안")["tasks"][-1]
        self.reject_atomic(lambda: self.action("task.review", id=task["id"], revision=task["revision"], qualityScore=50, reviewNote="", accepted=False))
        task = self.action("task.review", id=task["id"], revision=task["revision"], qualityScore=50, reviewNote="출처 보완", accepted=False)["tasks"][-1]
        self.assertEqual(task["reworkCount"], 1)
        self.assertEqual(task["status"], "queued")
        self.assertEqual(task["qualityScore"], 50)

    def test_rework_keeps_results_and_sums_usage_without_double_counting(self):
        self.enabled()
        task = self.task()
        self.emit("agent:start", botId="1", runId="attempt-1", taskId=task["id"])
        self.emit("agent:step", botId="1", runId="attempt-1", usage=dict(inputTokens=10, outputTokens=2, costUsd=0.01))
        task = self.emit("agent:end", botId="1", runId="attempt-1", result="첫 원본", usage=dict(inputTokens=10, outputTokens=3, costUsd=0.02))["tasks"][-1]
        self.assertEqual(task["usage"]["inputTokens"], 10)
        self.action("task.review", id=task["id"], revision=task["revision"], qualityScore=40, reviewNote="수정 필요", accepted=False)
        self.emit("agent:start", botId="1", runId="attempt-2", taskId=task["id"])
        task = self.emit("agent:end", botId="1", runId="attempt-2", result="두 번째 원본", usage=dict(inputTokens=20, outputTokens=5, costUsd=0.03))["tasks"][-1]
        self.assertEqual([v["result"] for v in task["resultVersions"]], ["첫 원본", "두 번째 원본"])
        self.assertEqual(task["usage"]["inputTokens"], 30)
        self.assertEqual(task["usage"]["outputTokens"], 8)
        self.assertAlmostEqual(task["usage"]["costUsd"], 0.05)
        self.store.close()
        self.store = Store(self.path)
        self.assertEqual(self.store.snapshot()["tasks"][-1]["resultVersions"], task["resultVersions"])

    def test_training_snapshot_immutable_rollback_and_employee_scope(self):
        record = self.action("record.create", kind="education", title="출처 교육", content="원래 교육 내용", evidence="연습 검증", employeeId=self.employee())["records"][-1]
        self.reject_atomic(lambda: self.action("training.apply", recordId=record["id"], employeeId=self.employee()))
        record = self.action("record.update", id=record["id"], revision=record["revision"], status="verified")["records"][-1]
        self.reject_atomic(lambda: self.action("training.apply", recordId=record["id"], employeeId=self.employee(1)))
        version = self.action("training.apply", recordId=record["id"], employeeId=self.employee())["training"][-1]
        self.reject_atomic(lambda: self.action("training.apply", recordId=record["id"], employeeId=self.employee()))
        self.action("record.update", id=record["id"], revision=record["revision"], content="변경된 교육 내용")
        self.assertEqual(self.store.snapshot()["training"][-1]["content"], "원래 교육 내용")
        rolled = self.action("training.rollback", id=version["id"])["training"][-1]
        self.assertEqual(rolled["status"], "rolled_back")
        self.assertEqual(rolled["content"], version["content"])
        self.assertTrue(rolled["rolledBackAt"])

    def test_room_bounds_and_100_unique_seats_with_swap(self):
        self.register(100)
        original = self.store.snapshot()["employees"]
        self.assertEqual(len({e["seat"] for e in original}), 100)
        state = self.action("seat.swap", employeeId=original[0]["id"], targetSeat=original[99]["seat"])
        self.assertEqual(state["employees"][0]["seat"], original[99]["seat"])
        self.assertEqual(state["employees"][99]["seat"], original[0]["seat"])
        room = dict(name="검증 회의실", kind="meeting", floor=0, x=70, y=70, width=20, height=20)
        self.action("room.save", **room)
        self.reject_atomic(lambda: self.action("room.save", **dict(room, width=40)))
        self.reject_atomic(lambda: self.action("room.save", **dict(room, floor=4)))
        self.reject_atomic(lambda: self.register(101))

    def test_employee_stale_revision_does_not_overwrite(self):
        employee = self.store.snapshot()["employees"][0]
        self.action("employee.update", id=employee["id"], revision=employee["revision"], accessory="headset")
        self.reject_atomic(lambda: self.action("employee.update", id=employee["id"], revision=employee["revision"], accessory="tie"))
        self.assertEqual(self.store.snapshot()["employees"][0]["accessory"], "headset")

    def test_runtime_dedup_late_status_and_invalid_usage(self):
        self.emit("runtime:status", botId="1", status="ready", summary="준비")
        current = self.store.snapshot()["employees"][0]["runtime"]
        late = dict(type="runtime:status", eventId="late-runtime", hostId="fixture", botId="1", at=(self.clock-timedelta(days=1)).isoformat(), status="offline", summary="과거")
        state = self.store.ingest(late)
        self.assertEqual(state["employees"][0]["runtime"], current)
        self.assertEqual(self.store.ingest(late), state)
        self.reject_atomic(lambda: self.emit("agent:start", botId="1", runId="bad", usage=dict(inputTokens=math.inf, outputTokens=0, costUsd=None)))


class WorkerPhaseTwoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "office.sqlite")
        state = self.store.ingest(dict(type="inventory", eventId="inventory", hostId="fixture", at=datetime.now(timezone.utc).isoformat(), employees=[dict(botId="1", name="검증 직원", profile="fixture")]))
        self.employee = state["employees"][0]["id"]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        self.worker = Worker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:9999", "fixture", self.employee, self.root / "worker.sqlite")
        self.calls = []
        self.remote_status = "running"

    def tearDown(self):
        self.worker.close()
        self.store.close()
        self.temp.cleanup()

    def task(self):
        return self.store.action(dict(type="task.create", title="검증 업무", request="합성 요청", criteria="결과 확인", employeeId=self.employee))["tasks"][-1]

    def request(self, base, key, path, body=None):
        self.calls.append((path, body))
        if path == "/api/state":
            return self.store.snapshot()
        if path == "/api/ingest":
            return self.store.ingest(body)
        if path == "/v1/runs":
            return dict(run_id="remote-" + str(len([c for c in self.calls if c[0] == path])))
        if path.endswith("/stop"):
            return {}
        if path.startswith("/v1/runs/"):
            return dict(status=self.remote_status, output="검증 결과", usage=dict(input_tokens=10, output_tokens=2, cost_usd=0.01))
        raise AssertionError("Unexpected mocked request: " + path)

    def tick(self):
        with patch.object(self.worker, "request", side_effect=self.request):
            self.worker.tick()

    def test_review_requeue_launches_new_attempt_and_keeps_usage(self):
        self.task()
        self.tick()
        self.remote_status = "completed"
        self.tick()
        task = self.store.snapshot()["tasks"][-1]
        self.store.action(dict(type="task.review", id=task["id"], revision=task["revision"], qualityScore=30, reviewNote="재작업 필요", accepted=False))
        self.tick()
        self.tick()
        task = self.store.snapshot()["tasks"][-1]
        self.assertEqual(task["attempts"], 2)
        self.assertEqual(task["usage"]["inputTokens"], 20)
        self.assertEqual(len(task["resultVersions"]), 2)
        self.assertEqual(self.worker.db.execute("SELECT COUNT(*) FROM job_history").fetchone()[0], 1)

    def test_inactive_employee_still_tracks_cancellation(self):
        self.task()
        self.tick()
        task = self.store.snapshot()["tasks"][-1]
        self.store.action(dict(type="employee.update", id=self.employee, status="inactive"))
        self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], status="cancel_requested"))
        self.tick()
        self.assertEqual(self.store.snapshot()["tasks"][-1]["status"], "cancel_requested")
        self.remote_status = "cancelled"
        self.tick()
        self.assertEqual(self.store.snapshot()["tasks"][-1]["status"], "cancelled")
        self.assertEqual(len([c for c in self.calls if c[0].endswith("/stop")]), 1)

    def test_timeout_requests_stop_and_waits_for_confirmation(self):
        self.task()
        self.tick()
        self.worker.db.execute("UPDATE job_meta SET started=?,timeout=1", (time.time()-60,))
        self.worker.db.commit()
        self.tick()
        self.assertEqual(self.store.snapshot()["tasks"][-1]["status"], "running")
        self.assertTrue(any(c[0].endswith("/stop") for c in self.calls))
        self.remote_status = "cancelled"
        self.tick()
        self.assertEqual(self.store.snapshot()["tasks"][-1]["status"], "cancelled")

    def test_training_rollback_excluded_from_next_prompt(self):
        record = self.store.action(dict(type="record.create", kind="education", title="검증 교육", content="반드시 사라질 교육 문구", evidence="검증", employeeId=self.employee))["records"][-1]
        self.store.action(dict(type="record.update", id=record["id"], revision=record["revision"], status="verified"))
        training = self.store.action(dict(type="training.apply", recordId=record["id"], employeeId=self.employee))["training"][-1]
        self.store.action(dict(type="training.rollback", id=training["id"]))
        self.task()
        self.tick()
        prompt = next(body["input"] for path, body in self.calls if path == "/v1/runs")
        self.assertNotIn("반드시 사라질 교육 문구", prompt)

    def test_profile_mismatch_never_submits(self):
        self.task()
        self.worker.expected_profile = "wrong-profile"
        self.tick()
        self.assertFalse(any(path == "/v1/runs" for path, _ in self.calls))
        self.assertEqual(self.store.snapshot()["employees"][0]["runtime"]["status"], "error")


class HookAndPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.data = self.root / "data"
        self.home.mkdir()
        self.data.mkdir()
        self.config = self.root / "hook.json"
        self.config.write_text(json.dumps(dict(home=str(self.home), data=str(self.data), profile="default", coveredProfiles=["default", "second"])), encoding="utf-8")
        (self.data / "inventory.json").write_text(json.dumps(dict(hostId="fixture", employees=[dict(profile="default", botId="1"), dict(profile="second", botId="2")])), encoding="utf-8")
        with closing(sqlite3.connect(self.home / "state.db")) as db:
            db.execute("CREATE TABLE sessions(id TEXT PRIMARY KEY, profile_name TEXT)")
            db.executemany("INSERT INTO sessions VALUES (?,?)", [("first", "default"), ("second-session", "second")])
            db.commit()

    def tearDown(self):
        self.temp.cleanup()

    def events(self):
        return [json.loads(p.read_text(encoding="utf-8")) for p in (self.data / "inbox").glob("*.json")]

    def test_multiplex_identity_and_tool_arguments_never_exported(self):
        context = dict(platform="telegram", session_id="second-session", message="합성 작업")
        handle("agent:start", context, self.config)
        handle("agent:step", dict(context, tool_names=["search"], tool_args="fixture-private-args", reasoning="fixture-private-reasoning"), self.config)
        handle("agent:end", dict(context, response="합성 결과"), self.config)
        events = self.events()
        self.assertEqual(len(events), 3)
        self.assertEqual({e["botId"] for e in events}, {"2"})
        self.assertEqual(len({e["runId"] for e in events}), 1)
        self.assertNotIn("fixture-private", json.dumps(events))
        handle("agent:end", dict(context, response="중복 종료"), self.config)
        self.assertEqual(len(self.events()), 3)

    def test_unknown_session_nontelegram_and_orphan_step_are_ignored(self):
        self.assertIsNone(resolve_profile(self.home, dict(session_id="unknown"), "default"))
        handle("agent:start", dict(platform="cli", session_id="first", message="비텔레그램"), self.config)
        handle("agent:start", dict(platform="telegram", session_id="unknown", message="미등록"), self.config)
        handle("agent:step", dict(platform="telegram", session_id="first"), self.config)
        self.assertEqual(self.events(), [])

    def test_hook_spool_failure_recovers_committed_start(self):
        context = dict(platform="telegram", session_id="first", message="재시작 검증")
        with patch.object(Path, "replace", side_effect=OSError("fixture transport failure")):
            with self.assertRaises(OSError):
                handle("agent:start", context, self.config)
        handle("agent:end", dict(context, response="복구 결과"), self.config)
        events = self.events()
        self.assertEqual({e["type"] for e in events}, {"agent:start", "agent:end"})
        self.assertEqual(len({e["runId"] for e in events}), 1)
        with closing(sqlite3.connect(self.data / "hook.sqlite")) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)

    def test_pool_default_validation_never_opens_key_or_network(self):
        entry = dict(employeeId="employee", profile="default", endpoint="http://127.0.0.1:12345", keyFile="missing-fixture-key", enabled=True)
        with self.assertRaises(ValueError):
            validate_pool(dict(workers=[entry, entry]))
        with self.assertRaises(ValueError):
            validate_pool(dict(workers=[dict(entry, endpoint="https://example.com")]))
        config = self.root / "pool.json"
        config.write_text(json.dumps(dict(workers=[entry])), encoding="utf-8")
        with patch("runtime_pool.read_key", side_effect=AssertionError("must not read key")), patch("runtime_pool.urllib.request.urlopen", side_effect=AssertionError("must not call API")):
            result = run_pool(config, self.root / "pool-data", execute=False)
        self.assertEqual(result["execution"], "disabled")
        self.assertFalse((self.root / "pool-data").exists())

    def test_readiness_monitor_never_dispatches_an_unpaused_queue(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        employee = dict(id="fixture", profile="default")
        probe = Mock()
        status = Mock()
        client = Mock(return_value=dict(settings=dict(dispatchPaused=False), employees=[employee], tasks=[dict(source="office", status="queued", employeeId="fixture")]))
        worker = SimpleNamespace(office="local-office", office_key="fixture-key", employee_id="fixture", last_heartbeat=0, request=client, probe=probe, runtime_status=status, tick=Mock(side_effect=AssertionError("execution forbidden")))
        monitor_tick(worker)
        client.assert_called_once_with("local-office", "fixture-key", "/api/state")
        probe.assert_called_once_with(employee)
        status.assert_called_once()
        self.assertEqual(status.call_args.args[1], "ready")
        worker.tick.assert_not_called()

    def test_prepare_reports_existing_hooks_without_reinstalling(self):
        import shutil
        (self.data / "roster-index.json").write_text(json.dumps([dict(botId="1", id="first"), dict(botId="2", id="second")]), encoding="utf-8")
        initial = prepare(self.home, self.data)
        self.assertEqual(initial["installedHooks"], 0)
        destinations = []
        for profile in ("default", "second"):
            folder = self.home if profile == "default" else self.home / "profiles" / profile
            destination = folder / "hooks/hermes-office"
            shutil.copytree(self.data / "prepared-connections" / profile, destination)
            destinations.append(destination / "handler.py")
        before = [path.stat().st_mtime_ns for path in destinations]
        confirmed = prepare(self.home, self.data)
        self.assertEqual(confirmed["installedHooks"], 2)
        self.assertEqual(before, [path.stat().st_mtime_ns for path in destinations])
        destinations[1].write_text("# different local version", encoding="utf-8")
        self.assertEqual(prepare(self.home, self.data)["installedHooks"], 1)

    def test_windows_pool_reads_registered_wsl_key_in_place(self):
        (self.root / "connection.json").write_text(json.dumps(dict(kind="wsl", distro="Ubuntu-24.04", home="/home/hermes/.hermes")), encoding="utf-8")
        with patch("runtime_pool.sys.platform", "win32"):
            self.assertEqual(key_path("/home/hermes/.hermes/profiles/fixture/.env", self.root), "\\\\wsl.localhost\\Ubuntu-24.04\\home\\hermes\\.hermes\\profiles\\fixture\\.env")
            for outside in ("/etc/credentials", "/home/hermes/.hermes/../../other/.env"):
                with self.assertRaises(ValueError):
                    key_path(outside, self.root)

    def test_selected_new_hook_does_not_overwrite_or_block_on_changed_default_roster(self):
        (self.data / "roster-index.json").write_text(json.dumps([dict(botId="1",id="first"),dict(botId="2",id="second")]),encoding="utf-8")
        with patch("prepare_connections.config_for",return_value={"gateway":{"multiplex_profiles":True}}):
            prepare(self.home,self.data,apply_hooks=True)
            installed=self.home/"hooks/hermes-office/office-hook.json"
            original=installed.read_bytes()
            inventory=json.loads((self.data/"inventory.json").read_text())
            inventory["employees"].append(dict(botId="3",profile="third"))
            (self.data/"inventory.json").write_text(json.dumps(inventory),encoding="utf-8")
            result=prepare(self.home,self.data,apply_hooks=True,profiles=["third"])
        self.assertEqual(result["installedHooks"],1)
        self.assertEqual(installed.read_bytes(),original)
        self.assertTrue((self.home/"profiles/third/hooks/hermes-office/HOOK.yaml").exists())

    def test_selected_activation_plan_preserves_existing_connections_and_plan(self):
        from activate_connections import plan
        (self.data / "roster-index.json").write_text(json.dumps([dict(botId="1",id="first"),dict(botId="2",id="second")]),encoding="utf-8")
        (self.home/".env").write_text("API_SERVER_PORT=18642\nAPI_SERVER_KEY=fixture-private",encoding="utf-8")
        second=self.home/"profiles/second"
        second.mkdir(parents=True)
        (second/".env").write_text("# existing new profile",encoding="utf-8")
        prepared=self.data/"prepared-connections"
        prepared.mkdir()
        original_plan=prepared/"activation-plan.json"
        original_plan.write_text('{"previous":"keep"}',encoding="utf-8")
        before=[p.read_bytes() for p in (self.home/".env",second/".env",original_plan)]
        with patch("prepare_connections.urllib.request.urlopen",side_effect=OSError("offline fixture")), patch("activate_connections.socket.socket"):
            result=plan(self.home,self.data,profiles=["second"])
        generated=json.loads((prepared/"activation-plan-selected.json").read_text(encoding="utf-8"))
        self.assertEqual(result["profiles"],1)
        self.assertEqual([p["profile"] for p in generated["profiles"]],["second"])
        self.assertNotEqual(generated["profiles"][0]["port"],18642)
        self.assertEqual([p.read_bytes() for p in (self.home/".env",second/".env",original_plan)],before)

    def test_dead_hook_recovery_starts_at_new_boundary_without_duplicate_turn(self):
        with closing(sqlite3.connect(self.home / "state.db")) as db:
            db.execute("ALTER TABLE sessions ADD COLUMN source TEXT DEFAULT 'telegram'")
            db.execute("CREATE TABLE messages(id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL, finish_reason TEXT, active INTEGER)")
            db.commit()
        observer = Observer(self.home, self.data / "inventory.json", self.data)
        def add(number):
            with closing(sqlite3.connect(self.home / "state.db")) as db:
                db.execute("INSERT INTO messages VALUES (?,'first','user','fixture request',NULL,NULL,?,'stop',1)", (number, time.time()))
                db.commit()
        try:
            observer.tick()
            with patch("gateway_hook.process_signature", return_value="fixture-birth"):
                handle("gateway:startup", {}, self.config)
            add(1)
            with patch("observe.process_signature", return_value="fixture-birth"):
                observer.tick()
            self.assertFalse(any(e.get("telemetrySource") == "observer" for e in self.events()))
            add(2)
            with patch("observe.process_signature", return_value=""):
                observer.tick()
                add(3)
                observer.tick()
            activity = [e for e in self.events() if e.get("telemetrySource") == "observer"]
            self.assertEqual(len(activity), 1)
            self.assertTrue(activity[0]["runId"].endswith(":3"))
        finally:
            observer.db.close()

    def test_input_wait_requires_verified_live_hook_not_legacy_receiver(self):
        with closing(sqlite3.connect(self.home / "state.db")) as db:
            db.execute("ALTER TABLE sessions ADD COLUMN source TEXT DEFAULT 'telegram'")
            db.execute("CREATE TABLE messages(id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL, finish_reason TEXT, active INTEGER)")
            db.execute("INSERT INTO messages VALUES (1,'first','assistant','private',?,NULL,?,'tool_calls',1)", (json.dumps([dict(function=dict(name="clarify",arguments="private"))]),time.time()))
            db.commit()
        with patch("gateway_hook.process_signature",return_value="fixture-birth"):
            handle("gateway:startup",{},self.config)
        handle("agent:start",dict(platform="telegram",session_id="first",message="合成"),self.config)
        with closing(sqlite3.connect(self.data / "hook.sqlite")) as db:
            db.execute("UPDATE receivers SET pid=NULL,birth=NULL")
            db.commit()
        observer=Observer(self.home,self.data / "inventory.json",self.data)
        try:
            observer.tick()
            self.assertFalse(any(e.get("existingRunOnly") for e in self.events()))
            with closing(sqlite3.connect(self.data / "hook.sqlite")) as db:
                db.execute("UPDATE receivers SET pid=1,birth='fixture-birth'")
                db.commit()
            with patch("observe.process_signature",return_value="fixture-birth"):
                observer.tick()
            self.assertEqual(len([e for e in self.events() if e.get("existingRunOnly")]),1)
        finally:
            observer.db.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
