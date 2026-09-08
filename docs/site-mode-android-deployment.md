# 모드별 APK Hosting 배포 인계

사용자의 이번 ‘배포해줘’ 승인으로 Firebase project `propig-63524`의 Hosting만 배포했다.

- 운영: https://propig-63524.web.app
- 검증된 현재 웹 소스(이전 파비콘/메모/계정 전환 웹 개선 포함)와 모드별 APK/아이콘/manifest를 static export로 배포. 480 files, CLI release complete/exit 0.
- Functions·Firestore/Storage rules·indexes 배포 없음. 미배포 Functions 수정은 로컬에 계속 남아 있다. Git commit/push 없음. 기존 dirty 보존.
- 빌드 mirror: `/home/hermes/propig-improve-x34f2l9j`. 원본 src·package/lock·Firebase 설정과 일치 확인.
- 첫 static export 실패는 이전 `.next-apk-build` 등 생성 타입이 임시로 비활성화한 API route를 참조한 문제. mirror tsconfig에서 이전 생성 타입 디렉터리만 제외한 뒤 정적 export 재빌드 exit 0. 원본 tsconfig 미수정, TypeScript 검사 우회 없음.
- export 내 APK 4개 SHA-256/모드 페이지 존재 확인. 서명 키·환경 파일 없음 확인 후 배포.
- 운영 URL에서 4모드 × desktop/mobile: 실제 버튼 클릭, APK 파일명/크기/해시, 파비콘 이미지 decode, 설치 안내, overflow/pageerror 검사 8개 PASS.
- 운영 public-shell-integrity와 navigation-performance PASS.
- Android 기기 설치·첫 실행은 이전 ADB unauthorized 제한으로 여전히 미검증. APK 서명/컴파일 목적지 및 웹 다운로드 검증과 구분한다.

근거 로그: `/tmp/propig-apk-hosting-{build-final,deploy}.log`, `/tmp/propig-apk-production-{browser,shell,navigation}.log`.
