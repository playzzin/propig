import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from supervisor import Supervisor, components


class SupervisorTests(unittest.TestCase):
    def test_monitor_command_cannot_resume_paid_work(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / "workers.json").write_text(json.dumps({"workers": []}))
            commands = components(data, python="fixture-python", windows=False)
            self.assertIn("--monitor", commands["workers"])
            self.assertNotIn("--execute", sum(commands.values(), []))
            self.assertEqual(set(commands), {"server", "workers"})

    def test_dead_owned_child_recovers_and_retains_data(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            durable = data / "office.sqlite"
            durable.write_bytes(b"existing office data")
            supervisor = Supervisor(data)
            first = Mock(pid=123, returncode=1)
            first.poll.return_value = None
            second = Mock(pid=124)
            second.poll.return_value = None
            with patch("supervisor.healthy", return_value=False), patch("supervisor.subprocess.Popen", side_effect=[first, second]) as start:
                supervisor.tick()
                self.assertEqual(start.call_count, 1)
                first.poll.return_value = 1
                supervisor.tick()
                self.assertEqual(start.call_count, 1)
                supervisor.next_start["server"] = 0
                supervisor.tick()
                self.assertEqual(start.call_count, 2)
                self.assertEqual(supervisor.status["components"]["server"]["starts"], 2)
                self.assertEqual(durable.read_bytes(), b"existing office data")
                supervisor.close()

    def test_existing_server_is_not_killed_or_replaced(self):
        with tempfile.TemporaryDirectory() as temp:
            supervisor = Supervisor(temp)
            with patch("supervisor.healthy", return_value=True), patch("supervisor.subprocess.Popen") as start:
                supervisor.tick()
                start.assert_not_called()
                self.assertTrue(supervisor.status["components"]["server"]["existingInstance"])
                supervisor.close()

    def test_existing_monitor_is_adopted_without_replacing_its_pid(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / "workers.json").write_text('{"workers":[]}')
            (data / "workers.pid").write_text('555')
            supervisor = Supervisor(data)
            with patch("supervisor.healthy", return_value=True), patch("supervisor.existing_worker", return_value=dict(pid=555, mode="monitor")), patch("supervisor.subprocess.Popen") as start:
                supervisor.tick()
                start.assert_not_called()
                self.assertEqual(supervisor.status["components"]["workers"]["pid"], 555)
                self.assertEqual((data / "workers.pid").read_text(), '555')
                supervisor.close()

    def test_first_verified_connection_file_starts_only_a_monitor_without_server_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            data=Path(temp)
            supervisor=Supervisor(data)
            child=Mock(pid=1234)
            child.poll.return_value=None
            with patch("supervisor.healthy",return_value=True),patch("supervisor.existing_worker",return_value=None),patch("supervisor.subprocess.Popen",return_value=child) as launch:
                supervisor.tick()
                launch.assert_not_called()
                (data/"workers.json").write_text('{"workers":[]}',encoding="utf-8")
                supervisor.tick()
                self.assertEqual(launch.call_count,1)
                self.assertIn("--monitor",launch.call_args.args[0])
                self.assertNotIn("--execute",launch.call_args.args[0])
                self.assertNotIn("server",supervisor.children)
                supervisor.close()

    def test_alive_but_unresponsive_owned_server_is_stopped_after_grace(self):
        with tempfile.TemporaryDirectory() as temp:
            supervisor = Supervisor(temp)
            child = Mock(pid=125)
            child.poll.return_value = None
            with patch("supervisor.healthy", return_value=False), patch("supervisor.subprocess.Popen", return_value=child):
                supervisor.tick()
                for _ in range(6):
                    supervisor.tick()
                child.terminate.assert_not_called()
                supervisor.started["server"] = 0
                supervisor.tick()
                child.terminate.assert_called_once()
                self.assertEqual(supervisor.status["components"]["server"]["recoveryReason"], "http-unresponsive")
                supervisor.close()


if __name__ == "__main__":
    unittest.main()
