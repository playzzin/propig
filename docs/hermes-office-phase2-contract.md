# PC 회사 기능 확장 계약

범위: VPS를 제외한 업무 실행 준비, 협업, 자동 입사, 공간, 성과, 교육. root는 서버/연결/worker/통합 검증 소유. security는 store.py/test_store.py, admin은 Office UI/types/client/CSS, qa는 별도 확장 테스트만 소유한다. 기존 데이터 마이그레이션은 비파괴 기본값으로 한다. 실제 모델 실행은 비용 승인을 받기 전 켜지 않는다.

## 공유 상태 확장

- tasks: optional workflowId, stage(role), dependencyPolicy('completed'|'result'), startedAt, finishedAt, attempts, reworkCount, qualityScore(number|null), reviewNote, usage{inputTokens,outputTokens,costUsd:number|null}; 구버전 데이터 기본값 보완.
- workflows: id,name,goal,kind('project'|'meeting'),status('draft'|'active'|'completed'|'cancelled'),projectId,createdAt,revision,steps[{id,title,request,employeeId,criteria,dependencies:string[],taskId,stage}]. 단계 최대 20, 회의 최대 10명+의장 요약 1회. 순환·타인/비활성 직원·중복 불허.
- training: id,recordId,employeeId,content,evidence,status('active'|'rolled_back'),createdAt,rolledBackAt,version. apply는 verified 교육/지식의 당시 내용 snapshot만 사용, 원본 Hermes 지침 변경 없음.
- rooms: id,name,kind('work'|'meeting'|'training'|'lounge'|'awards'),floor(0..3),x,y,width,height (모두 0..100, 방 경계 이탈 금지). 빈 명부에서도 기본 공용 공간 제공.
- settings 추가: autoDiscover:boolean(default true), discoveryIntervalMinutes(5..1440 default 10), dispatchPaused:boolean(default true), dailyRunLimit(1..1000 default 20), taskTimeoutMinutes(1..240 default 20).
- employees 추가 optional revision(기본1), accessory('none'|'glasses'|'headset'|'tie'), joinedAt(default createdAt).

## actions

- workflow.create: name,goal,kind,employeeIds (순서대로 역할 분담하는 기본 계획 생성), optional template('research'|'delivery'|'development'|'meeting'). 업무 분해는 검토 가능한 규칙 기반 초안이며 LLM 계획이라고 표시하지 않는다.
- workflow.update: id,revision,steps (실행 전만). 자유 단계 수정/담당자/완료 조건/선행 단계.
- workflow.plan: name,goal,kind,employeeIds,plannerId. 실제 직원에게 분담안 작성 업무를 배정한다. 선택한 직원 범위와 최대 10단계 JSON 형식을 요청한다.
- workflow.import: taskId. 실제 planning 결과의 형식·직원 범위·순환 관계를 검증하여 초안으로만 가져온다. 자동 실행하거나 중복 계획을 만들지 않는다.
- workflow.launch: id,revision. 초안 전체를 원자적으로 실제 대기 업무로 등록. 선행 단계는 dependencyPolicy=result: 실제 결과가 있는 review/approval/completed 단계만 통과. 자동으로 완료 승인하지 않는다.
- workflow.cancel: id,revision. 대기는 취소, 실행은 cancel_requested. 기록 보존.
- task.review: id,revision,qualityScore(0..100),reviewNote(required),accepted:boolean. 검토 점수와 근거, 반려시 queued+reworkCount 증가. approved 업무만 completed 가능(기존 전환 호환).
- training.apply: recordId,employeeId. verified 교육/지식, 직원 범위 적합·근거 필수. 동일 직원/동일 record 활성 중복 불가.
- training.rollback: id. 적용 버전만 철회, 이력 보존.
- room.save: id?(신규),name,kind,floor,x,y,width,height. room.delete: id.
- seat.swap: employeeId,targetSeat. 양방향 원자 변경. 배치 UI는 클릭·키보드로도 가능.
- settings.update: 기존+위 추가 항목.
- settings.update의 optional executionScope: null 또는 {taskIds,expiresAt}. 한시 검증에 한해 Office 업무 1~7개·1시간 이내로 제한. 범위가 있으면 목록 밖·기존 시도·만료 claim을 서버에서 거절한다. 만료를 범위 해제로 취급하지 않는다.
- employee.update: 기존+revision(optional 기존 호환),accessory.

## 이벤트/실행 계약

- ingest에 runtime:status 지원: eventId,hostId,botId,at,status('ready'|'offline'|'error'),summary. employees.runtime{status,lastSeen,summary} 갱신. 관찰 heartbeat와 실행 준비를 구별.
- agent 이벤트 optional stage,usage{inputTokens,outputTokens,costUsd}, telemetrySource('hook'|'observer'|'worker'). 출처를 task에 기록. 입력 숫자는 유한 비음수. 결과 없이는 성공/비용값을 추정하지 않는다.
- 이벤트의 stage는 task.activity에 저장하여 업무 역할인 task.stage를 덮어쓰지 않는다. task.runId로 Office claim 응답 유실을 조정한다.
- UI는 task.activity를 보존한다. 현재 대기 중인 입력이 input_wait로 확인되면 원래 running 상태를 유지하면서 답변 대기·대표 확인함을 표시하고 타이핑 연출을 멈춘다. 다음 단계·종료 이벤트가 오면 해제된다. 반환 후의 clarify 도구명만으로 다시 대기로 추정하지 않는다.
- 일부 설치 버전은 도구 반환 뒤에 step 이벤트를 전달한다. 관찰기는 살아 있는 hook의 기존 활성 run과 Telegram 최신 메시지의 clarify 도구명만 대조하여 input_wait/processing을 보완한다. 질문·인자·답변 내용은 보완 이벤트에 복사하지 않는다. existingRunOnly=true인 step은 기존 run이 없으면 거절하고 종료된 run은 변경하지 않는다.
- 재작업 결과는 resultVersions에 보존하고, dependencySnapshots에 실제 사용한 결과 버전을 기록한다. 선행 근거가 바뀌면 dependencyStale로 표시하고 완료된 후속 결과도 재작업할 수 있다.
- 실행별 누적 usage를 합치므로 같은 값의 반복 보고로 비용을 두 번 더하지 않는다. 중지 요청은 실제 종료 확인 전까지 실행 중 자리를 유지한다.
- 실행 작업을 선택할 때 source office + queued만, dispatchPaused=false, 일일 실행 제한/동시 제한/직원 활성/선행 조건을 서버 원자 claim에서 검증. 기존 worker 회귀 테스트는 settings 명시 준비. 수동 blocked는 실행하지 않는다.
- 평가 집계는 UI에서 저장된 실제 시각/점수/재작업/usage를 계산. 미수집 비용은 미수집으로 표시. 포상/피드백/승진 제안은 근거 연결, 실제 원본 권한 변경 없음.

## UX 및 확인

기존 8개 메뉴 보존. 프로젝트에 협업/회의 계획 편집과 실행 등록. 사무실에는 방 배치 편집, 상태에 따른 이동/타이핑/회의/교육/시상 연출, 프로필 얼굴/꾸미기. 연출과 실제 실행 데이터 구분, 오프라인 캐릭터 작업 금지, reduced-motion. 교육에는 검증→적용→되돌리기. 설정에는 관찰/실행 상태와 자동 명부 갱신, 실행 일시정지/회수·시간 제한. desktop/mobile/100명/재시작/동시 수정/중복 비용 방지 검증.
