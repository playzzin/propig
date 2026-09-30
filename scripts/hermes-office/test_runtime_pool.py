"""Incremental monitor contracts. Fake workers only; no provider requests."""
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from runtime_pool import reconcile_monitor, run_entry
from prepare_connections import sync_monitor_config


def entry(identity, **extra):
    return dict(employeeId=identity, profile=identity, endpoint="http://127.0.0.1:19999", keyFile="fixture.key", enabled=True, **extra)


class RuntimeGrowthTests(unittest.TestCase):
    def test_new_monitor_can_join_without_restarting_existing_or_enabling_paid_execution(self):
        slots={}
        def launch(value):
            thread=Mock()
            thread.is_alive.return_value=True
            return dict(entry=dict(value),stop=Mock(),thread=thread)
        first=entry("first")
        reconcile_monitor(dict(workers=[first]),slots,launch)
        original=slots["first"]
        second=dict(entry("second"),enabled=False,monitor=True)
        reconcile_monitor(dict(workers=[first,second]),slots,launch)
        self.assertIs(slots["first"],original)
        original["stop"].set.assert_not_called()
        self.assertFalse(slots["second"]["entry"]["enabled"])
        for invalid in ([],None,"invalid",dict(workers=[dict(first,monitor="invalid")])):
            with self.assertRaises(ValueError):
                reconcile_monitor(invalid,slots,launch)
        self.assertEqual(set(slots),{"first","second"})
        original["stop"].set.assert_not_called()

    def test_one_bad_key_does_not_stop_other_employee_and_recovers_without_a_pool_restart(self):
        bad_stop,good_stop=threading.Event(),threading.Event()
        recovered,good_tick=threading.Event(),threading.Event()
        failed=threading.Event()
        good_worker,bad_worker=Mock(),Mock()
        attempts=[]
        def create_bad(_):
            attempts.append(1)
            if len(attempts)==1:
                raise OSError("missing fixture key")
            return bad_worker
        def tick_bad(_):
            recovered.set(); bad_stop.set()
        def tick_good(_):
            good_tick.set(); good_stop.set()
        bad=threading.Thread(target=run_entry,args=(entry("bad"),bad_stop,create_bad,tick_bad,lambda _:failed.set(),.01))
        good=threading.Thread(target=run_entry,args=(entry("good"),good_stop,lambda _:good_worker,tick_good,lambda _:None,.01))
        bad.start(); good.start()
        try:
            self.assertTrue(failed.wait(2))
            self.assertTrue(good_tick.wait(2))
            self.assertTrue(recovered.wait(2))
        finally:
            bad_stop.set(); good_stop.set()
            bad.join(2); good.join(2)
        self.assertFalse(bad.is_alive() or good.is_alive())
        bad_worker.close.assert_called_once()
        good_worker.close.assert_called_once()

    def test_candidate_sync_preserves_existing_settings_and_never_enables_new_work(self):
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder)
            first=entry("first")
            file=data/"workers.json"
            file.write_text(json.dumps(dict(office="http://127.0.0.1:3010",workers=[first])),encoding="utf-8")
            self.assertEqual(sync_monitor_config(data,[dict(first,endpoint="http://127.0.0.1:20000"),entry("new")]),1)
            result=json.loads(file.read_text())
            self.assertEqual(result["workers"][0],first)
            self.assertFalse(result["workers"][1]["enabled"])
            self.assertTrue(result["workers"][1]["monitor"])
            original=file.read_bytes()
            self.assertEqual(sync_monitor_config(data,[entry("new")]),0)
            self.assertEqual(file.read_bytes(),original)


if __name__=="__main__":
    unittest.main()
