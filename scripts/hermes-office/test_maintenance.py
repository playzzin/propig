"""Isolated backup/restore checks; no real credentials, bots, or office service."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from maintenance import backup, database_summary, readonly_office, restore_copy
from restore_check import verify_backup
from server import Store


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.clock = patch("store.now", return_value="2026-09-16T12:00:00+00:00")
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data = self.root / "office"
        self.data.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def fixture(self):
        store = Store(self.data / "office.sqlite")
        state = store.ingest(dict(type="inventory", eventId="inventory", hostId="fixture", at="2026-09-16T00:00:00Z",
            employees=[dict(botId="1", name="private-fixture-name", profile="default")]))
        employee = state["employees"][0]["id"]
        store.action(dict(type="settings.update", dispatchPaused=False))
        task = store.action(dict(type="task.create", title="private-fixture-title", request="private-fixture-request", criteria="valid", employeeId=employee))["tasks"][-1]
        store.ingest(dict(type="agent:start", eventId="start", hostId="fixture", botId="1", runId="fixture-run", taskId=task["id"], at="2026-09-16T00:01:00Z"))
        store.ingest(dict(type="agent:end", eventId="end", hostId="fixture", botId="1", runId="fixture-run", at="2026-09-16T00:02:00Z",
            result="private-fixture-result", usage=dict(inputTokens=10, outputTokens=5, costUsd=0.001)))
        # A leftover active verification scope must also disappear in the copy.
        raw = json.loads(store.db.execute("SELECT value FROM state WHERE id=1").fetchone()[0])
        raw["settings"]["executionScope"] = dict(taskIds=[task["id"]], expiresAt="2099-01-01T00:00:00+00:00")
        with store.db:
            store.db.execute("UPDATE state SET value=? WHERE id=1", (json.dumps(raw),))
        return store

    def test_missing_source_never_creates_database_or_backup_folder(self):
        with self.assertRaises(ValueError):
            backup(self.data)
        self.assertEqual(list(self.data.iterdir()), [])

    def test_corrupt_and_unrelated_sources_are_rejected_without_backup(self):
        source = self.data / "office.sqlite"
        source.write_bytes(b"not a sqlite database")
        with self.assertRaises((ValueError, sqlite3.Error)):
            backup(self.data)
        self.assertEqual(source.read_bytes(), b"not a sqlite database")
        source.unlink()
        with closing(sqlite3.connect(source)) as db:
            db.execute("CREATE TABLE unrelated (id INTEGER)")
            db.commit()
        original = source.read_bytes()
        with self.assertRaises(ValueError):
            backup(self.data)
        self.assertEqual(source.read_bytes(), original)
        self.assertFalse((self.data / "backups").exists())

    def test_malformed_office_state_is_rejected(self):
        store = self.fixture()
        with store.db:
            store.db.execute("UPDATE state SET value='not json'")
        store.close()
        with self.assertRaises(ValueError):
            backup(self.data)
        self.assertFalse((self.data / "backups").exists())

    def test_online_backup_includes_committed_wal_and_preserves_source(self):
        store = self.fixture()
        try:
            before = database_summary(self.data / "office.sqlite")
            original_state = store.snapshot()
            target = backup(self.data)
            self.assertEqual(database_summary(target), before)
            self.assertEqual(database_summary(self.data / "office.sqlite"), before)
            self.assertEqual(store.snapshot(), original_state)
            self.assertEqual(before["tables"]["seen"]["count"], 3)
            self.assertEqual(before["tables"]["runs"]["count"], 1)
            self.assertEqual(before["tables"]["claims"]["count"], 1)
            self.assertEqual(before["tables"]["run_usage"]["count"], 1)
            self.assertGreater(before["tables"]["audit"]["count"], 0)
        finally:
            store.close()

    def test_restore_preserves_data_and_source_bytes_but_disables_execution(self):
        self.fixture().close()
        primary = (self.data / "office.sqlite").read_bytes()
        target = backup(self.data)
        saved = target.read_bytes()
        for filename in ("connector.key", "workers.json", "connection.json", "hook.sqlite"):
            (self.data / filename).write_text("fixture must not copy")
        destination = self.root / "restored"
        restored = restore_copy(target, destination)
        self.assertEqual({p.name for p in destination.iterdir()}, {"office.sqlite"})
        self.assertEqual(database_summary(restored), database_summary(target))
        with readonly_office(restored) as (_, state):
            self.assertTrue(state["settings"]["dispatchPaused"])
            self.assertIsNone(state["settings"]["executionScope"])
        with readonly_office(target) as (_, state):
            self.assertFalse(state["settings"]["dispatchPaused"])
            self.assertIsNotNone(state["settings"]["executionScope"])
        self.assertEqual(target.read_bytes(), saved)
        self.assertEqual((self.data / "office.sqlite").read_bytes(), primary)

    def test_restore_refuses_existing_empty_or_occupied_destination(self):
        self.fixture().close()
        target = backup(self.data)
        for name in ("empty", "occupied"):
            destination = self.root / name
            destination.mkdir()
            if name == "occupied":
                (destination / "office.sqlite").write_bytes(b"operator data")
            before = {p.name: p.read_bytes() for p in destination.iterdir()}
            with self.assertRaises(ValueError):
                restore_copy(target, destination)
            self.assertEqual({p.name: p.read_bytes() for p in destination.iterdir()}, before)

    def test_invalid_restore_source_does_not_create_destination(self):
        destination = self.root / "restored"
        with self.assertRaises(ValueError):
            restore_copy(self.root / "missing.sqlite", destination)
        self.assertFalse(destination.exists())

    def test_failed_publish_leaves_no_runnable_unpaused_copy(self):
        self.fixture().close()
        target = backup(self.data)
        original = target.read_bytes()
        destination = self.root / "failed-copy"
        with patch("maintenance.os.link", side_effect=OSError("fixture publish failure")):
            with self.assertRaises(OSError):
                restore_copy(target, destination)
        self.assertFalse((destination / "office.sqlite").exists())
        self.assertEqual(list(destination.iterdir()), [])
        self.assertEqual(target.read_bytes(), original)

    def test_readonly_source_connection_cannot_write(self):
        self.fixture().close()
        with readonly_office(self.data / "office.sqlite") as (connection, _):
            with self.assertRaises(sqlite3.OperationalError):
                connection.execute("DELETE FROM seen")

    def test_isolated_http_restore_report_contains_hashes_and_counts_only(self):
        self.fixture().close()
        target = backup(self.data)
        original = hashlib.sha256(target.read_bytes()).hexdigest()
        # A restore check must never start a roster scan or inbox consumer.
        with patch("server.refresh_roster", side_effect=AssertionError("external discovery forbidden")), patch("server.consume", side_effect=AssertionError("inbox ingestion forbidden")):
            result = verify_backup(target)
        self.assertTrue(result["ok"])
        self.assertTrue(result["backupUnchanged"])
        self.assertTrue(result["executionPaused"])
        self.assertFalse(result["connectionFilesCopied"])
        self.assertEqual(result["data"]["collections"]["employees"]["count"], 1)
        self.assertEqual(result["data"]["results"]["count"], 1)
        self.assertEqual(result["backupSha256"], original)
        self.assertNotIn("private-fixture", json.dumps(result))
        self.assertNotIn("fixture-run", json.dumps(result))

    def test_http_restore_accepts_unprojected_persisted_state(self):
        self.fixture().close()
        target = backup(self.data)
        with readonly_office(target) as (_, raw):
            self.assertNotIn("generatedAt", raw)
            self.assertNotIn("observations", raw["employees"][0])
            self.assertNotIn("deliveryEvidence", raw["tasks"][0])
        before = target.read_bytes()
        result = verify_backup(target)
        self.assertTrue(result["http"]["state"])
        self.assertTrue(result["executionPaused"])
        self.assertEqual(target.read_bytes(), before)

    def test_http_restore_rejects_persisted_field_change_in_response(self):
        self.fixture().close()
        target = backup(self.data)
        before = target.read_bytes()
        project = Store._project

        def changed_response(store, state):
            value = project(store, state)
            # Seat is persistent but is not included in the Markdown export.
            value["employees"][0]["seat"] += 1
            return value

        with patch.object(Store, "_project", changed_response):
            with self.assertRaisesRegex(ValueError, "복원 HTTP"):
                verify_backup(target)
        self.assertEqual(target.read_bytes(), before)

    def test_http_restore_rejects_persisted_copy_change_before_serving(self):
        self.fixture().close()
        target = backup(self.data)
        before = target.read_bytes()

        def changed_copy(source, destination):
            copied = restore_copy(source, destination)
            with closing(sqlite3.connect(copied)) as connection:
                state = json.loads(connection.execute("SELECT value FROM state WHERE id=1").fetchone()[0])
                state["tasks"][0]["result"] = "changed fixture result"
                with connection:
                    connection.execute("UPDATE state SET value=? WHERE id=1", (json.dumps(state),))
            return copied

        with patch("restore_check.restore_copy", side_effect=changed_copy), patch("restore_check.OfficeServer", side_effect=AssertionError("corrupt copy must not be served")):
            with self.assertRaisesRegex(ValueError, "복원 사본의 업무와 장부"):
                verify_backup(target)
        self.assertEqual(target.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
