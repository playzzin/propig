---
name: translation
description: 다국어 번역 처리 (한국어, 영어, 일본어, 중국어 등)
version: 1.0.0
triggers:
  - "번역"
  - "translate"
  - "영어로"
  - "한국어로"
  - "일본어로"
  - "중국어로"
  - "English"
  - "Korean"
  - "Japanese"
  - "Chinese"
  - "통역"
---

# Translation Skill

## 목적

다양한 언어 간 텍스트 번역을 처리합니다.

## 지원 언어

- 한국어 (ko)
- 영어 (en)
- 일본어 (ja)
- 중국어 간체 (zh-CN)
- 중국어 번체 (zh-TW)
- 스페인어 (es)
- 프랑스어 (fr)
- 독일어 (de)

## 번역 모드

1. **직역**: 원문에 가깝게 번역
2. **의역**: 자연스러운 표현으로 번역
3. **전문 용어 유지**: 기술 문서용
4. **캐주얼**: 일상 대화체

## 지침

- 원문 언어 자동 감지
- 전문 용어는 괄호 안에 원어 병기
- 문화적 맥락 고려
- 높임말/반말 구분 (한국어)

## 예시 응답 형식

```json
{
  "sourceLanguage": "en",
  "targetLanguage": "ko",
  "originalText": "Hello, world!",
  "translatedText": "안녕하세요, 세계!",
  "mode": "natural"
}
```
