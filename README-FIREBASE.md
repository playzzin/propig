# Firebase Admin SDK 설정 가이드

## 1. Firebase 프로젝트에서 서비스 계정 키 다운로드

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. 프로젝트 선택
3. 프로젝트 설정 (톱니바퀴 아이콘) → 서비스 계정 탭
4. "새 비공개 키 생성" 클릭
5. `serviceAccountKey.json` 파일이 다운로드됩니다

## 2. 서비스 계정 키 파일 배치

다운로드한 `serviceAccountKey.json` 파일을 프로젝트 루트 디렉토리에 배치하세요:

```
propig/
├── serviceAccountKey.json  ← 여기에 배치
├── package.json
├── src/
└── ...
```

## 3. 사용 방법

### 서버 사이드에서 사용 (API Routes, Server Actions 등)

```typescript
import admin from "@/lib/firebase-admin";

// 예시: Firestore 사용
const db = admin.firestore();
const usersRef = db.collection("users");

// 예시: Auth 사용
const userRecord = await admin.auth().getUser(uid);
```

### API Route 예시

```typescript
// src/app/api/users/route.ts
import admin from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
```

## 4. 환경 변수 사용 (프로덕션 권장)

프로덕션 환경에서는 환경 변수를 사용하는 것이 더 안전합니다:

1. `.env.local` 파일 생성 (이미 `.gitignore`에 포함됨)
2. `serviceAccountKey.json` 파일의 전체 내용을 JSON 문자열로 변환하여 설정:

```env
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

## 보안 주의사항

- ⚠️ `serviceAccountKey.json` 파일은 절대 Git에 커밋하지 마세요 (이미 `.gitignore`에 추가됨)
- ⚠️ 환경 변수도 `.env.local`은 Git에 커밋하지 마세요
- ⚠️ 프로덕션 환경에서는 환경 변수 사용을 권장합니다
