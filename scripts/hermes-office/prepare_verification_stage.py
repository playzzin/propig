"""Prepare small reviewable live checks; does not invoke any model."""
import argparse
import json
from pathlib import Path
from bounded_verification import action, office, save

DATA = Path(__file__).resolve().parents[2] / "output/hermes-office"
MARKER = "OFFICE-HANDOFF-20260916"
RULE = "[교육적용확인]"


def prepare(stage):
    file = DATA / ("verify-" + stage + ".json")
    if file.exists():
        return dict(stage=stage, existing=True, tasks=len(json.loads(file.read_text(encoding="utf-8"))["taskIds"]))
    state = office("/api/state")
    by_profile = {e["profile"]:e for e in state["employees"]}
    first, second = by_profile["default"]["id"], by_profile["geunyangpig"]["id"]
    if stage == "planning":
        state = action("workflow.plan", name="실운영 검증 · 두 직원 인계", goal=f"외부 도구·검색·파일·메시지 발송 없이 정확히 두 단계로 끝내는 연결 검증입니다. 첫 직원이 인계번호 {MARKER}를 적고, 다른 직원이 선행 결과에서 번호를 읽어 수신 확인을 합니다. 각각 2줄 이내 답변. 첫 단계에는 첫 명부 직원, 두 번째에는 둘째 명부 직원을 배정하세요.", kind="project", employeeIds=[first,second], plannerId=first)
        task=state["tasks"][-1]
        plan=dict(stage=stage, taskIds=[task["id"]], expected="정확히 2단계의 실제 직원 JSON 계획", maxPaidRuns=1)
    elif stage == "collaboration":
        prior=json.loads((DATA / "verify-planning.json").read_text(encoding="utf-8"))
        planning=next(t for t in state["tasks"] if t["id"]==prior["taskIds"][0])
        state=action("workflow.import", taskId=planning["id"])
        workflow=next(w for w in state["workflows"] if w.get("sourceTaskId")==planning["id"])
        if len(workflow["steps"]) != 2:
            raise ValueError("실제 AI 분담안이 2단계인지 검토해야 합니다.")
        steps=workflow["steps"]
        steps[0].update(employeeId=first, stage="인계 작성", title="검증 1 · 인계 자료 작성", request=f"외부 도구·검색·파일·메시지·하위 작업 없이 다음 한 줄만 답하세요: 인계번호: {MARKER}", criteria=f"실제 결과에 {MARKER} 포함", dependencies=[])
        steps[1].update(employeeId=second, stage="인계 확인", title="검증 2 · 다른 직원 결과 수신", request="외부 도구·검색·파일·메시지·하위 작업 없이 선행 직원 결과의 인계번호를 그대로 적고 '인계 수신 완료'라고 한 줄로 답하세요. 번호를 임의로 만들지 마세요.", criteria="선행 결과에서 읽은 인계번호와 인계 수신 완료 포함", dependencies=[steps[0]["id"]])
        state=action("workflow.update", id=workflow["id"], revision=workflow["revision"], steps=steps)
        workflow=next(w for w in state["workflows"] if w["id"]==workflow["id"])
        state=action("workflow.launch", id=workflow["id"], revision=workflow["revision"])
        workflow=next(w for w in state["workflows"] if w["id"]==workflow["id"])
        plan=dict(stage=stage, taskIds=[s["taskId"] for s in workflow["steps"]], workflowId=workflow["id"], expected=MARKER, maxPaidRuns=2)
    elif stage == "meeting":
        state=action("workflow.create", name="실운영 검증 · 짧은 회의", goal="두 의견의 실제 수신과 의장 요약 확인", kind="meeting", employeeIds=[first,second])
        workflow=state["workflows"][-1]
        steps=workflow["steps"]
        steps[0].update(request="외부 도구·검색·파일·메시지·하위 작업 없이 '의견 A: 결과를 검토하고 완료 처리한다.' 한 줄만 답하세요.", criteria="의견 A 포함")
        steps[1].update(request="외부 도구·검색·파일·메시지·하위 작업 없이 '의견 B: 완료 근거를 함께 기록한다.' 한 줄만 답하세요.", criteria="의견 B 포함")
        steps[2].update(request="외부 도구·검색·파일·메시지·하위 작업 없이 전달받은 두 의견을 종합하세요. '의견 A'와 '의견 B'를 모두 언급하고, '회의 결론:'으로 시작하는 3줄 이내의 결론을 작성하세요. 새로운 업무를 실행하지 마세요.", criteria="실제 의견 A와 의견 B를 포함하는 회의 결론")
        state=action("workflow.update", id=workflow["id"], revision=workflow["revision"], steps=steps)
        workflow=next(w for w in state["workflows"] if w["id"]==workflow["id"])
        state=action("workflow.launch", id=workflow["id"], revision=workflow["revision"])
        workflow=next(w for w in state["workflows"] if w["id"]==workflow["id"])
        plan=dict(stage=stage, taskIds=[s["taskId"] for s in workflow["steps"]], workflowId=workflow["id"], maxPaidRuns=3)
    elif stage == "education":
        state=action("record.create", kind="education", employeeId=first, title="실운영 검증용 교육 · 보고 형식", content=f"실습 요청에 '교육 형식 점검'이 있으면 첫 줄에 {RULE}를 적고, 다음 세 줄은 '완료:', '근거:', '다음 행동:'으로 시작합니다. 짧은 연결 점검이므로 외부 도구·파일·검색·메시지·하위 작업을 사용하지 않습니다.", evidence="보고 형식의 적용·철회 연결을 확인하기 위한 검증용 규칙입니다. 교육 효과는 실제 실습 결과에서 별도로 평가합니다.")
        record=state["records"][-1]
        action("record.update", id=record["id"], revision=record["revision"], status="verified")
        state=action("training.apply", recordId=record["id"], employeeId=first)
        training=state["training"][-1]
        state=action("task.create", employeeId=first, stage="education", title="실운영 검증 · 교육 형식 실습", request="교육 형식 점검: 교육에 지정된 보고 형식으로 이번 연결 점검 완료를 4줄 이내로 보고하세요. 외부 도구·파일·검색·메시지·하위 작업은 사용하지 마세요.", criteria="적용된 교육 자료의 표식과 보고 항목이 포함된 결과")
        plan=dict(stage=stage, taskIds=[state["tasks"][-1]["id"]], trainingId=training["id"], recordId=record["id"], maxPaidRuns=1)
    else:
        raise ValueError("지원하지 않는 검증 단계")
    save(file, plan)
    return dict(stage=stage, prepared=True, tasks=len(plan["taskIds"]), maxPaidRuns=plan["maxPaidRuns"])


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["planning", "collaboration", "meeting", "education"])
    args=parser.parse_args()
    print(json.dumps(prepare(args.stage), ensure_ascii=False))
