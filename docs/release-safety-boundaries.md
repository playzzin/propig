# 운영 릴리스 안전 경계

## 누적 변경 배포

- Git의 ignored 자격증명·개인 백업·임시 빌드 파일은 게시하지 않는다.
- 제품 화면 이미지에 실제 개인정보가 포함되면 원본은 저장소 밖 비공개 백업으로 보존하고, 공개 파일은 불투명 마스킹한다. 흐림 효과는 익명화 보장으로 간주하지 않는다.
- Linux clean install로 정식 static export 및 Functions를 빌드한다. 타입 검사 시 Node heap이 부족하면 8GB 한도로 재실행하며 환경 실패와 코드 실패를 구분한다.
- 기업 본문의 크기 검사는 #content-area로 범위를 한정한다. 조밀한 Sidebar는 전용 회귀에서 desktop/mobile 기준을 별도 검증한다.

## 이전 클라우드 함수 보존

이전 Studio 관련 소스의 삭제를 원격 함수 삭제 승인으로 확장하지 않는다. 현재 exports의 실제 함수 이름을 명시한 targeted deploy를 사용한다. `HOSTING_API_ROUTE_PATTERNS` 같은 비함수 export는 배포 목록에 넣지 않는다. `--force`로 구형 함수 삭제를 자동 승인하지 않는다.

남아 있는 이전 함수의 퇴역은 진행 중 job drain, 복구/취소 경로와 기존 사용자 자료 보존을 별도 확인한 뒤 수행한다. 이전 함수가 유지된 릴리스를 완전한 원격 정리 완료라고 보고하지 않는다.

## 알려진 검증 한계

의존성 audit에 moderate 항목이 남아 있다. high/critical 부재는 무취약 보장이 아니다. provider 외부 호출·실제 관리자 원격 저장·구형 작업 drain은 공개 읽기 전용 smoke와 구분한다.
