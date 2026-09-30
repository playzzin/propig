import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from store import ConflictError, Store, ValidationError


class StoreTests(unittest.TestCase):
    def setUp(self):
        # Response generation time is independent of persisted/domain state.
        self.clock = patch("store.now", return_value="2026-09-16T12:00:00+00:00")
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "office.db"
        self.store = Store(self.path)
        self.counter = 0

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def inventory(self, count=1, **extra):
        self.counter += 1
        return self.store.ingest(dict(type="inventory", eventId=f"inv-{self.counter}", hostId="pc", hostName="내 PC", at="2026-09-16T10:00:00Z", employees=[dict(botId=str(i + 1), name=f"직원 {i+1}", **extra) for i in range(count)]))

    def event(self, kind, **extra):
        self.counter += 1
        return self.store.ingest(dict(type=kind, eventId=f"evt-{self.counter}", hostId="pc", botId="1", runId="run-1", at="2026-09-16T11:00:00Z", **extra))

    def test_empty_and_no_fake_registration(self):
        self.assertEqual(self.store.snapshot()["employees"], [])
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="employee.create", name="가짜"))
        self.assertEqual(self.store.snapshot()["revision"], 0)

    def test_inventory_preserves_identity_seat_and_org(self):
        employee = self.inventory()["employees"][0]
        dept = self.store.action(dict(type="department.save", name="기획팀"))["departments"][0]
        self.store.action(dict(type="employee.update", id=employee["id"], name="기획 루나", departmentId=dept["id"], seat=50, character="🐱"))
        updated = self.inventory(model="GPT", secret="should never persist")["employees"][0]
        self.assertEqual(updated["id"], employee["id"])
        self.assertEqual(updated["name"], "기획 루나")
        self.assertEqual(updated["seat"], 50)
        self.assertEqual(updated["departmentId"], dept["id"])
        self.assertNotIn("secret", updated)
        self.assertEqual(updated["model"], "GPT")

    def test_event_dedup_and_restart(self):
        self.inventory()
        payload = dict(type="agent:start", eventId="same", hostId="pc", botId="1", runId="job", at="2026-09-16T11:00:00Z")
        original = self.store.ingest(payload)
        self.assertEqual(self.store.ingest(payload), original)
        self.store.close()
        self.store = Store(self.path)
        self.assertEqual(self.store.ingest(payload), original)
        self.assertEqual(len(original["tasks"]), 1)

    def test_manager_cycle_and_seat_collision(self):
        a, b = self.inventory(2)["employees"]
        self.store.action(dict(type="employee.update", id=a["id"], managerId=b["id"]))
        before = self.store.snapshot()
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="employee.update", id=b["id"], managerId=a["id"]))
        with self.assertRaises(ConflictError):
            self.store.action(dict(type="employee.update", id=b["id"], seat=a["seat"]))
        self.assertEqual(before, self.store.snapshot())

    def test_terminal_and_out_of_order_no_regression(self):
        self.inventory()
        task = self.event("agent:end", result="초안 작성")["tasks"][0]
        self.assertEqual(task["status"], "review")
        self.assertEqual(self.event("agent:start")["tasks"][0]["status"], "review")
        self.assertEqual(self.event("agent:error")["tasks"][0]["status"], "review")

    def test_completion_requires_review_approval_criteria(self):
        self.inventory()
        running = self.event("agent:start")["tasks"][0]
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="task.update", id=running["id"], revision=running["revision"], status="completed", result="문서", criteria="검토"))
        task = self.event("agent:end", result="문서")["tasks"][0]
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], status="approval"))
        task = self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], status="approval", criteria="문서 검토"))["tasks"][0]
        task = self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], status="completed"))["tasks"][0]
        self.assertEqual(task["status"], "completed")
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], result="덮어쓰기"))

    def test_revision_conflict_and_dependencies(self):
        e = self.inventory()["employees"][0]
        def create(title, dependencies):
            return self.store.action(dict(type="task.create", title=title, request="작성", employeeId=e["id"], criteria="검토", dependencies=dependencies))["tasks"][-1]
        first = create("첫 업무", [])
        second = create("후속 업무", [first["id"]])
        self.assertEqual(second["status"], "blocked")
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="task.update", id=second["id"], revision=1, status="queued"))
        self.store.action(dict(type="task.update", id=first["id"], revision=1, summary="상세 추가"))
        with self.assertRaises(ConflictError):
            self.store.action(dict(type="task.update", id=first["id"], revision=1, summary="오래된 변경"))

    def test_education_evidence_and_audit_history(self):
        record = self.store.action(dict(type="record.create", kind="education", title="출처 교육", content="출처 연결 연습"))["records"][0]
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="record.update", id=record["id"], revision=1, status="completed"))
        snapshot = self.store.action(dict(type="record.update", id=record["id"], revision=1, status="completed", evidence="검토한 연습 결과 1"))
        self.assertEqual(snapshot["records"][0]["status"], "completed")
        self.assertEqual(len(snapshot["events"]), 2)
        self.assertIn("검토한 연습 결과 1", snapshot["events"][-1]["summary"])

    def test_award_requires_actual_completed_task(self):
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="record.create", kind="award", title="포상", content="수고", evidence="말뿐"))
        self.assertEqual(self.store.snapshot()["records"], [])

    def test_inventory_100_limit_atomic(self):
        snapshot = self.inventory(100)
        self.assertEqual(len(snapshot["employees"]), 100)
        with self.assertRaises(ValidationError):
            self.store.ingest(dict(type="inventory", eventId="overflow", hostId="pc", at="2026-09-16T12:00:00Z", employees=[dict(botId="101", name="초과 직원")]))
        self.assertEqual(self.store.snapshot(), snapshot)
        self.assertEqual(len({e["seat"] for e in snapshot["employees"]}), 100)

    def test_scrubs_imported_credentials_and_rejects_untrusted_host(self):
        self.inventory(instructions=[dict(name="지침", description="token=private-value")])
        snapshot = self.event("agent:start", summary="api_key=private-value Authorization: Bearer private-value 검색 시작")
        self.assertNotIn("private-value", str(snapshot))
        with self.assertRaises(ValidationError):
            self.store.ingest(dict(type="agent:start", eventId="other-host", hostId="unknown", botId="1", runId="r", at="2026-09-16T11:00:00Z"))

    def test_invalid_input_transaction_rollback(self):
        before = self.store.snapshot()
        with self.assertRaises(ValidationError):
            self.store.ingest(dict(type="inventory", eventId="bad", hostId="pc", at="bad date", employees=[]))
        with self.assertRaises(ValidationError):
            self.store.ingest(dict(type="inventory", eventId="bad", hostId="pc", at="2026-09-16T11:00:00Z", employees=[dict(botId="1", name="직원"), dict(botId="1", name="중복")]))
        self.assertEqual(before, self.store.snapshot())

    def test_avatar_allowlist_and_meeting_task_requirement(self):
        e = self.inventory(avatar="/avatars/1.jpg")["employees"][0]
        self.assertEqual(e["avatar"], "/avatars/1.jpg")
        e = self.inventory(avatar="https://untrusted.example/avatar")["employees"][0]
        self.assertEqual(e["avatar"], "")
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="record.create", kind="meeting", title="회의", content="업무가 없는 회의"))

    def test_claim_binding_and_concurrency(self):
        a, b = self.inventory(2)["employees"]
        self.store.action(dict(type="settings.update", maxConcurrent=1, dispatchPaused=False))
        task = self.store.action(dict(type="task.create", title="실제 실행", request="문서", criteria="검토", employeeId=a["id"]))["tasks"][0]
        other = self.store.action(dict(type="task.create", title="다음 실행", request="문서", criteria="검토", employeeId=b["id"]))["tasks"][-1]
        state = self.event("agent:start", taskId=task["id"])
        self.assertEqual(len(state["tasks"]), 2)
        self.assertEqual(state["tasks"][0]["status"], "running")
        self.assertEqual(state["tasks"][0]["source"], "office")
        with self.assertRaises(ConflictError):
            self.store.ingest(dict(type="agent:start", eventId="claim-2", hostId="pc", botId="2", runId="r-2", taskId=other["id"], at="2026-09-16T11:00:01Z"))
        self.event("agent:end", result="완료 초안")
        state = self.store.ingest(dict(type="agent:start", eventId="claim-2", hostId="pc", botId="2", runId="r-2", taskId=other["id"], at="2026-09-16T11:00:01Z"))
        self.assertEqual(state["tasks"][1]["status"], "running")

    def test_claim_rejects_dependency_and_owner_hijack(self):
        a, b = self.inventory(2)["employees"]
        task = self.store.action(dict(type="task.create", title="선행", request="문서", criteria="검토", employeeId=a["id"]))["tasks"][0]
        after = self.store.action(dict(type="task.create", title="후행", request="문서", criteria="검토", employeeId=a["id"], dependencies=[task["id"]]))["tasks"][-1]
        with self.assertRaises(ConflictError):
            self.event("agent:start", taskId=after["id"])
        with self.assertRaises(ConflictError):
            self.store.ingest(dict(type="agent:start", eventId="hijack", hostId="pc", botId="2", runId="hijack", taskId=task["id"], at="2026-09-16T11:00:01Z"))

    def test_unknown_update_fields_cannot_inject_dependency_cycle(self):
        e = self.inventory()["employees"][0]
        task = self.store.action(dict(type="task.create", title="업무", request="문서", criteria="검토", employeeId=e["id"]))["tasks"][0]
        before = self.store.snapshot()
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="task.update", id=task["id"], revision=1, dependencies=[task["id"]]))
        self.assertEqual(before, self.store.snapshot())

    def test_non_destructive_migration_and_restart_defaults(self):
        employee = self.inventory()["employees"][0]
        raw = self.store.snapshot()
        raw.pop("roomsInitialized")
        for field in ("rooms", "workflows", "training"):
            raw.pop(field)
        for field in self.store.SETTINGS:
            raw["settings"].pop(field)
        raw["employees"][0].pop("accessory")
        import json
        self.store.db.execute("UPDATE state SET value=? WHERE id=1", (json.dumps(raw),))
        self.store.db.commit()
        self.store.close()
        self.store = Store(self.path)
        current = self.store.snapshot()
        self.assertEqual(current["employees"][0]["id"], employee["id"])
        self.assertEqual(current["employees"][0]["accessory"], "none")
        self.assertTrue(current["settings"]["dispatchPaused"])
        self.assertEqual(len(current["rooms"]), 4)

    def test_atomic_claim_across_store_connections(self):
        from concurrent.futures import ThreadPoolExecutor
        a = self.inventory()["employees"][0]
        self.store.action(dict(type="settings.update", dispatchPaused=False, dailyRunLimit=1))
        tasks = []
        for i in range(2):
            tasks.append(self.store.action(dict(type="task.create", title=f"업무 {i}", request="내용", criteria="검토", employeeId=a["id"]))["tasks"][-1])
        second = Store(self.path)
        def claim(index):
            try:
                (self.store if index == 0 else second).ingest(dict(type="agent:start", eventId=f"parallel-{index}", hostId="pc", botId="1", runId=f"parallel-{index}", taskId=tasks[index]["id"], at="2026-09-16T11:00:00Z"))
                return True
            except ConflictError:
                return False
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(sum(pool.map(claim, range(2))), 1)
            self.assertEqual(sum(t["attempts"] for t in self.store.snapshot()["tasks"]), 1)
        finally:
            second.close()

    def test_workflow_cancel_and_training_snapshot(self):
        e = self.inventory()["employees"][0]
        workflow = self.store.action(dict(type="workflow.create", name="회의", goal="결정", kind="meeting", employeeIds=[e["id"]]))["workflows"][0]
        launched = self.store.action(dict(type="workflow.launch", id=workflow["id"], revision=1))["workflows"][0]
        self.assertEqual(len(launched["steps"]), 2)
        state = self.store.action(dict(type="workflow.cancel", id=workflow["id"], revision=2))
        self.assertTrue(all(t["status"] == "cancelled" for t in state["tasks"]))
        record = self.store.action(dict(type="record.create", kind="knowledge", title="교육", content="검증본", evidence="근거"))["records"][0]
        self.store.action(dict(type="record.update", id=record["id"], revision=1, status="verified"))
        applied = self.store.action(dict(type="training.apply", recordId=record["id"], employeeId=e["id"]))["training"][0]
        self.store.action(dict(type="record.update", id=record["id"], revision=2, content="새 내용"))
        self.assertEqual(self.store.snapshot()["training"][0]["content"], "검증본")
        self.store.action(dict(type="training.rollback", id=applied["id"]))
        self.assertEqual(self.store.snapshot()["training"][0]["status"], "rolled_back")

    def test_attempt_results_preserved_and_usage_is_not_double_counted(self):
        e = self.inventory()["employees"][0]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        task = self.store.action(dict(type="task.create", title="초안", request="작성", criteria="검토", employeeId=e["id"]))["tasks"][0]
        self.event("agent:start", taskId=task["id"])
        self.event("agent:step", usage=dict(inputTokens=10, outputTokens=2, costUsd=0.1))
        result = self.event("agent:end", result="첫 초안", usage=dict(inputTokens=10, outputTokens=5, costUsd=0.2))["tasks"][0]
        self.assertEqual(result["usage"]["inputTokens"], 10)
        self.store.action(dict(type="task.review", id=task["id"], revision=result["revision"], accepted=False, qualityScore=30, reviewNote="보완"))
        self.store.ingest(dict(type="agent:start", eventId="retry", hostId="pc", botId="1", runId="retry", taskId=task["id"], at="2026-09-16T12:00:00Z"))
        result = self.store.ingest(dict(type="agent:end", eventId="retry-end", hostId="pc", botId="1", runId="retry", at="2026-09-16T12:01:00Z", result="두 번째 초안", usage=dict(inputTokens=4, outputTokens=3, costUsd=0.1)))["tasks"][0]
        self.assertEqual([v["result"] for v in result["resultVersions"]], ["첫 초안", "두 번째 초안"])
        self.assertEqual(result["usage"]["inputTokens"], 14)
        self.assertAlmostEqual(result["usage"]["costUsd"], 0.3)

    def test_ai_planning_import_is_scoped_draft_and_idempotent(self):
        import json
        a, b = self.inventory(2)["employees"]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        plan = self.store.action(dict(type="workflow.plan", name="AI 계획", goal="문서", kind="project", employeeIds=[a["id"]], plannerId=b["id"]))["tasks"][0]
        self.assertEqual(plan["stage"], "planning")
        self.assertEqual(plan["status"], "queued")
        payload = dict(name="계획", goal="목표", kind="project", steps=[dict(id="one", title="작성", request="작성", employeeId=a["id"], criteria="검토", dependencies=[], stage="작성")])
        self.store.ingest(dict(type="agent:start", eventId="plan-start", hostId="pc", botId="2", runId="plan", taskId=plan["id"], at="2026-09-16T12:00:00Z"))
        self.store.ingest(dict(type="agent:end", eventId="plan-end", hostId="pc", botId="2", runId="plan", at="2026-09-16T12:01:00Z", result="```json\n"+json.dumps(payload)+"\n```"))
        snapshot = self.store.action(dict(type="workflow.import", taskId=plan["id"]))
        self.assertEqual(snapshot["workflows"][0]["status"], "draft")
        self.assertEqual(len(snapshot["tasks"]), 1)
        self.assertEqual(snapshot["tasks"][0]["planningWorkflowId"], snapshot["workflows"][0]["id"])
        with self.assertRaises(ConflictError):
            self.store.action(dict(type="workflow.import", taskId=plan["id"]))

    def test_ai_import_rejects_unselected_staff(self):
        import json
        a, b = self.inventory(2)["employees"]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        plan = self.store.action(dict(type="workflow.plan", name="계획", goal="문서", kind="project", employeeIds=[a["id"]], plannerId=a["id"]))["tasks"][0]
        self.event("agent:start", taskId=plan["id"])
        payload = dict(name="계획", goal="목표", kind="project", steps=[dict(id="one", title="작성", request="작성", employeeId=b["id"], criteria="검토", dependencies=[], stage="작성")])
        self.event("agent:end", result=json.dumps(payload))
        before = self.store.snapshot()
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="workflow.import", taskId=plan["id"]))
        self.assertEqual(before, self.store.snapshot())

    def test_consumed_dependency_snapshot_survives_upstream_rework(self):
        a, b = self.inventory(2)["employees"]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        workflow = self.store.action(dict(type="workflow.create", name="협업", goal="문서", kind="project", employeeIds=[a["id"], b["id"]]))["workflows"][0]
        tasks = self.store.action(dict(type="workflow.launch", id=workflow["id"], revision=1))["tasks"]
        self.event("agent:start", taskId=tasks[0]["id"])
        first = self.event("agent:end", result="처음 자료")["tasks"][0]
        self.store.ingest(dict(type="agent:start", eventId="down", hostId="pc", botId="2", runId="down", taskId=tasks[1]["id"], at="2026-09-16T12:00:00Z"))
        state = self.store.action(dict(type="task.review", id=first["id"], revision=first["revision"], accepted=False, qualityScore=40, reviewNote="자료 수정"))
        downstream = state["tasks"][1]
        self.assertEqual(downstream["status"], "running")
        self.assertTrue(downstream["dependencyStale"])
        self.assertEqual(downstream["dependencySnapshots"][0]["result"], "처음 자료")

    def test_runtime_identical_heartbeat_no_audit_spam(self):
        self.inventory()
        payload = dict(type="runtime:status", hostId="pc", botId="1", status="ready", summary="준비")
        before = self.store.ingest(dict(**payload, eventId="ready1", at="2026-09-16T12:00:00Z"))
        after = self.store.ingest(dict(**payload, eventId="ready2", at="2026-09-16T12:01:00Z"))
        self.assertEqual(len(before["events"]), len(after["events"]))
        self.assertNotEqual(before["employees"][0]["runtime"]["lastSeen"], after["employees"][0]["runtime"]["lastSeen"])

    def test_completed_downstream_can_rework_when_its_evidence_changes(self):
        a, b = self.inventory(2)["employees"]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        workflow = self.store.action(dict(type="workflow.create", name="인계", goal="검토", kind="project", employeeIds=[a["id"], b["id"]]))["workflows"][0]
        tasks = self.store.action(dict(type="workflow.launch", id=workflow["id"], revision=1))["tasks"]
        self.event("agent:start", taskId=tasks[0]["id"])
        first = self.event("agent:end", result="선행 원본")["tasks"][0]
        for kind, identity, at in (("agent:start", "down-start", "12:00"), ("agent:end", "down-end", "12:01")):
            payload = dict(type=kind, eventId=identity, hostId="pc", botId="2", runId="down", at="2026-09-16T" + at + ":00Z")
            payload.update(dict(taskId=tasks[1]["id"]) if kind == "agent:start" else dict(result="후속 결과"))
            self.store.ingest(payload)
        for status in ("approval", "completed"):
            current = self.store.snapshot()["tasks"][1]
            self.store.action(dict(type="task.update", id=current["id"], revision=current["revision"], status=status))
        state = self.store.action(dict(type="task.review", id=first["id"], revision=first["revision"], accepted=False, qualityScore=30, reviewNote="근거 변경"))
        downstream = state["tasks"][1]
        self.assertTrue(downstream["dependencyStale"])
        self.assertEqual(downstream["status"], "completed")
        state = self.store.action(dict(type="task.review", id=downstream["id"], revision=downstream["revision"], accepted=False, qualityScore=50, reviewNote="새 근거로 재검토"))
        self.assertEqual(state["tasks"][1]["status"], "queued")
        self.assertEqual(state["tasks"][1]["resultVersions"][0]["result"], "후속 결과")


