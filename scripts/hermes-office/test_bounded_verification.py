import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from bounded_verification import BoundedWorker, execute, cleanup


class BoundedVerificationTests(unittest.TestCase):
    def test_review_default_does_not_read_credentials_or_call_network(self):
        with tempfile.TemporaryDirectory() as temp:
            plan = Path(temp) / "plan.json"
            plan.write_text(json.dumps(dict(taskIds=["one", "two"])))
            with patch("bounded_verification.office", side_effect=AssertionError("network forbidden")), patch("bounded_verification.read_key", side_effect=AssertionError("keys forbidden")):
                result = execute(Path(temp) / "data", plan)
            self.assertEqual(result["paidCalls"], 0)
            self.assertFalse((Path(temp) / "data").exists())

    def test_ambiguous_paid_call_uses_slot_and_cannot_repeat(self):
        with tempfile.TemporaryDirectory() as temp:
            worker = BoundedWorker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:1", "fixture", "employee", Path(temp)/"worker.sqlite")
            ledger = dict(submitted=[])
            ledger_path=Path(temp)/"ledger.json"
            worker.configure(["one"], ledger, ledger_path, 1, time.time()+10)
            worker.submission_key="single-submission"
            with patch("worker.Worker.request", side_effect=OSError("ambiguous")) as send:
                with self.assertRaises(OSError):
                    worker.request(worker.hermes, "fixture", "/v1/runs", dict(input="test"))
                with self.assertRaises(ValueError):
                    worker.request(worker.hermes, "fixture", "/v1/runs", dict(input="test"))
                self.assertEqual(send.call_count, 1)
            self.assertEqual(json.loads(ledger_path.read_text())["submitted"], ["single-submission"])
            worker.close()

    def test_unrelated_tasks_are_invisible_to_runner(self):
        with tempfile.TemporaryDirectory() as temp:
            worker = BoundedWorker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:1", "fixture", "employee", Path(temp)/"worker.sqlite")
            worker.configure(["allowed"], dict(submitted=[]), Path(temp)/"ledger.json", 1, time.time()+10)
            with patch("worker.Worker.request", return_value=dict(tasks=[dict(id="allowed"), dict(id="unrelated")])):
                result=worker.request(worker.office, "fixture", "/api/state")
            self.assertEqual(result["tasks"], [dict(id="allowed")])
            worker.close()

    def test_office_failure_still_stops_known_remote_and_closes_worker(self):
        with tempfile.TemporaryDirectory() as temp:
            worker = BoundedWorker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:1", "fixture", "employee", Path(temp)/"worker.sqlite")
            worker.db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?)", ("allowed", "local-run", "remote-run", "running", "1", "fixture", 0))
            worker.db.commit()
            ledger=dict(submitted=["local-run"])
            worker.configure(["allowed"], ledger, Path(temp)/"ledger.json", 1, time.time()+30)
            def response(base, key, path, body=None):
                if base == worker.office:
                    raise OSError("office down")
                return {} if path.endswith("/stop") else dict(status="cancelled")
            with patch("bounded_verification.action", side_effect=OSError("office down")), patch("bounded_verification.office", side_effect=OSError("office down")), patch.object(worker, "request", side_effect=response) as calls, patch.object(worker, "close", wraps=worker.close) as closed:
                cleanup([worker], ["allowed"], {}, ledger, Path(temp)/"ledger.json")
                self.assertTrue(any(call.args[2] == "/v1/runs/remote-run/stop" for call in calls.call_args_list))
                closed.assert_called_once()
            self.assertTrue(ledger["officeRestorePending"])
            self.assertFalse(ledger.get("stopConfirmationPending", False))

    def test_unconfirmed_stop_is_recorded_without_claiming_completion(self):
        with tempfile.TemporaryDirectory() as temp:
            worker = BoundedWorker("http://127.0.0.1:3010", "fixture", "http://127.0.0.1:1", "fixture", "employee", Path(temp)/"worker.sqlite")
            worker.db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?)", ("allowed", "local-run", "remote-run", "running", "1", "fixture", 0))
            worker.db.commit()
            ledger=dict(submitted=["local-run"])
            with patch("bounded_verification.action"), patch("bounded_verification.office", return_value=dict(tasks=[])), patch.object(worker, "request", return_value={}), patch("bounded_verification.time.monotonic", side_effect=[0, 21]):
                cleanup([worker], ["allowed"], {}, ledger, Path(temp)/"ledger.json")
            self.assertTrue(ledger["stopConfirmationPending"])


if __name__ == "__main__":
    unittest.main()
