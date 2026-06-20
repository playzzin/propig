---
name: web-scraping
description: 웹 페이지에서 데이터를 추출합니다
version: 1.0.0
triggers:
  - "웹사이트"
  - "스크래핑"
  - "크롤링"
  - "URL"
  - "페이지 정보"
  - "사이트에서"
  - "웹에서"
---

## Instructions

이 스킬은 웹 페이지에서 데이터를 추출하는 작업을 수행합니다.

### 사용 가능한 작업:
1. **메타데이터 추출**: 페이지 제목, 설명, OG 태그
2. **콘텐츠 추출**: 본문 텍스트, 이미지 목록
3. **구조 분석**: 헤딩 구조, 링크 목록

### 주의사항:
- robots.txt를 존중합니다
- 과도한 요청을 피합니다
- JavaScript 렌더링 필요 시 Puppeteer 사용

### 출력 형식:
```json
{
  "url": "https://example.com",
  "title": "페이지 제목",
  "description": "페이지 설명",
  "content": "본문 내용...",
  "links": ["url1", "url2"],
  "images": ["img1", "img2"]
}
```
