"""Prepare/apply a reviewed local API plan; never calls a language model.

Run inside the Hermes Linux account. Preparation is the default. Applying
requires --apply, adds local API keys, installs the prepared hooks, and restarts
only the named existing Hermes gateway services. Original files are backed up.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
from datetime import datetime, timezone
from prepare_connections import atomic, prepare
from discover import config_for


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else ""


def plan(home, data, profiles=None):
    home, data = Path(home).resolve(), Path(data).resolve()
    prepare(home, data, profiles=profiles)
    inventory = json.loads((data / "inventory.json").read_text(encoding="utf-8"))
    rows = []
    selected = set(profiles) if profiles is not None else None
    used_ports = set()
    for bot in inventory["employees"]:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", bot["profile"]):
            continue
        folder = home if bot["profile"] == "default" else home / "profiles" / bot["profile"]
        if not folder.resolve().is_relative_to(home):
            raise ValueError("등록한 Hermes 폴더 밖의 프로필은 사용할 수 없습니다.")
        source = folder / ".env"
        if source.is_file():
            match = re.search(r"(?m)^\s*(?:export\s+)?API_SERVER_PORT\s*=\s*['\"]?(\d+)", source.read_text(encoding="utf-8"))
            if match:
                used_ports.add(int(match[1]))
    for employee in inventory["employees"]:
        profile = employee["profile"]
        if selected is not None and profile not in selected:
            continue
        if profile != "default" and not re.fullmatch(r"[A-Za-z0-9_-]+", profile):
            raise ValueError("프로필 이름을 확인하세요.")
        folder = home if profile == "default" else home / "profiles" / profile
        config = config_for(folder)
        for platforms in (config.get("platforms", {}), config.get("gateway", {}).get("platforms", {})):
            if platforms.get("api_server", {}).get("enabled") is False:
                raise ValueError("API를 명시적으로 차단한 기존 설정이 있습니다.")
        envfile = folder / ".env"
        # Do not replace an existing API key/configuration with an assumed setup.
        if re.search(r"(?m)^\s*(?:export\s+)?API_SERVER_(?:KEY|PORT|ENABLED)\s*=", envfile.read_text(encoding="utf-8")):
            raise ValueError("기존 API 설정이 있어 개별 연결 검토가 필요합니다.")
        port = None
        for candidate in range(18642, 18842):
            if candidate in used_ports:
                continue
            try:
                with socket.socket() as probe:
                    probe.bind(("127.0.0.1", candidate))
                port = candidate
                used_ports.add(candidate)
                break
            except OSError:
                continue
        if port is None:
            raise ValueError("사용 가능한 로컬 API 포트를 확인하세요.")
        rows.append(dict(profile=profile, envFile=str(envfile), envSha256=digest(envfile), port=port,
            service="hermes-gateway" + ("" if profile == "default" else "-" + profile) + ".service"))
    result = dict(home=str(home), preparedAt=datetime.now(timezone.utc).isoformat(), profiles=rows,
        changes=["새 로컬 API 키·포트 추가", "공식 업무 이벤트 hook 설치", "기존 8개 gateway 서비스 순차 재시작"], paidCalls=0)
    atomic(data / "prepared-connections" / ("activation-plan-selected.json" if selected is not None else "activation-plan.json"), result)
    return {"profiles": len(rows), "ports": [r["port"] for r in rows], "prepared": True, "paidCalls": 0}


def apply(home, data, profiles=None):
    home, data = Path(home).resolve(), Path(data).resolve()
    prepared = data / "prepared-connections"
    suffix = "-selected" if profiles is not None else ""
    value = json.loads((prepared / ("activation-plan"+suffix+".json")).read_text(encoding="utf-8"))
    if value["home"] != str(home) or os.name == "nt":
        raise ValueError("준비한 Linux 환경에서 실행하세요.")
    rows = value["profiles"]
    if profiles is not None and {r["profile"] for r in rows} != set(profiles):
        raise ValueError("검토한 추가 대상과 적용 대상이 다릅니다.")
    for row in rows:
        profile = row["profile"]
        if profile != "default" and not re.fullmatch(r"[A-Za-z0-9_-]+", profile):
            raise ValueError("프로필 이름이 다릅니다.")
        expected = (home if profile == "default" else home / "profiles" / profile) / ".env"
        target = Path(row["envFile"])
        expected_service = "hermes-gateway" + ("" if profile == "default" else "-" + profile) + ".service"
        if target != expected or row["service"] != expected_service or not target.resolve().is_relative_to(home) or target.is_symlink() or digest(target) != row["envSha256"]:
            raise ValueError("검토 후 원본 설정이 바뀌었습니다. 계획을 다시 준비하세요.")
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", row["port"]))
        destination = target.parent / "hooks/hermes-office"
        if destination.exists() or not destination.resolve().is_relative_to(home) or destination.parent.is_symlink():
            raise ValueError("기존 hook이 있어 덮어쓰지 않았습니다.")
    backups = []
    suffix = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # Backups stay beside each source file; no secrets enter the review report.
    for row in rows:
        target = Path(row["envFile"])
        backup = target.with_name(".env.office-before-" + suffix)
        if backup.exists():
            raise ValueError("같은 이름의 백업이 있습니다.")
        shutil.copy2(target, backup)
        backup.chmod(0o600)
        new = target.read_text(encoding="utf-8").rstrip() + "\n\n# Hermes AI Office local API\nAPI_SERVER_ENABLED=true\nAPI_SERVER_PORT=" + str(row["port"]) + "\nAPI_SERVER_HOST=127.0.0.1\nAPI_SERVER_KEY=" + secrets.token_urlsafe(48) + "\n"
        temporary = target.with_name(".env.office-new")
        temporary.write_text(new, encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(target)
        applied = dict(profile=row["profile"], backup=str(backup), appliedSha256=digest(target), hookInstalled=False, restarted=False)
        backups.append(applied)
        atomic(prepared / ("applied"+suffix+".json"), dict(profiles=backups, paidCalls=0))
        destination = target.parent / "hooks/hermes-office"
        shutil.copytree(prepared / row["profile"], destination)
        applied["hookInstalled"] = True
        atomic(prepared / ("applied"+suffix+".json"), dict(profiles=backups, paidCalls=0))
    for row in rows:
        result = subprocess.run(["systemctl", "--user", "restart", row["service"]], capture_output=True, timeout=90)
        if result.returncode:
            raise ValueError("서비스 재시작 상태를 확인해야 합니다. 백업과 적용 기록이 보존되어 있습니다.")
        next(item for item in backups if item["profile"] == row["profile"])["restarted"] = True
        atomic(prepared / ("applied"+suffix+".json"), dict(profiles=backups, paidCalls=0))
    return {"configured": len(rows), "restarted": len(rows), "paidCalls": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--profiles", nargs="+", help="Only these new profiles; retain previous connections and activation history")
    args = parser.parse_args()
    try:
        print(json.dumps((apply if args.apply else plan)(args.home, args.data, args.profiles), ensure_ascii=False))
    except Exception as error:
        print("연결 적용을 중단했습니다. 검토한 원본·포트·기존 서비스 상태를 확인하세요. " + type(error).__name__)
        raise SystemExit(1)
