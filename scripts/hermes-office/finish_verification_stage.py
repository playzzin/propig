"""Validate actual results before accepting the deliberately small verification tasks."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from bounded_verification import action, office, save
from prepare_verification_stage import DATA, MARKER, RULE


def finish(stage):
    plan_path=DATA / ("verify-"+stage+".json")
    plan=json.loads(plan_path.read_text(encoding="utf-8"))
    ledger=json.loads((DATA / ("verification-"+hashlib.sha256(str(plan_path.resolve()).encode()).hexdigest()[:16]+".json")).read_text(encoding="utf-8"))
    assert ledger["state"] == "results-ready" and len(ledger["submitted"]) == plan["maxPaidRuns"]
    assert not any(ledger.get(k) for k in ("ambiguousSubmissions","officeRestorePending","stopConfirmationPending"))
    state=office("/api/state")
    by_id={t["id"]:t for t in state["tasks"]}
    tasks=[by_id[i] for i in plan["taskIds"]]
    for task in tasks:
        assert task["attempts"] == 1 and task["result"].strip() and task["status"] in ("review","approval","completed")
        evidence=next(r for r in ledger["results"] if r["taskId"] == task["id"])
        assert evidence["resultHash"] == hashlib.sha256(task["result"].encode()).hexdigest()
        for dep_id in task["dependencies"]:
            dep=by_id[dep_id]
            snapshots=[s for s in task["dependencySnapshots"] if s["taskId"]==dep_id and s["consumedByAttempt"]==task["executionAttempt"] and not s["stale"]]
            assert len(snapshots)==1 and snapshots[0]["result"]==dep["result"]
            assert datetime.fromisoformat(dep["finishedAt"]) <= datetime.fromisoformat(task["startedAt"])
    if stage=="planning":
        assert any(w.get("sourceTaskId")==tasks[0]["id"] and len(w["steps"])==2 for w in state["workflows"])
        note="실제 AI 계획을 검증하여 두 직원의 2단계 초안으로 가져왔습니다. 연결 검증 기준에 대한 평가입니다."
    elif stage=="collaboration":
        assert len({t["employeeId"] for t in tasks})==2
        assert MARKER in tasks[0]["result"] and MARKER in tasks[1]["result"] and "인계 수신 완료" in tasks[1]["result"]
        assert MARKER not in tasks[1]["request"]+tasks[1]["criteria"]
        note="서로 다른 실제 직원이 한 번씩 실행됐고 선행 결과의 인계번호 수신, 결과 스냅샷과 실행 순서를 확인했습니다. 연결 검증 기준에 대한 평가입니다."
    elif stage=="meeting":
        assert len(tasks)==3 and "의견 A" in tasks[0]["result"] and "의견 B" in tasks[1]["result"]
        assert all(word in tasks[2]["result"] for word in ("의견 A","의견 B","회의 결론:"))
        assert len(tasks[2]["dependencies"])==2
        note="실제 두 참석자 의견이 의장에게 전달됐고 두 의견이 포함된 최종 회의 결론과 인계 근거를 확인했습니다. 연결 검증 기준에 대한 평가입니다."
    else:
        assert all(word in tasks[0]["result"] for word in (RULE,"완료:","근거:","다음 행동:"))
        assert RULE not in tasks[0]["request"]+tasks[0]["criteria"]
        training=next(t for t in state["training"] if t["id"]==plan["trainingId"])
        assert RULE in training["content"]
        if training["status"]=="active":
            action("training.rollback", id=training["id"])
        note="요청에 직접 적지 않은 교육 표식과 보고 항목이 실제 응답에 적용됐습니다. 검증용 교육은 철회하고 이력을 보존했습니다. 일반 업무능력 향상 평가는 아닙니다."
    for task in tasks:
        current=next(t for t in office("/api/state")["tasks"] if t["id"]==task["id"])
        if current["status"]=="review":
            changed=action("task.review",id=current["id"],revision=current["revision"],accepted=True,qualityScore=100,reviewNote=note)
            current=next(t for t in changed["tasks"] if t["id"]==task["id"])
        if current["status"]=="approval":
            action("task.update",id=current["id"],revision=current["revision"],status="completed")
    report=dict(stage=stage,checkedAt=datetime.now(timezone.utc).isoformat(),tasks=len(tasks),paidSubmissions=len(ledger["submitted"]),passed=True,note=note,
        results=[dict(taskId=t["id"],employeeId=t["employeeId"],resultHash=hashlib.sha256(t["result"].encode()).hexdigest(),usage=t["usage"]) for t in tasks])
    save(DATA / ("verified-"+stage+".json"),report)
    return dict(stage=stage,passed=True,tasks=len(tasks))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage",choices=["planning","collaboration","meeting","education"])
    args=parser.parse_args()
    print(json.dumps(finish(args.stage),ensure_ascii=False))
