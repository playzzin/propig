---
name: data-analysis
description: 데이터 분석 및 Excel/CSV 처리를 수행합니다
version: 1.0.0
triggers:
  - "엑셀"
  - "Excel"
  - "CSV"
  - "데이터"
  - "분석"
  - "통계"
  - "차트"
  - "그래프"
  - "집계"
---

## Instructions

이 스킬은 데이터 분석 및 스프레드시트 처리를 담당합니다.

### 지원하는 작업:
1. **파일 읽기**: Excel (.xlsx), CSV 파일 파싱
2. **데이터 변환**: 필터링, 정렬, 피벗
3. **통계 분석**: 합계, 평균, 그룹별 집계
4. **차트 생성**: 라인, 바, 파이 차트

### 사용 라이브러리:
- ExcelJS: Excel 파일 읽기/쓰기
- date-fns: 날짜 처리
- Recharts: 차트 시각화

### 출력 형식:
```json
{
  "summary": "분석 결과 요약",
  "rowCount": 100,
  "columns": ["A", "B", "C"],
  "statistics": {
    "total": 1000,
    "average": 10
  },
  "data": [...]
}
```
