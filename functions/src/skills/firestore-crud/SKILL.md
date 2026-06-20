---
name: firestore-crud
description: Firestore 데이터베이스 CRUD 작업 처리
version: 1.0.0
triggers:
  - "Firestore"
  - "Firebase"
  - "데이터베이스"
  - "DB"
  - "문서"
  - "컬렉션"
  - "저장"
  - "조회"
  - "삭제"
  - "업데이트"
  - "document"
  - "collection"
---

# Firestore CRUD Skill

## 목적

Firebase Firestore 데이터베이스 작업을 처리합니다.

## 지원 작업

1. **Create**: 새 문서 생성 (`addDoc`, `setDoc`)
2. **Read**: 문서 조회 (`getDoc`, `getDocs`)
3. **Update**: 문서 수정 (`updateDoc`)
4. **Delete**: 문서 삭제 (`deleteDoc`)

## 지침

- 컬렉션 경로와 문서 ID를 명확히 지정
- 쿼리 사용 시 인덱스 필요 여부 확인
- 배치 작업은 `writeBatch` 사용
- 트랜잭션은 `runTransaction` 사용

## 보안 고려사항

- Firestore 보안 규칙 준수
- 민감한 데이터 필터링
- 대량 조회 시 페이지네이션 적용

## 예시 응답 형식

```json
{
  "operation": "create",
  "collection": "users",
  "documentId": "abc123",
  "success": true,
  "data": { ... }
}
```
