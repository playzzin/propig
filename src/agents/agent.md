# 에이전트 운영 지침 (Propig Agent Guidelines)

본 문서는 `Propig` 프로젝트(스마트 북마크 및 대시보드 플랫폼) 내에서 동작하는 모든 AI 에이전트(Orchestrator, IDE Assistant)를 위한 통합 운영 지침입니다.

## 1. 아키텍처 및 역할 (3-Layer Architecture)
우리는 신뢰성과 자가 치유(Self-healing)를 보장하기 위해 역할이 분리된 계층형 구조를 따릅니다.

### 제1계층: 지시 (Directive - 의도 정의)
사용자의 요구사항(Prompt) 또는 `.agent/workflows/`에 정의된 절차서입니다.
- **입력:** 사용자 발화 (`inputs.userInput`), Task 정의서
- **특징:** 무엇을(What) 할지만 정의하며, 어떻게(How)는 하위 계층에 위임합니다.

### 제2계층: 오케스트레이션 (Orchestration - 의사결정 및 관리)
**담당: `src/agents/Orchestrator.ts`**
- 중앙 관리자로서 하위 에이전트(Planner, Code, Review)를 조율합니다.
- **책임:**
  - **라우팅:** 적절한 하위 에이전트 호출 (Analyzer -> Planner -> Code)
  - **자가 치유 (Self-healing):** 실행 실패 또는 리뷰 불통과 시 `FixAgent`를 호출하여 재시도 루프(Reflexion Loop) 실행
  - **안정성:** Zod Schema를 통한 입출력 타입 검증, Timeout 및 Backoff 처리

### 제3계층: 실행 (Execution - 실제 작업)
**담당: `CodeAgent`, `Firebase Functions`, `Frontend Components`**
- 결정론적이고 안정한 TypeScript 코드로 동작합니다.
- Python 스크립트 대신 **TypeSctipt Class**와 **Firebase Cloud Functions**가 실행 단위가 됩니다.
- **원칙:** Side Effect를 최소화하고, 모든 데이터는 Zod로 검증합니다.

---

## 2. 기술 스택 및 코딩 원칙 (Operating Principles)

### 핵심 기술 스택
- **Runtime:** TypeScript (Interface가 아닌 Type 사용 권장)
- **Framework:** Next.js (React 18), Create React App 구조 호환
- **Backend:** Firebase v9+ (Firestore, Cloud Functions, Storage)
- **Validation:** Zod (모든 LLM 출력 및 API 입력 검증 필수)

### 운영 원칙
1. **결정론적 코드 우선 (Deterministic over Probabilistic)**
   - LLM은 로직을 *생성*하는 데만 사용하고, 실제 *실행*은 강력하게 타이핑된 TypeScript 코드로 수행합니다.
   - 예: "데이터를 분석해줘" -> LLM이 분석 코드를 짤 수는 있지만, 실제 분석은 `countBy` 같은 유틸리티 함수나 SQL/Query로 수행해야 함.

2. **자가 어닐링 (Self-annealing / Self-healing)**
   - `Orchestrator`는 결과물을 맹목적으로 믿지 않습니다.
   - `ReviewAgent`를 통해 코드 품질을 검사하고, 미달 시 `FixAgent`를 호출하는 **Healer Loop**가 반드시 돌아가야 합니다.
   - 에러 발생 시 로그를 분석하고(Analyze), 계획을 수정하여(Plan), 다시 시도(Retry) 합니다.

3. **명시적 타입 정의**
   - `noImplicitAny` 준수. 모든 에이전트 간 통신은 `schemas.ts`에 정의된 Zod Schema를 따릅니다.

---

## 3. 파일 및 리소스 구조

- **`src/agents/`**: 에이전트 핵심 로직 (Orchestrator, Code, Planner 등)
- **`src/agents/schemas.ts`**: 에이전트 간 통신 프로토콜 (Zod Schemas)
- **`functions/src/`**: 백엔드 로직 (Serverless Functions)
- **`src/firebase/`**: Firebase 초기화 및 설정

## 4. 에이전트 행동 지침 (Behavioral Instructions)

1. **상태 보존**: 대화 맥락이 끊기더라도 `task.md`나 Firestore 상태를 통해 작업을 재개할 수 있어야 합니다.
2. **검증된 출력**: 코드를 생성할 때 Markdown Block(`` ``` ``)을 제거하고 순수 코드만 반환하거나, 파싱 로직을 포함해야 합니다.
3. **사용자 피드백**: 치명적인 변경(삭제, 과금 발생 등) 전에는 반드시 `PLANNING` 단계에서 사용자 승인을 받습니다.

---
*이 문서는 `CLAUDE.md`, `AGENTS.md`와 동기화되어 프로젝트 내 모든 AI 주체가 동일한 컨텍스트를 공유하도록 합니다.*