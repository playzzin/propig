"""Read-only Hermes inventory. Credentials stay in memory and are never exported."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from importlib.metadata import distributions
from datetime import datetime, timezone

TOKEN = re.compile(r"\b\d{5,16}:[A-Za-z0-9_-]{20,}\b")
SECRET = re.compile(r"(?i)((?:api[_ -]?key|token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+")


def clean(value, limit=2000):
    text = str(value or "")
    text = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+", "[인증정보 숨김]", text)
    text = TOKEN.sub("[인증정보 숨김]", text)
    text = re.sub(r"\b(?:sk-|xai-)[\w-]{12,}", "[인증정보 숨김]", text)
    return SECRET.sub(r"\1[숨김]", text)[:limit]


def safe_text(path, limit=120000):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def config_for(home):
    try:
        import yaml
        data = yaml.safe_load(safe_text(home / "config.yaml")) or {}
        return data if isinstance(data, dict) else {}
    except (ImportError, ValueError, Exception):
        return {}


def telegram(token, method, payload=None):
    body = json.dumps(payload or {}).encode()
    request = urllib.request.Request("https://api.telegram.org/bot" + token + "/" + method,
                                     data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=12) as response:
        data = json.load(response)
    if not data.get("ok"):
        raise ValueError("Telegram 정보 확인 실패")
    return data["result"]


def read_token(home, config):
    # Read one required field; never serialize a profile's environment or config.
    for line in safe_text(home / ".env").splitlines():
        match = re.match(r"^(?:export\s+)?TELEGRAM_BOT_TOKEN\s*=\s*(.+)$", line.strip())
        if match:
            value = match[1].strip().strip("\"'")
            if TOKEN.fullmatch(value):
                return value
    value = config.get("platforms", {}).get("telegram", {}).get("token", "")
    return value if isinstance(value, str) and TOKEN.fullmatch(value) else ""


def capability(name, kind, description, source, version="", status="설치 확인"):
    return dict(name=clean(name, 120), kind=kind, description=clean(description),
                source=clean(source, 240), version=clean(version, 80), status=status)


def inventory(home: Path, host_id="local", verify=False, assets: Path | None = None, _profiles=None, _runtime_home=None):
    home = home.expanduser().resolve()
    runtime_home = _runtime_home or home
    profiles = _profiles or [("default", home)]
    folder = home / "profiles"
    if _profiles is None and folder.is_dir():
        profiles += [(p.name, p) for p in sorted(folder.iterdir()) if p.is_dir() and not p.is_symlink()]
    if _profiles is None and len(profiles) > 1:
        def scan(item):
            return inventory(item[1], host_id, verify, assets, [item], runtime_home)
        employees, warnings, seen = [], [], set()
        with ThreadPoolExecutor(max_workers=4) as pool:
            for offset in range(0, len(profiles), 4):
                for part in pool.map(scan, profiles[offset:offset+4]):
                    warnings.extend(part["warnings"])
                    for employee in part["employees"]:
                        if employee["botId"] in seen:
                            warnings.append("중복 연결된 봇은 직원 한 명으로 유지합니다.")
                            continue
                        seen.add(employee["botId"])
                        if len(employees) < 100:
                            employees.append(employee)
                if len(employees) == 100:
                    if offset+4 < len(profiles) or len(seen)>100:
                        warnings.append("고유 봇 100명을 확인했습니다. 한도 밖 프로필은 추가 등록하지 않습니다.")
                    break
        at = datetime.now(timezone.utc).isoformat()
        return dict(type="inventory", eventId="inventory-" + hashlib.sha256((host_id + at).encode()).hexdigest(), hostId=host_id, hostName=host_id, at=at, employees=employees, warnings=warnings)
    employees, warnings = [], []
    for name, path in profiles[:101]:
        config = config_for(path)
        token = read_token(path, config)
        if not token:
            warnings.append(clean(name) + ": 텔레그램 연결 정보 미확인")
            continue
        if not verify:
            warnings.append(clean(name) + ": 설정 발견, 봇 신원 확인 필요 (--verify)")
            continue
        try:
            bot = telegram(token, "getMe")
            if not bot.get("is_bot"):
                raise ValueError("봇 계정 아님")
        except Exception:
            warnings.append(clean(name) + ": Telegram 봇 정보 조회 실패 (설정은 변경하지 않았습니다)")
            continue
        bot_id = str(bot["id"])
        avatar = ""
        if assets:
            try:
                photos = telegram(token, "getUserProfilePhotos", {"user_id": bot["id"], "limit": 1})
                if photos.get("photos"):
                    file_id = photos["photos"][0][-1]["file_id"]
                    file = telegram(token, "getFile", {"file_id": file_id})
                    url = "https://api.telegram.org/file/bot" + token + "/" + file["file_path"]
                    with urllib.request.urlopen(url, timeout=12) as response:
                        image = response.read(2_000_001)
                    if len(image) <= 2_000_000 and image[:2] == b"\xff\xd8":
                        assets.mkdir(parents=True, exist_ok=True)
                        (assets / (bot_id + ".jpg")).write_bytes(image)
                        avatar = "/avatars/" + bot_id + ".jpg"
            except Exception:
                warnings.append(clean(name) + ": 프로필 사진 미확인")
        capabilities = []
        skills = path / "skills"
        if skills.is_dir():
            for skill in sorted(skills.glob("*/SKILL.md"))[:300]:
                content = safe_text(skill)
                description = re.search(r"(?m)^description:\s*(.+)$", content)
                capabilities.append(capability(skill.parent.name, "skill",
                    description[1] if description else "설치된 업무 지침. 실행 검증은 별도입니다.", "skills/" + skill.parent.name))
        tools = config.get("toolsets", config.get("tools", []))
        if isinstance(tools, list):
            capabilities += [capability(x, "toolset", "설정에 등록된 도구 모음", "config.yaml", status="설정 확인") for x in tools if isinstance(x, str)]
        mcp = config.get("mcp_servers", {})
        if isinstance(mcp, dict):
            capabilities += [capability(x, "integration", "연결 설정 존재. 실행 여부는 별도 확인이 필요합니다.", "config.yaml") for x in mcp]
        # Only software names/versions, never arguments/env from config.
        manifest = runtime_home / "hermes-agent" / "pyproject.toml"
        text = safe_text(manifest)
        version = re.search(r'(?m)^version\s*=\s*"([^"]+)"', text)
        capabilities.append(capability("Hermes", "runtime", "직원 업무 실행 환경", "pyproject.toml", version[1] if version else "미확인"))
        for package, version_text in re.findall(r'"([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+-]+)"', text)[:120]:
            capabilities.append(capability(package, "library", "실행 환경 선언 의존성. 설치/실행 검증과 다릅니다.", "pyproject.toml", version_text, "선언 확인"))
        sites = list((runtime_home / "hermes-agent").glob("*/lib/python*/site-packages")) + list((runtime_home / "hermes-agent").glob("*/Lib/site-packages"))
        installed = {}
        for distribution in distributions(path=[str(p) for p in sites]):
            name_value = distribution.metadata.get("Name", "")
            if name_value:
                installed[name_value.lower().replace("_", "-")] = (name_value, distribution.version)
        for item in capabilities:
            installed_item = installed.pop(item["name"].lower().replace("_", "-"), None)
            if item["kind"] == "library" and installed_item:
                item.update(version=clean(installed_item[1], 80), status="설치 확인", description="설치된 실행 환경의 패키지 정보 확인. 기능 실행 검증은 별도입니다.")
        for name_value, version_value in sorted(installed.values())[:max(0, 300-len(capabilities))]:
            capabilities.append(capability(name_value, "library", "설치된 실행 환경의 패키지 정보. 기능 실행 검증은 별도입니다.", "site-packages", version_value, "설치 확인"))
        capabilities = capabilities[:300]
        instructions = []
        for filename in ("SOUL.md", "AGENTS.md"):
            content = safe_text(path / filename)
            if content:
                instructions.append(capability(filename, "instruction", content, filename,
                                               hashlib.sha256(content.encode()).hexdigest()[:12], "원문 요약 보기"))
        model = config.get("model", "미확인")
        if isinstance(model, dict):
            model = model.get("default", model.get("name", "미확인"))
        employees.append(dict(botId=bot_id, name=clean(bot.get("first_name", name), 120),
                              username=clean(bot.get("username", ""), 120), avatar=avatar,
                              profile=name, model=clean(model, 160), capabilities=capabilities,
                              instructions=instructions))
    at = datetime.now(timezone.utc).isoformat()
    return dict(type="inventory", eventId="inventory-" + hashlib.sha256((host_id + at).encode()).hexdigest(),
                hostId=host_id, hostName=host_id, at=at, employees=employees, warnings=warnings)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("--host", default="local")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--assets")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        data = inventory(Path(args.home), args.host, args.verify, Path(args.assets) if args.assets else None)
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(target)
        print(json.dumps({"verifiedBots": len(data["employees"]), "warnings": data["warnings"]}, ensure_ascii=False))
    except Exception:
        print("프로필 조회에 실패했습니다. 경로와 읽기 권한을 확인하세요.", file=sys.stderr)
        sys.exit(1)
