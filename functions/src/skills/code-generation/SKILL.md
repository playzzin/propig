---
name: code-generation
description: React/TypeScript 코드를 생성합니다
version: 1.0.0
triggers:
  - "코드"
  - "컴포넌트"
  - "함수"
  - "React"
  - "TypeScript"
  - "구현"
  - "만들어"
  - "생성"
---

## Instructions

이 스킬은 React/TypeScript 프로젝트에서 코드를 생성합니다.

### 지원하는 생성 작업:
1. **React 컴포넌트**: 함수형 컴포넌트, 훅 기반
2. **커스텀 훅**: 재사용 가능한 로직 분리
3. **유틸리티 함수**: 공통 헬퍼 함수
4. **타입 정의**: Zod 스키마 및 TypeScript 인터페이스

### 코딩 규칙:
- TypeScript strict 모드
- any 타입 금지
- Zod로 런타임 검증
- Styled Components 스타일링
- 함수형 컴포넌트만 사용

### 예시 출력:
```typescript
import { z } from 'zod';
import styled from 'styled-components';

const Schema = z.object({
  id: z.string(),
  name: z.string(),
});

type Props = z.infer<typeof Schema>;

export const Component: React.FC<Props> = ({ id, name }) => {
  return <Container>{name}</Container>;
};

const Container = styled.div`
  padding: 16px;
`;
```
