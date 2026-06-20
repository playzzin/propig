# Smart Bookmarks - AI 기반 북마크 관리자

## 📋 개요

Smart Bookmarks는 Gemini API를 활용한 상용화급 북마크 관리 애플리케이션입니다. 링크를 복사하기만 하면 자동으로 메타데이터를 추출하여 북마크를 생성해줍니다.

## ✨ 주요 기능

### 🚀 자동 북마크 생성
- 클립보드 모니터링으로 URL 복사만으로 자동 생성
- Gemini API가 웹페이지 메타데이터 자동 추출
- 제목, 설명, 태그, 파비콘 자동 수집

### 🎯 드래그 앤 드롭
- 직관적인 드래그 앤 드롭으로 북마크 정렬
- 키보드 네비게이션 지원
- 부드러운 애니메이션 효과

### 🔍 검색 및 필터
- 실시간 검색 기능
- 폴더별 필터링
- 태그 기반 검색

### 📁 폴더 관리
- Work, Personal, Research 등 기본 폴더 제공
- 커스텀 폴더 생성 가능
- 색상 코드 지원

### 🌐 PWA 지원
- 오프라인 모드 지원
- 백그라운드 동기화
- 설치형 앱으로 사용 가능

## 🛠️ 기술 스택

### Frontend
- **React 19** - UI 라이브러리
- **TypeScript 5.6** - 타입 안전성
- **Next.js 16** - 풀스택 프레임워크
- **Styled Components v6** - 스타일링
- **dnd-kit** - 드래그 앤 드롭
- **Zod** - 데이터 검증

### Backend
- **Firebase v12**
  - Firestore - 데이터베이스
  - Authentication - 인증
  - Functions - 서버리스 함수
  - Storage - 파일 저장

### AI
- **Google Gemini API** - 메타데이터 추출
- **URL Context** - 웹페이지 분석

## 📦 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. Firebase 설정
```bash
# Firebase CLI 설치
npm install -g firebase-tools

# Firebase 로그인
firebase login

# 프로젝트 초기화
firebase init functions
```

### 3. 환경 변수 설정
`.env.local` 파일 생성:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Functions용 환경 변수
GEMINI_API_KEY=your_gemini_api_key
```

### 4. 개발 서버 실행
```bash
# Next.js 개발 서버
npm run dev

# Firebase Functions 에뮬레이터
firebase emulators:start --only functions
```

## 🚀 배포

### Firebase Hosting 배포
```bash
# 빌드
npm run build

# Firebase 배포
firebase deploy
```

### Functions 배포
```bash
# Functions만 배포
firebase deploy --only functions
```

## 📱 PWA 설치

1. 앱 접속 후 주소창의 설치 아이콘 클릭
2. 홈 화면에 바로가기 추가
3. 오프라인에서도 사용 가능

## 🔐 보안 규칙

Firestore 보안 규칙:
- 인증된 사용자만 북마크 CRUD 가능
- 필수 필드 검증
- 소유자 확인

## 📊 API 사용량

Gemini API 사용량 최적화:
- 메타데이터 캐싱
- 배치 처리 지원
- Rate limiting 적용

## 🐛 트러블슈팅

### 클립보드 권한
- HTTPS 환경에서만 동작
- 사용자 권한 필요

### Firebase Functions 오류
- GEMINI_API_KEY 확인
- Functions 로그 확인

### PWA 설치 문제
- HTTPS 확인
- Service Worker 등록 확인

## 🔄 오프라인 동기화

1. 오프라인에서 북마크 추가/수정
2. IndexedDB에 임시 저장
3. 온라인 시 자동 동기화
4. 충돌 시 최신 버전 우선

## 📈 성능 최적화

- 이미지 lazy loading
- 가상 스크롤 (대용량 데이터)
- 메모이제이션
- 코드 분할

## 🎨 UI/UX 가이드

### 디자인 원칙
- 최소한의 상호작용
- 직관적인 비주얼 피드백
- 일관된 애니메이션
- 접근성 고려

### 브라우저 지원
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 📝 라이선스

MIT License

## 🤝 기여

Issues와 Pull Requests 환영합니다!

## 📞 지원

이메일: support@smartbookmarks.app
