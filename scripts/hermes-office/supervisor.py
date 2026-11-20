"""Local UI/observer/readiness recovery. This supervisor never runs AI work."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parent


def components(data, python=None, windows=None):
    data = Path(data).resolve()
    python = python or sys.executable
    windows = os.name == "nt" if windows is None else windows
    result = {"server": [python, "-X", "utf8", "-B", str(SCRIPTS / "server.py"), "--data", str(data)]}
    if (data / "workers.json").is_file():
        result["workers"] = [python, "-X", "utf8", "-B", str(SCRIPTS / "runtime_pool.py"), "--config", str(data / "workers.json"), "--data", str(data), "--monitor"]
    config_file = data / "connection.json"
    if config_file.is_file():
        config = json.loads(config_file.read_text(encoding="utf-8-sig"))
        if config.get("kind") == "wsl" and windows:
            def mounted(path):
                value = Path(path).as_posix()
                if len(value) < 3 or value[1] != ":":
                    raise ValueError("WSL 공유 경로는 로컬 드라이브여야 합니다.")
                return "/mnt/" + value[0].lower() + value[2:]
            result["observer"] = ["wsl.exe", "-d", config["distro"]]
            if config.get("user"):
                result["observer"] += ["-u", config["user"]]
            result["observer"] += ["--", "python3", mounted(SCRIPTS / "observe.py"), "--home", config["home"], "--inventory", mounted(data / "inventory.json"), "--data", mounted(data)]
    return result


def healthy():
    try:
        with urllib.request.urlopen("http://127.0.0.1:3010/api/health", timeout=2) as response:
            result = json.load(response)
        return result.get("ok") is True and result.get("mode") == "local" and result.get("version") == 2
    except Exception:
        return False


def existing_worker(data):
    """Read only an exact Office process; never adopt unrelated or paid work."""
    if os.name != "nt":
        return None
    try:
        pid = int((Path(data) / "workers.pid").read_text())
        if pid <= 0:
            return None
        command = f'(Get-CimInstance Win32_Process -Filter "ProcessId = {pid}").CommandLine'
        result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command], capture_output=True, text=True, timeout=5, creationflags=subprocess.CREATE_NO_WINDOW)
        args = [a or b for a, b in re.findall(r'"([^"]*)"|(\S+)', result.stdout.strip())]
        script = str(SCRIPTS / "runtime_pool.py")
        if script not in args or "--data" not in args or Path(args[args.index("--data") + 1]).resolve() != Path(data).resolve():
            return None
        return dict(pid=pid, mode="execute" if "--execute" in args else "monitor" if "--monitor" in args else "unknown")
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


class Supervisor:
    def __init__(self, data):
        self.data = Path(data).resolve()
        self.data.mkdir(parents=True, exist_ok=True)
        self.commands = components(self.data)
        self.children, self.logs, self.restarts, self.next_start, self.started = {}, {}, {}, {}, {}
        self.health_failures = 0
        self.adopted = None
        self.adopted_checked = 0
        self.status = {"pid": os.getpid(), "mode": "monitor-only", "startedAt": datetime.now(timezone.utc).isoformat(), "components": {}}
        self.stop = threading.Event()

    def write_status(self):
        self.status["checkedAt"] = datetime.now(timezone.utc).isoformat()
        temp = self.data / "supervisor-status.tmp"
        temp.write_text(json.dumps(self.status, indent=2), encoding="utf-8")
        temp.replace(self.data / "supervisor-status.json")

    def tick(self):
        try:
            self.commands = components(self.data)
        except (OSError, ValueError):
            pass  # Retain healthy children while operator configuration is incomplete.
        for name, command in self.commands.items():
            child = self.children.get(name)
            if child is not None and child.poll() is None:
                self.status["components"][name].update(running=True)
                if name == "server":
                    self.health_failures = 0 if healthy() else self.health_failures + 1
                    if self.health_failures >= 5 and time.monotonic() - self.started.get(name, 0) >= 30:
                        child.terminate()
                        self.status["components"][name].update(running=False, recoveryReason="http-unresponsive")
                continue
            if child is not None:
                self.logs.pop(name).close()
                self.children.pop(name)
                self.next_start[name] = time.monotonic() + min(30, 2 ** min(self.restarts.get(name, 1), 5))
                self.status["components"][name].update(running=False, lastExitCode=child.returncode)
            if time.monotonic() < self.next_start.get(name, 0):
                continue
            if name == "workers":
                if time.monotonic() - self.adopted_checked >= 10 or self.adopted is None:
                    self.adopted = existing_worker(self.data)
                    self.adopted_checked = time.monotonic()
                if self.adopted:
                    self.status["components"][name] = dict(running=True, existingInstance=True, **self.adopted)
                    continue
            if name == "server" and healthy():
                # An existing local instance keeps ownership. Never kill by port.
                self.status["components"][name] = dict(running=True, existingInstance=True)
                continue
            if name != "server" and not healthy():
                continue
            log = (self.data / (name + "-supervised.log")).open("ab", buffering=0)
            try:
                child = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            except OSError:
                log.close()
                self.next_start[name] = time.monotonic() + 30
                self.status["components"][name] = dict(running=False, error="start-failed")
                continue
            self.children[name], self.logs[name] = child, log
            self.started[name] = time.monotonic()
            if name == "server":
                self.health_failures = 0
            self.restarts[name] = self.restarts.get(name, 0) + 1
            if name != "workers":
                (self.data / (name + ".pid")).write_text(str(child.pid), encoding="utf-8")
            self.status["components"][name] = dict(pid=child.pid, running=True, starts=self.restarts[name])
        self.status["healthy"] = healthy()
        self.write_status()

    def close(self):
        for child in self.children.values():
            if child.poll() is None:
                child.terminate()
        for child in self.children.values():
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.kill()
        for log in self.logs.values():
            log.close()
        self.status["stopped"] = True
        self.write_status()


def run(data):
    data = Path(data)
    data.mkdir(parents=True, exist_ok=True)
    with (data / "supervisor.lock").open("a+") as lock:
        if os.name == "nt":
            import msvcrt
            lock.seek(0)
            if not lock.read(1):
                lock.write("1"); lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        supervisor = Supervisor(data)
        try:
            while not supervisor.stop.wait(2):
                supervisor.tick()
        finally:
            supervisor.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=str(ROOT / "output/hermes-office"))
    args = parser.parse_args()
    run(args.data)
