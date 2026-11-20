"""Inspect existing local Hermes APIs and prepare reviewable hook packages.

Default: only writes office-owned preparation files. --apply-hooks explicitly
installs new hook files and never changes .env/config or restarts a gateway.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import urllib.request
from discover import config_for, safe_text


def atomic(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def sync_monitor_config(data, candidates):
    """Append verified connections for observation, never enable paid execution."""
    from runtime_pool import validate
    target = data / "workers.json"
    current = json.loads(target.read_text(encoding="utf-8")) if target.exists() else dict(office="http://127.0.0.1:3010", workers=[])
    entries = validate(current)
    current["workers"] = entries
    by_id = {e["employeeId"]: e for e in entries}
    added = 0
    for candidate in candidates:
        if candidate["employeeId"] not in by_id:
            entry = dict(candidate, enabled=False, monitor=True)
            entries.append(entry)
            by_id[entry["employeeId"]] = entry
            added += 1
    validate(current)
    if added:
        atomic(target, current)
    return added


def prepare(home, data, apply_hooks=False, profiles=None, sync_monitor=False):
    home, data = Path(home).resolve(), Path(data).resolve()
    inventory = json.loads((data / "inventory.json").read_text(encoding="utf-8"))
    selected = set(profiles) if profiles is not None else None
    if selected is not None and (not selected or not selected <= {e["profile"] for e in inventory["employees"]} or any(not re.fullmatch(r"[A-Za-z0-9_-]+", p) for p in selected)):
        raise ValueError("명부에 있는 추가 대상 프로필을 지정하세요.")
    # Employee ids originate from the office, bot identities from verified inventory.
    employees = {e["botId"]: e for e in json.loads((data / "roster-index.json").read_text(encoding="utf-8-sig"))}
    prepared = data / "prepared-connections"
    prepared.mkdir(exist_ok=True)
    source = Path(__file__).resolve().parent
    workers, status, hook_plans = [], [], []
    for bot in inventory["employees"]:
        profile = bot["profile"]
        if selected is not None and profile not in selected:
            continue
        if profile != "default" and not re.fullmatch(r"[A-Za-z0-9_-]+", profile):
            continue
        folder = home if profile == "default" else home / "profiles" / profile
        values = {}
        for line in safe_text(folder / ".env").splitlines():
            name, found, value = line.strip().removeprefix("export ").partition("=")
            if found and name.strip() in {"API_SERVER_KEY", "API_SERVER_ENABLED", "API_SERVER_PORT"}:
                values[name.strip()] = value.strip().strip("\"'")
        port = values.get("API_SERVER_PORT", "8642")
        api_ready = False
        key = values.get("API_SERVER_KEY", "")
        if key and port.isdigit() and 1024 <= int(port) <= 65535:
            endpoint = "http://127.0.0.1:" + port
            try:
                request = urllib.request.Request(endpoint + "/v1/models", headers={"Authorization": "Bearer " + key})
                with urllib.request.urlopen(request, timeout=2) as response:
                    model = json.load(response)
                alias = "hermes-agent" if profile == "default" else profile
                api_ready = alias in {m.get("id") for m in model.get("data", []) if isinstance(m, dict)}
                if api_ready and bot["botId"] in employees:
                    workers.append(dict(employeeId=employees[bot["botId"]]["id"], profile=profile, endpoint=endpoint, keyFile=str(folder / ".env"), keyField="API_SERVER_KEY", enabled=False))
            except Exception:
                pass
        destination = folder / "hooks" / "hermes-office"
        package = prepared / profile
        package.mkdir(exist_ok=True)
        covered = [profile]
        config = config_for(folder)
        multiplex = config.get("gateway", {}).get("multiplex_profiles", False)
        if profile == "default" and multiplex:
            covered = [b["profile"] for b in inventory["employees"]]
        hook_config = dict(home=str(home), data=str(data), profile=profile, coveredProfiles=covered)
        atomic(package / "office-hook.json", hook_config)
        (package / "HOOK.yaml").write_text("name: hermes-office\ndescription: Local AI Office activity recorder\nevents:\n  - gateway:startup\n  - agent:start\n  - agent:step\n  - agent:end\n", encoding="utf-8")
        # repr is Python literal quoting; paths never become shell code.
        wrapper = "from pathlib import Path\nimport sys\nsys.path.insert(0, " + repr(str(source)) + ")\nfrom gateway_hook import handle as record\n\ndef handle(event_type, context):\n    record(event_type, context, Path(__file__).with_name('office-hook.json'))\n"
        (package / "handler.py").write_text(wrapper, encoding="utf-8")
        installed = destination.is_dir() and not destination.is_symlink() and all(
            (destination / n).is_file() and (destination / n).read_bytes() == (package / n).read_bytes()
            for n in ("HOOK.yaml", "handler.py", "office-hook.json"))
        if apply_hooks:
            resolved = destination.resolve()
            if not resolved.is_relative_to(home) or destination.is_symlink():
                raise ValueError("설치 경계가 다릅니다.")
            if destination.exists():
                if any(not (destination / n).is_file() or (destination / n).read_bytes() != (package / n).read_bytes() for n in ("HOOK.yaml", "handler.py", "office-hook.json")):
                    raise ValueError("기존 hook 파일이 있어 덮어쓰지 않았습니다.")
            else:
                shutil.copytree(package, destination)
            installed = True
        hook_plans.append(dict(profile=profile, destination=str(destination), installed=installed,
            sha256=hashlib.sha256(wrapper.encode()).hexdigest()))
        status.append(dict(profile=profile, apiConfigured=bool(key), apiReady=api_ready, hookInstalled=installed))
    # Never overwrite an operator-enabled pool configuration.
    suffix = "-selected" if selected is not None else ""
    atomic(prepared / ("workers"+suffix+".candidate.json"), dict(office="http://127.0.0.1:3010", workers=workers))
    atomic(prepared / ("connection-report"+suffix+".json"), dict(profiles=status, hooks=hook_plans, executionEnabled=False))
    added = sync_monitor_config(data, workers) if sync_monitor else 0
    return dict(profiles=len(status), existingApis=sum(s["apiReady"] for s in status), preparedHooks=len(hook_plans), installedHooks=sum(s["installed"] for s in hook_plans), monitorConnectionsAdded=added, executionEnabled=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--apply-hooks", action="store_true")
    parser.add_argument("--profiles", nargs="+", help="Only these verified profiles; existing other hooks are untouched")
    parser.add_argument("--sync-monitor", action="store_true", help="Append missing verified API connections with execution disabled")
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.home, args.data, args.apply_hooks, args.profiles, args.sync_monitor), ensure_ascii=False))
    except Exception as error:
        import traceback
        frames = traceback.extract_tb(error.__traceback__)
        print("준비를 마치지 못했습니다. 설치 경로·로컬 사무실 연결·기존 hook을 확인하세요. " + type(error).__name__ + " · " + ", ".join(str(f.lineno) for f in frames), file=sys.stderr)
        sys.exit(1)
