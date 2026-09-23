"""Read-only roster refresh shared by manual and scheduled discovery."""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def mounted(path):
    value = Path(path).resolve().as_posix()
    if len(value) < 3 or value[1] != ":":
        raise ValueError("WSL 공유 경로는 로컬 드라이브여야 합니다.")
    return "/mnt/" + value[0].lower() + value[2:]


def refresh(server):
    if not server.discover_lock.acquire(blocking=False):
        return {"found": len(server.store.snapshot()["employees"]), "warnings": ["봇 정보를 확인 중입니다."]}
    try:
        warnings = []
        config_file = server.data / "connection.json"
        if config_file.is_file():
            config = json.loads(config_file.read_text(encoding="utf-8-sig"))
            root = Path(__file__).resolve().parents[2]
            script = root / "scripts/hermes-office/discover.py"
            output, assets = server.data / "inventory.json", server.data / "avatars"
            if config.get("kind") == "wsl" and os.name == "nt":
                command = ["wsl.exe", "-d", config["distro"], "--", "python3", mounted(script), "--home", config["home"], "--host", config["host"], "--verify", "--assets", mounted(assets), "--output", mounted(output)]
            elif config.get("kind") == "local":
                command = [sys.executable, str(script), "--home", config["home"], "--host", config["host"], "--verify", "--assets", str(assets), "--output", str(output)]
            else:
                raise ValueError("연결 환경 설정을 확인하세요.")
            try:
                result = subprocess.run(command, capture_output=True, timeout=600, creationflags=0x08000000 if os.name == "nt" else 0)
                if result.returncode:
                    warnings.append("봇 정보를 새로 조회하지 못해 마지막 확인 목록을 표시합니다.")
            except subprocess.TimeoutExpired:
                warnings.append("봇 확인 시간이 초과됐습니다. 기존 명부를 유지합니다.")
        file = server.data / "inventory.json"
        if not file.is_file():
            return {"found": 0, "warnings": ["연결 프로그램의 봇 정보 확인이 필요합니다."]}
        value = json.loads(file.read_text(encoding="utf-8"))
        state = server.store.ingest(value)
        # No database shared across Windows/WSL; export only connector identities.
        index = [{k: e[k] for k in ("id", "botId", "profile")} for e in state["employees"]]
        temp = server.data / "roster-index.tmp"
        temp.write_text(json.dumps(index), encoding="utf-8")
        temp.replace(server.data / "roster-index.json")
        # New API-ready employees join read-only monitoring. Their paid execution
        # stays disabled and existing operator-selected entries are preserved.
        if config_file.is_file():
            preparation = Path(__file__).resolve().with_name("prepare_connections.py")
            if config.get("kind") == "wsl" and os.name == "nt":
                prepare_command = ["wsl.exe", "-d", config["distro"]]
                if config.get("user"):
                    prepare_command += ["-u", config["user"]]
                prepare_command += ["--", "python3", mounted(preparation), "--home", config["home"], "--data", mounted(server.data), "--sync-monitor"]
            else:
                prepare_command = [sys.executable, str(preparation), "--home", config["home"], "--data", str(server.data), "--sync-monitor"]
            try:
                prepared = subprocess.run(prepare_command, capture_output=True, timeout=300, creationflags=0x08000000 if os.name == "nt" else 0)
                if prepared.returncode:
                    warnings.append("직원 명부는 반영했습니다. 새 직원의 실행 연결 설정을 확인해주세요.")
            except (OSError, subprocess.TimeoutExpired):
                warnings.append("새 직원 연결 확인 시간이 지연됐습니다. 기존 직원 연결은 유지합니다.")
        server.discovery_status = {"found": len(value.get("employees", [])), "warnings": warnings + value.get("warnings", []), "checkedAt": time.time()}
        return {"found": server.discovery_status["found"], "warnings": server.discovery_status["warnings"]}
    finally:
        server.last_discovery = time.monotonic()
        server.discover_lock.release()


def monitor(server):
    while not server.stop.wait(5):
        settings = server.store.snapshot()["settings"]
        interval = settings.get("discoveryIntervalMinutes", 10) * 60
        if settings.get("autoDiscover", True) and time.monotonic() - server.last_discovery >= interval:
            try:
                refresh(server)
            except Exception:
                server.last_discovery = time.monotonic()
                server.discovery_status = {"warnings": ["자동 봇 확인 연결을 점검해주세요."], "checkedAt": time.time()}