class DashboardProjectionTests(unittest.TestCase):
    setUp = StoreTests.setUp
    tearDown = StoreTests.tearDown
    inventory = StoreTests.inventory
    event = StoreTests.event

    def test_dashboard_unknown_channels_and_read_only_projection(self):
        self.inventory()
        before = self.store.db.execute("SELECT value FROM state WHERE id=1").fetchone()[0]
        state = self.store.snapshot()
        self.assertEqual(state["generatedAt"], "2026-09-16T12:00:00+00:00")
        observations = state["employees"][0]["observations"]
        self.assertEqual(set(observations), {"gateway", "modelCall", "telegramReceive", "telegramSend", "work"})
        for observation in observations.values():
            self.assertEqual(observation, dict(status="unknown", observedAt=None, source=None, evidenceRef=None, validUntil=None, reasonCode="evidence_missing"))
        self.assertEqual(before, self.store.db.execute("SELECT value FROM state WHERE id=1").fetchone()[0])

    def test_dashboard_lifecycle_not_model_or_delivery_success(self):
        self.inventory()
        for kind, status in (("agent:start", "running"), ("agent:end", "idle")):
            state = self.event(kind, result="fixture result, not verification", telemetrySource="hook")
            work = state["employees"][0]["observations"]["work"]
            self.assertEqual(work["status"], status)
            self.assertEqual(work["source"], "hook")
            self.assertEqual(work["observedAt"], "2026-09-16T11:00:00+00:00")
            self.assertEqual(work["validUntil"], "2026-09-16T11:01:00+00:00")
            self.assertEqual(work["evidenceRef"], state["tasks"][0]["id"])
            self.assertEqual(state["tasks"][0]["deliveryEvidence"], [])
            for channel in ("gateway", "modelCall", "telegramReceive", "telegramSend"):
                self.assertEqual(state["employees"][0]["observations"][channel]["status"], "unknown")

    def test_dashboard_refresh_inventory_runtime_never_renew_facts(self):
        self.inventory()
        state = self.event("agent:start", telemetrySource="observer")
        observations = state["employees"][0]["observations"]
        with patch("store.now", return_value="2026-09-17T12:00:00+00:00"):
            for payload in (
                dict(type="heartbeat"),
                dict(type="runtime:status", botId="1", status="ready"),
                dict(type="inventory", employees=[dict(botId="1", name="fixture")]),
            ):
                state = self.store.ingest(dict(payload, hostId="pc", eventId=payload["type"], at="2026-09-17T12:00:00Z"))
                self.assertEqual(state["employees"][0]["observations"], observations)
            self.assertEqual(self.store.snapshot()["employees"][0]["observations"], observations)
            self.assertEqual(state["generatedAt"], "2026-09-17T12:00:00+00:00")

    def test_dashboard_missing_source_and_manual_updates_are_unknown(self):
        self.inventory()
        self.assertEqual(self.event("agent:start")["employees"][0]["observations"]["work"]["status"], "unknown")
        state = self.event("agent:step", telemetrySource="worker")
        task = state["tasks"][0]
        state = self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], summary="manual edit"))
        self.assertEqual(state["employees"][0]["observations"]["work"]["status"], "unknown")

    def test_dashboard_future_is_historical_not_retimed(self):
        self.inventory()
        state = self.store.ingest(dict(type="agent:start", hostId="pc", botId="1", runId="future", eventId="future", at="2099-01-01T00:00:00Z", telemetrySource="hook"))
        work = state["employees"][0]["observations"]["work"]
        self.assertEqual(work["observedAt"], "2099-01-01T00:00:00+00:00")
        self.assertEqual(work["validUntil"], "2099-01-01T00:01:00+00:00")
        self.assertEqual(work, self.store.snapshot()["employees"][0]["observations"]["work"])

    def test_dashboard_completed_not_evidence_and_no_new_ingest(self):
        self.inventory()
        task = self.event("agent:end", result="all tests PASS", telemetrySource="hook")["tasks"][0]
        for status in ("approval", "completed"):
            task = self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], status=status, criteria="review"))["tasks"][0]
        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["deliveryEvidence"], [])
        with self.assertRaises(ValidationError):
            self.event("delivery:evidence", stage="test", status="pass")
        raw = self.store.db.execute("SELECT value FROM state WHERE id=1").fetchone()[0]
        self.assertNotIn('"deliveryEvidence"', raw)
        self.assertNotIn('"observations"', raw)
        self.assertNotIn('"generatedAt"', raw)

    def test_dashboard_invalid_legacy_timestamp_or_source_is_unknown(self):
        import json
        self.inventory()
        self.event("agent:start", telemetrySource="hook")
        original = json.loads(self.store.db.execute("SELECT value FROM state WHERE id=1").fetchone()[0])
        for value in ("", "invalid", "2026-09-16T11:00:00", "9999-12-31T23:59:59+00:00"):
            with self.subTest(timestamp=value):
                raw = json.loads(json.dumps(original))
                raw["tasks"][0]["updatedAt"] = value
                self.store.db.execute("UPDATE state SET value=? WHERE id=1", (json.dumps(raw),))
                self.store.db.execute("UPDATE runs SET last_at=?", (value,))
                self.store.db.commit()
                self.assertEqual(self.store.snapshot()["employees"][0]["observations"]["work"]["status"], "unknown")
        for source in ("", "unrecognized", None):
            with self.subTest(source=source):
                raw = json.loads(json.dumps(original))
                raw["tasks"][0]["telemetrySource"] = source
                self.store.db.execute("UPDATE state SET value=? WHERE id=1", (json.dumps(raw),))
                self.store.db.execute("UPDATE runs SET last_at=?", (raw["tasks"][0]["updatedAt"],))
                self.store.db.commit()
                self.assertEqual(self.store.snapshot()["employees"][0]["observations"]["work"]["status"], "unknown")

    def test_dashboard_failure_cancelled_and_empty_result_are_not_service_health(self):
        self.inventory()
        for i, (kind, expected) in enumerate((("agent:error", "failure"), ("agent:cancelled", "idle"), ("agent:end", "unknown"))):
            state = self.store.ingest(dict(type=kind, eventId=f"case-{i}", hostId="pc", botId="1", runId=f"case-{i}", telemetrySource="worker", at=f"2026-09-16T11:0{i}:00Z"))
            observations = state["employees"][0]["observations"]
            self.assertEqual(observations["work"]["status"], expected)
            self.assertEqual(observations["modelCall"]["status"], "unknown")
            self.assertEqual(observations["telegramSend"]["status"], "unknown")

    def test_dashboard_duplicate_late_and_restart_preserve_observation(self):
        self.inventory()
        payload = dict(type="agent:end", eventId="once", hostId="pc", botId="1", runId="once", at="2026-09-16T11:00:00Z", telemetrySource="hook", result="fixture")
        before = self.store.ingest(payload)
        with patch("store.now", return_value="2026-09-18T12:00:00+00:00"):
            repeated = self.store.ingest(payload)
            self.assertEqual(repeated["employees"], before["employees"])
            self.assertEqual(repeated["revision"], before["revision"])
            self.assertNotEqual(repeated["generatedAt"], before["generatedAt"])
            late = self.store.ingest(dict(payload, eventId="late", type="agent:start", at="2026-09-16T10:59:00Z"))
            self.assertEqual(late["employees"][0]["observations"], before["employees"][0]["observations"])
            self.store.close()
            self.store = Store(self.path)
            self.assertEqual(self.store.snapshot()["employees"][0]["observations"], before["employees"][0]["observations"])

    def test_dashboard_additive_payload_cannot_inject_evidence(self):
        self.inventory(observations={"telegramSend": {"status": "success"}})
        state = self.event("agent:start", telemetrySource="hook", observations={"modelCall": {"status": "success"}}, deliveryEvidence=[dict(stage="deployment", status="pass")])
        self.assertEqual(state["tasks"][0]["deliveryEvidence"], [])
        self.assertEqual(state["employees"][0]["observations"]["modelCall"]["status"], "unknown")
        self.assertEqual(state["employees"][0]["observations"]["telegramSend"]["status"], "unknown")
        task = state["tasks"][0]
        with self.assertRaises(ValidationError):
            self.store.action(dict(type="task.update", id=task["id"], revision=task["revision"], deliveryEvidence=[]))


