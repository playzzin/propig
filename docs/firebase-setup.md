# Firebase 설정 가이드

## 1. Firebase 프로젝트 생성

1. [Firebase 콘솔](https://console.firebase.google.com/) 접속
2. **프로젝트 추가** 클릭
3. 프로젝트 이름 입력 (예: `propig`)
4. Google Analytics 설정 (선택)

## 2. Authentication 설정

1. Firebase 콘솔에서 **Authentication** 메뉴 선택
2. **시작하기** 클릭
3. **Sign-in method** 탭에서 다음을 활성화:
   - **Email/Password**: 활성화
   - **Google**: 활성화 (API 키 필요)

## 3. 웹 앱에 Firebase 추가

1. 프로젝트 설정으로 이동 (톱니바퀴 아이콘)
2. **내 앱** 섹션에서 **웹** 아이콘 클릭
3. 앱 이름 입력 (예: `Propig Web`)
4. **Firebase SDK 추가**에서 설정 값 복사

## 4. 환경 변수 설정

`.env.local` 파일에 Firebase 설정 값 입력:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

## 5. 개발 서버 재시작

```bash
# 서버 중단 (Ctrl+C)
npm run dev
```

## 주의사항

- `.env.local` 파일은 git에 커밋되지 않습니다
- API 키는 클라이언트에서만 사용하는 키이며, 보안 규칙으로 보호됩니다
- 실제 배포 시에는 보안 규칙을 반드시 설정해야 합니다

## 문제 해결

### "auth/invalid-api-key" 오류
- `.env.local` 파일이 올바른 위치에 있는지 확인
- API 키 값이 올바르게 복사되었는지 확인
- 개발 서버를 재시작했는지 확인

### "auth/project-not-found" 오류
- Firebase 프로젝트 ID가 올바른지 확인
- 프로젝트가 Firebase 콘솔에 존재하는지 확인
