# 엔터프라이즈급 동적 메뉴 시스템 (Enterprise Dynamic Menu System)

데이터 기반 동적 메뉴 렌더링, 권한 제어, 직책별 필터링을 지원하는 확장 가능한 메뉴 시스템입니다.

## 🎯 핵심 기능

### 1. **Data-Driven 아키텍처**
- JSON 기반 동적 렌더링
- 재귀적 메뉴 구조 지원 (무한 depth)
- 실시간 메뉴 업데이트 (Subscribe 패턴)
- Normalization 로직

### 2. **3-Step 필터링 시스템**
- **Site Context**: 관리/기업/이커머스 모드 전환
- **Position Override**: 대표/팀장/사원/인턴 직책별 메뉴
- **Role-Based Visibility**: 세밀한 권한 제어

### 3. **프리미엄 UI/UX**
- Collapsible Sidebar (접기/펴기)
- 다중 Depth 아코디언 메뉴
- Active State 자동 추적
- Breadcrumb 네비게이션
- Skeleton UI 로딩 상태

## 📦 아키텍처

```
src/
├── types/
│   └── menu.ts                    # 타입 정의
├── schemas/
│   └── menuSchema.ts              # Zod 검증
├── services/
│   └── menuService.ts             # 비즈니스 로직 + Subscribe
├── hooks/
│   └── useMenu.ts                 # 필터링 로직 훅
├── contexts/
│   └── MenuContext.tsx            # 전역 상태 관리
└── components/layout/
    ├── DashboardLayout.tsx        # 메인 레이아웃
    ├── DynamicSidebar.tsx         # LNB (Left Navigation Bar)
    ├── DynamicHeader.tsx          # GNB (Global Navigation Bar)
    └── PositionPanel.tsx          # 직책 전환 패널
```

## 🚀 사용 방법

### 1. 기본 설정

레이아웃을 적용할 페이지에서 `DashboardLayout`을 래핑합니다.

```tsx
// src/app/layout.tsx
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DashboardLayout>
          {children}
        </DashboardLayout>
      </body>
    </html>
  );
}
```

### 2. 메뉴 데이터 구조

```typescript
// src/services/menuService.ts
{
  admin: {
    name: '통합 관리',
    icon: 'shield-halved',
    color: '#10b981',
    positions: ['ceo', 'manager', 'staff'],
    menu: [
      {
        id: 'admin-1',
        text: '시스템 대시보드',
        path: '/',
        icon: 'chart-line',
        type: 'link',
        roles: ['admin'],
        position: ['ceo', 'manager', 'staff'],
      },
      {
        id: 'admin-2',
        text: '스티커 메모',
        path: '/sticky-notes',
        icon: 'note-sticky',
        type: 'link',
        roles: ['admin', 'user'],
        position: ['manager', 'staff'],
        badge: 'NEW',
      },
      // ... more items
    ],
    trash: [],
  },
}
```

### 3. 커스텀 훅 사용

```tsx
import { useMenu } from '@/hooks/useMenu';

function MyComponent() {
  const { 
    filteredMenu, 
    isLoading, 
    activePath,
    expandedItems,
    toggleExpand
  } = useMenu({
    siteId: 'admin',
    userRole: 'admin',
    position: 'manager'
  });

  return (
    <div>
      {filteredMenu.map(item => (
        <MenuItem key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### 4. Context API 사용

```tsx
import { useMenuContext } from '@/contexts/MenuContext';

function SiteSwitcher() {
  const { currentSite, setCurrentSite } = useMenuContext();

  return (
    <button onClick={() => setCurrentSite('corp')}>
      기업 관리로 전환
    </button>
  );
}
```

## 🔧 주요 컴포넌트

### DashboardLayout
메인 레이아웃 컨테이너

```tsx
<DashboardLayout>
  {/* 페이지 콘텐츠 */}
