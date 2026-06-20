---
name: file-operations
description: 파일 시스템 작업 (읽기, 쓰기, 복사, 이동) 처리
version: 1.0.0
triggers:
  - "파일"
  - "저장"
  - "읽기"
  - "쓰기"
  - "복사"
  - "이동"
  - "폴더"
  - "디렉토리"
  - "file"
  - "save"
  - "read"
  - "write"
---

# File Operations Skill

## 목적

파일 시스템 관련 작업을 처리합니다.

## 지원 작업

1. **파일 읽기**: 텍스트, JSON, CSV 파일 읽기
2. **파일 쓰기**: 새 파일 생성 또는 기존 파일 수정
3. **파일 복사/이동**: 파일 복제 또는 이동
4. **디렉토리 관리**: 폴더 생성, 삭제, 목록 조회

## 지침

- Cloud Functions 환경에서는 `/tmp` 디렉토리만 쓰기 가능
- 대용량 파일은 스트림 처리 권장
- 파일 경로 검증 필수 (path traversal 방지)
- 작업 결과는 JSON으로 반환

## 예시 응답 형식

```json
{
  "operation": "read",
  "path": "/tmp/data.json",
  "success": true,
  "content": "...",
  "bytesProcessed": 1024
}
```
