# 통합 메뉴 관리 시스템 (Advanced Menu Manager)

상업용 레벨의 드래그 앤 드롭 기반 메뉴 관리 시스템입니다.

## 🎯 주요 기능

### 1. **3-Column 레이아웃**
- **Toolbox (좌측)**: 새 메뉴 아이템을 드래그하여 추가
  - 폴더 (하위 메뉴 포함 가능)
  - 링크 (페이지 경로 설정)
  - 구분선 (시각적 구분)

- **Canvas (중앙)**: 메뉴 트리 시각화 및 리오더링
  - 드래그 앤 드롭으로 순서 변경
  - 무한 depth 지원
  - 실시간 미리보기

- **Inspector (우측)**: 선택된 아이템 속성 편집
  - 텍스트, 경로, 아이콘 설정
  - 접근 권한 역할 관리
  - 실시간 업데이트

### 2. **핵심 기능**
- ✅ **Undo/Redo**: 모든 편집 이력 추적 및 되돌리기
- ✅ **다중 사이트 지원**: Admin, User, Partner 사이트별 독립 관리
- ✅ **권한 기반 제어**: 역할별 메뉴 접근 제한
- ✅ **데이터 검증**: Zod 스키마 기반 무결성 보장
- ✅ **LocalStorage 자동 저장**: 데이터 영속성

### 3. **프리미엄 UI/UX**
- 🎨 다크 모드 기반 세련된 디자인
- 💎 Glassmorphism 효과
- 🎭 자연스러운 드래그 애니메이션
- 📱 반응형 레이아웃

## 📦 설치된 패키지

```json
{
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^10.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "@fortawesome/fontawesome-svg-core": "^6.7.2",
  "@fortawesome/free-solid-svg-icons": "^6.7.2",
  "@fortawesome/react-fontawesome": "^0.2.2",
  "zod": "^4.3.6"
}
```

## 🚀 사용 방법

### 1. 컴포넌트 임포트

```tsx
import AdvancedMenuManager from '@/pages/admin/menu/AdvancedMenuManager';

// 페이지에서 사용
export default function MenuManagementPage() {
  return <AdvancedMenuManager />;
}
```

### 2. 라우트 설정

Next.js App Router 구조:
```
src/app/admin/menu/page.tsx
```

```tsx
import AdvancedMenuManager from '@/pages/admin/menu/AdvancedMenuManager';

export default function MenuPage() {
  return <AdvancedMenuManager />;
}
```

### 3. 메뉴 조작

#### 새 메뉴 추가
1. 좌측 Toolbox에서 원하는 도구 선택
2. Canvas로 드래그하여 배치
3. Inspector에서 속성 편집

#### 메뉴 순서 변경
1. Canvas에서 메뉴 아이템 선택
2. 드래그하여 원하는 위치로 이동

#### 메뉴 속성 편집
1. Canvas에서 메뉴 아이템 클릭
2. 우측 Inspector에서 속성 수정:
   - 텍스트
   - 아이콘
   - 경로 (링크 타입)
   - 접근 권한 역할

#### 메뉴 삭제
1. 메뉴 아이템 선택
2. Inspector 상단의 휴지통 버튼 클릭

## 🗂️ 파일 구조

```
src/
├── types/
│   └── menu.ts                          # 데이터 타입 정의
├── schemas/
│   └── menuSchema.ts                    # Zod 스키마 검증
├── services/
│   └── menuService.ts                   # 비즈니스 로직
├── components/admin/menu/
│   ├── Toolbox.tsx                      # 도구 상자 컴포넌트
│   ├── Canvas.tsx                       # 캔버스 컴포넌트
│   ├── Inspector.tsx                    # 속성 편집 패널
│   └── MenuItemNode.tsx                 # 메뉴 아이템 노드
├── pages/admin/menu/
│   └── AdvancedMenuManager.tsx          # 메인 컴포넌트
└── lib/
    └── fontawesome.ts                   # FontAwesome 설정
```

## 💾 데이터 구조

### MenuItem
```typescript
interface MenuItem {
  id: string;
  text: string;
  path?: string;
  icon?: string;
  roles?: string[];
  type?: 'folder' | 'link' | 'divider';
  sub?: (string | MenuItem)[];
  expanded?: boolean;
}
```

### SiteData
```typescript
interface SiteData {
  name: string;
  icon: string;
  menu: MenuItem[];
  trash: MenuItem[];
}
```

## 🎨 커스터마이징

### 아이콘 추가
`src/components/admin/menu/Inspector.tsx` 파일의 `AVAILABLE_ICONS` 배열에 추가:

```typescript
const AVAILABLE_ICONS: IconName[] = [
  'house', 'user', 'gear', 
  // 새 아이콘 추가
  'your-icon-name',
];
```

### 역할 추가
`src/components/admin/menu/Inspector.tsx` 파일의 `AVAILABLE_ROLES` 배열에 추가:

```typescript
const AVAILABLE_ROLES = ['admin', 'user', 'partner', 'guest', 'new-role'];
```

### 사이트 추가
`src/services/menuService.ts` 파일의 `getDefaultData()` 메서드에 새 사이트 추가:

```typescript
private getDefaultData(): SiteDataType {
  return {
    // 기존 사이트들...
    newSite: {
      name: 'New Site',
      icon: 'star',
      menu: [],
      trash: [],
    },
  };
}
```

## 🔧 Firebase 연동 (선택사항)

현재는 LocalStorage를 사용하지만, Firebase로 전환 가능:

```typescript
// src/services/menuService.ts 수정
import { db } from '@/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

async loadAllSites(): Promise<SiteDataType> {
  const docRef = doc(db, 'menus', 'all-sites');
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() as SiteDataType : this.getDefaultData();
}

async saveAllSites(data: SiteDataType): Promise<void> {
  const docRef = doc(db, 'menus', 'all-sites');
  await setDoc(docRef, data);
}
```

## 🎯 바로가기 키

- `Ctrl + Z`: 실행 취소 (Undo)
- `Ctrl + Y`: 다시 실행 (Redo)
- `Ctrl + S`: 저장

## 📝 라이선스

MIT License