</DashboardLayout>
```

### DynamicSidebar
동적으로 생성되는 사이드바 (LNB)

**기능:**
- 접기/펴기 애니메이션
- 재귀적 메뉴 렌더링
- Active 상태 하이라이트
- 배지 표시

### DynamicHeader
상단 헤더 (GNB)

**기능:**
- 사이트 전환 탭
- Breadcrumb 네비게이션
- 직책 전환 버튼
- 알림/설정 아이콘

### PositionPanel
직책 전환 오버레이

**기능:**
- 대표/팀장/사원/인턴 선택
- 실시간 메뉴 업데이트
- 권한 설명 표시

## 🎨 UI 커스터마이징

### 색상 테마

각 사이트별로 Primary Color를 설정할 수 있습니다:

```typescript
const siteConfigs = {
  admin: { color: '#10b981' },  // Emerald
  corp: { color: '#6366f1' },   // Indigo
  shop: { color: '#f59e0b' },   // Amber
};
```

### 아이콘 변경

FontAwesome 아이콘을 사용합니다:

```typescript
{
  icon: 'chart-line',  // FontAwesome icon name
}
```

## 📊 필터링 로직

### 3-Step 필터링

```typescript
// 1. Site Context
const menu = siteData[siteId].menu;

// 2. Role-Based
const hasRoleAccess = !item.roles || item.roles.includes(userRole);

// 3. Position-Based
const hasPositionAccess = !item.position || item.position.includes(position);
```

### 재귀적 필터링

하위 메뉴도 동일한 권한 로직을 적용합니다:

```typescript
const filterMenuByPermissions = (items: MenuItem[]): MenuItem[] => {
  return items
    .filter(item => hasAccess(item))
    .map(item => {
      if (item.sub) {
        return {
          ...item,
          sub: filterMenuByPermissions(item.sub)
        };
      }
      return item;
    });
};
```

## 🔄 실시간 업데이트

### Subscribe 패턴

```typescript
// menuService.ts
subscribeToMenuChanges(siteId, (data) => {
  // 메뉴 데이터가 변경되면 자동 업데이트
  updateMenu(data);
});
```

### 사용 예시

```typescript
useEffect(() => {
  const unsubscribe = menuService.subscribeToMenuChanges('admin', (data) => {
    setSiteData(prev => ({
      ...prev,
      admin: data
    }));
  });

  return () => unsubscribe();
}, []);
```

## 🎯 직책별 메뉴 접근 예시

### CEO (대표이사)
- ✅ 시스템 대시보드
- ✅ AI 이미지 생성기
- ✅ 통합 메뉴 관리
- ✅ 모든 메뉴

### Manager (팀장)
- ✅ 시스템 대시보드
- ✅ 스티커 메모
- ✅ 스마트 북마크
- ✅ 만다라트
- ✅ AI 이미지 생성기
- ❌ 통합 메뉴 관리

### Staff (사원)
- ✅ 시스템 대시보드
- ✅ 스티커 메모
- ✅ 스마트 북마크
- ✅ YouTube 분석
- ✅ 만다라트
- ❌ AI 이미지 생성기
- ❌ 통합 메뉴 관리

## 🔌 Firebase 연동

LocalStorage 대신 Firestore를 사용하려면:

```typescript
// src/services/menuService.ts
import { db } from '@/firebase/config';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

subscribeToMenuChanges(siteId: string, callback: (data: SiteData) => void) {
  const docRef = doc(db, 'menus', siteId);
  
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as SiteData);
    }
  });
}
```

## 📱 반응형 디자인

### Desktop
- Sidebar: 64rem (256px) 고정
- Collapsed: 5rem (80px)

### Tablet
- Sidebar: 자동 축소
- Drawer 형태로 전환

### Mobile
- Bottom Sheet로 표시
- 햄버거 메뉴

## 🎭 애니메이션

### Sidebar 전환
```css
transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
```

### 메뉴 아이템 호버
```css
transition: all 150ms ease-in-out;
```

### Accordion 펼치기
```css
transition: height 200ms ease-out;
```

## 🐛 디버깅

### 메뉴가 표시되지 않을 때

1. 권한 확인:
```typescript
console.log('User Role:', userRole);
console.log('Position:', position);
console.log('Item Roles:', item.roles);
console.log('Item Position:', item.position);
```

2. 데이터 검증:
```typescript
const isValid = validateMenu(menu);
console.log('Menu Valid:', isValid);
```

3. 필터링 결과:
```typescript
console.log('Filtered Menu:', filteredMenu);
```

## 📝 라이선스

MIT License