class DashboardSourceBindingTests(unittest.TestCase):
    setUp = StoreTests.setUp
    tearDown = StoreTests.tearDown
    inventory = StoreTests.inventory

    def lifecycle(self, kind, run, second, **extra):
        self.counter += 1
        payload = dict(type=kind, eventId=f"source-{self.counter}", hostId="pc", botId="1",
                       runId=run, at=f"2026-09-16T12:00:{second:02d}Z", **extra)
        return payload, self.store.ingest(payload)

    def assert_work(self, state, source, second, status="running"):
        work = state["employees"][0]["observations"]["work"]
        if source is None:
            self.assertEqual(work, dict(status="unknown", observedAt=None, source=None,
                             evidenceRef=None, validUntil=None, reasonCode="evidence_missing"))
        else:
            self.assertEqual(work, dict(status=status, source=source,
                             observedAt=f"2026-09-16T12:00:{second:02d}+00:00",
                             validUntil=f"2026-09-16T12:01:{second:02d}+00:00",
                             evidenceRef=state["tasks"][0]["id"], reasonCode="task_lifecycle"))

    def test_new_run_source_does_not_inherit_after_review_rejection(self):
        employee = self.inventory()["employees"][0]
        self.store.action(dict(type="settings.update", dispatchPaused=False))
        task = self.store.action(dict(type="task.create", title="source fixture", request="draft",
                                     criteria="review", employeeId=employee["id"]))["tasks"][0]
        for attempt, (run, source) in enumerate((("A", "hook"), ("B", None),
                                               ("C", "worker"), ("D", None)), 1):
            second = attempt * 3
            extra = {} if source is None else dict(telemetrySource=source)
            _, state = self.lifecycle("agent:start", run, second, taskId=task["id"], **extra)
            current = state["tasks"][0]
            self.assertEqual((current["id"], current["runId"], current["status"], current["executionAttempt"]),
                             (task["id"], run, "running", attempt))
            self.assertEqual(self.store.db.execute("SELECT task,last_at,ended FROM runs WHERE host=? AND run=?",
                             ("pc", run)).fetchone(), (task["id"], current["updatedAt"], 0))
            with self.subTest(run=run, source=source):
                self.assert_work(state, source, second)
                self.assert_work(self.store.snapshot(), source, second)
            _, ended = self.lifecycle("agent:end", run, second + 1,
                                      telemetrySource=source or "observer", result=f"draft {run}")
            self.assert_work(ended, source or "observer", second + 1, "idle")
            current = ended["tasks"][0]
            queued = self.store.action(dict(type="task.review", id=current["id"], revision=current["revision"],
                                           accepted=False, qualityScore=30, reviewNote="fixture rework"))
            self.assertEqual(queued["tasks"][0]["status"], "queued")
            self.assertEqual(len(queued["tasks"][0]["resultVersions"]), attempt)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM claims").fetchone()[0], 4)

    def test_same_run_missing_source_never_renews_previous_observation(self):
        self.inventory()
        for second, source in enumerate(("hook", None, "worker", None, "observer", None)):
            extra = {} if source is None else dict(telemetrySource=source)
            payload, state = self.lifecycle("agent:step" if second else "agent:start", "same", second, **extra)
            with self.subTest(second=second, source=source):
                self.assert_work(state, source, second)
                self.assert_work(self.store.snapshot(), source, second)
        # Duplicate/late sourced input cannot resurrect provenance after a missing-source event.
        for payload in (payload, dict(payload, eventId="late-source", at="2026-09-16T12:00:04Z", telemetrySource="hook")):
            with self.subTest(event=payload["eventId"]):
                self.assert_work(self.store.ingest(payload), None, 5)
        self.store.close()
        self.store = Store(self.path)
        with self.subTest(reopened=True):
            self.assert_work(self.store.snapshot(), None, 5)
        _, ended = self.lifecycle("agent:end", "same", 6, telemetrySource="worker", result="fixture")
        self.assert_work(ended, "worker", 6, "idle")

    def test_equal_timestamp_missing_source_and_invalid_source_rollback(self):
        self.inventory()
        _, before = self.lifecycle("agent:start", "equal", 0, telemetrySource="hook")
        self.assert_work(before, "hook", 0)
        for source in ("", None, "unrecognized"):
            with self.subTest(invalid=source):
                with self.assertRaises(ValidationError):
                    self.lifecycle("agent:step", "equal", 1, telemetrySource=source)
                self.assertEqual(self.store.snapshot(), before)
        _, missing = self.lifecycle("agent:step", "equal", 0)
        with self.subTest(equal_timestamp_missing=True):
            self.assert_work(missing, None, 0)
        _, restored = self.lifecycle("agent:step", "equal", 0, telemetrySource="observer")
        self.assert_work(restored, "observer", 0)


if __name__ == "__main__":
    unittest.main()
