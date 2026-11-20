# 그냥 뚠뚠이 아니라고 — 영상 제작 인계

## 최신 요청 및 차단 상태

- 사용자가 기존 영상의 품질을 거절하고 삭제 및 유료 크레딧 총 10개 이내 재제작을 요청했다. 아래의 이전 완료 기록은 이 요청으로 폐기된 결과의 이력이다.
- 회사 소개 route의 영상 연결, 플레이어 컴포넌트·스타일, 공개 MP4·포스터·VTT, 이전 모션그래픽 생성 스크립트를 제거했다. 사용자가 제공한 원본 캐릭터 이미지는 보존한다.
- 신규 제작 예산: GPT Image 2.5 medium 1k 장면 이미지 2장 × 0.5크레딧, Seedance 2.0 Mini 9초 720p 음성 포함 9크레딧, 합계 10크레딧.
- 첫 이미지 생성이 `Requires basic plan or higher.` 오류로 거절됐다. 이미지 준비 없이 원본 캐릭터 2장을 직접 참조한 영상 생성(견적 9크레딧)도 같은 오류로 거절됐다. 두 요청 모두 job ID 없이 실패했다.
- 요금제는 free, 마지막 확인 잔액은 10크레딧이다. 추가 구매·구독 변경·체험 시작은 실행하지 않았다. 재제작을 완료했다고 보고하면 안 된다.
- 삭제 검증: 회사 소개 페이지 HTTP 200, 영상/제목 DOM 각각 0개, 이전 공개 MP4 URL HTTP 404. route ESLint 및 diff 공백 검사 통과.
- 사용자가 요금제 상태를 변경하면 잔액·견적을 새로 확인하고 총 10크레딧 상한 안에서 진행한다. 이미 거절한 모션그래픽을 재삽입하지 않는다.

## 현재 상태

- 사용자 요청: 제공한 두 캐릭터로 코믹 변신 영상을 제작하고 `/corp/company/introduction`에 삽입한다.
- 사용자가 무료 한도 내 제작을 승인하여 Viral 무료 생성권 1회로 High flip을 실행했다. `use_free_gens: true`, 720p, 16:9로 제출했다. 유료 크레딧은 실행 전후 모두 10으로 유지됐다.
- 무료 결과는 9초짜리 두 캐릭터 변신 동작이다. 생성 모델이 파티장·턱시도·대사를 재현하지 않아, 해당 부분과 앞뒤 이야기는 로컬 코믹 모션그래픽으로 보완했다.
- 최종 구성: 36초, 1280×720, 24fps, H.264/AAC. Windows 설치 한국어 음성으로 대사 3개를 만들고, 자체 합성한 음악과 효과음을 혼합했다. 사람의 자연스러운 연기·립싱크를 구현한 영상은 아니다.
- 무료 Genjutsu 1회는 사용하지 않았다. 추가 결제·유료 재생성·구독 시작·운영 배포는 실행하지 않았다.
- 생성 작업 식별자와 원본 클립·대사·검증 스크린샷은 로컬 작업 디렉터리 `.codex-ddun-film`에 보관한다.
- 완성 파일: `public/videos/corp/ddun-ddun-brand-film.mp4`, `ddun-ddun-brand-film-poster.jpg`, `ddun-ddun-brand-film.ko.vtt`.

## 최초 장면 기획

| 시간 | 화면 | 소리 |
| --- | --- | --- |
| 0–4초 | 샹들리에가 빛나는 아르데코 파티장. 첫 번째 캐릭터가 흰 민소매와 파란 바지를 입고 서 있다. 주변 하객이 수군거린다. | 하객: “그냥 뚠뚠이 아냐?” 짧은 웃음. |
| 4–8초 | 캐릭터가 어깨를 축 늘어뜨리고 등을 돌려 쭈그려 앉는다. 잠깐 정적 뒤 결심한 표정으로 고개를 든다. | 파티 음악이 작아지고 한숨. |
| 8–14초 | 일어나며 검정 턱시도와 나비넥타이 차림으로 변한다. 샴페인 잔을 들어 개츠비를 연상시키는 자신만만한 건배 포즈를 취한다. 배우의 얼굴은 모방하지 않고 제공된 캐릭터 얼굴을 유지한다. | 캐릭터: “내가 그냥 뚠뚠이 아니라고 했지!” |
| 14–19초 | 잔을 테이블에 놓고 양복을 양손으로 찢는다. 두 번째 이미지의 파란 슈트, 빨간 망토, 금색 P 문양을 갖춘 슈퍼돼지로 변신한다. | 옷 찢어지는 소리, 짧은 영웅 음악. |
| 19–25초 | 직접 파티장 창문을 열고 힘차게 날아간다. 잠시 멋지게 날다가 고도가 뚝 떨어져 정원 덤불에 우스꽝스럽게 착지한다. | 바람 소리, 음악이 끊기는 코미디 효과, 푹 하는 착지음. |
| 25–30초 | 다치지 않은 슈퍼돼지가 망토를 구긴 채 앉아 운다. 얼굴 가까이 천천히 다가가며 끝난다. | 울먹이며: “그냥 뚠뚠이 아니라고…” |

## 원래 제작 목표 지시문 (유료 생성에는 제출하지 않음)

Create one complete 30-second, 16:9 premium stylized 3D animated comedy with synchronized Korean dialogue and cinematic continuity. The two provided reference images depict the SAME fictional adult character: reference image 1 is his everyday appearance, reference image 2 is his superhero appearance. Preserve his recognizable face, spiky black hair, body proportions, and character design throughout. Remove the reference backgrounds; do not display either reference as a static slide. Animate real body movement, expressions, cloth, and camera movement. Set the story at a luxurious Art Deco evening party with warm chandeliers, guests, a large openable window and a garden outside.

0–4s: Medium-wide shot of the everyday character wearing the white tank top and blue track pants from image 1. Nearby guests look at him and one says in Korean, “그냥 뚠뚠이 아냐?” followed by a brief chuckle.

4–8s: Hurt and discouraged, he turns away, crouches with his back to the camera, head down and shoulders slumped. Pause emotionally, then he decides to prove himself.

8–14s: He rises and his clothes magically become an elegant black tuxedo with bow tie. He holds a champagne coupe and raises it toward the camera in a confident Gatsby-inspired toast, keeping the supplied character's own face. He clearly says, “내가 그냥 뚠뚠이 아니라고 했지!” in a confident Korean male voice.

14–19s: He puts the glass on a table, grips his tuxedo lapels with both hands and dramatically tears away the suit to reveal EXACTLY the superhero outfit from image 2: blue suit, red flowing cape, red boots, gold trim and large gold P chest emblem. No nudity. Preserve his large round silhouette.

19–25s: He opens the party-room window himself and launches into the night, cape fluttering. Track him flying triumphantly for a moment, then his flight fails and he comically drops into a soft garden hedge, completely unharmed. Use a comic musical interruption and a soft landing sound.

25–30s: He sits on the ground beside the hedge in the superhero suit, cape crumpled, crying with an embarrassed pout. Close-up as he sobs in Korean, “그냥 뚠뚠이 아니라고…” End on his tearful face. Keep the ending sympathetic and funny.

Use consistent geography and character identity, readable action, controlled shot changes, natural Korean lip synchronization, party ambience, a short original heroic musical cue, and clear dialogue above the music. No narrator, no unrelated scenes, no English dialogue, no baked-in text, no watermark added by the creative direction.

## 최종 타임라인과 페이지 반영

- 0–4.5초 놀림, 4.5–8초 뒤돌아 쭈그려 앉기, 8–12초 턱시도 건배와 대사, 12–21초 재킷 전환 및 AI 변신, 21–24초 창문 열기, 24–28초 비행·추락, 28–36초 덤불 착지·울먹이는 결말.
- 대상 route `src/app/corp/company/introduction/page.tsx`에 `DdunBrandFilm`을 추가했다. 기존 Dashboard 파일의 사용자 수정은 건드리지 않았다.
- HTML video의 controls, playsInline, preload="metadata"를 사용하고 자동재생은 하지 않는다. 한국어 VTT와 실패 시 직접 열기 링크를 제공한다.
- 변경 파일 ESLint, 전체 type-check, FFmpeg 전체 디코딩 검사를 통과했다.
- 별도 `.codex-ddun-build` 출력으로 Next.js 프로덕션 webpack 빌드(80개 정적 페이지 포함)를 통과했다. 빌드가 자동 추가한 tsconfig 경로는 제거하여 기존 설정을 보존했다.
- 최종 MP4: 3,815,083바이트. SHA-256 `3F21299635872F0654D4CA09C45EA9C183E327E36DF32FD72015B67CF9E926DA`.
- 1365px 브라우저에서 36초 전체 재생(864프레임, 드롭 0), 390px에서 재생·탐색·플레이어 폭·7개 자막 cue 검증을 통과했다. 두 화면 모두 페이지 JS 오류 0이었다. 오디오 트랙 존재를 확인했으며 사람의 청취 평가는 수행하지 않았다.
- 기존 corp 통합 검사의 상단 스크린샷 대상을 새 영상으로 갱신했다. 그 이후 검사는 기존 Dashboard의 `company-brands` 섹션이 순서 기대값에 없어 실패했다. 이번 작업에서 그 공유 Dashboard나 기존 순서 계약은 변경하지 않았다.
- 재현용 오프라인 편집기: `scripts/build-ddun-brand-film.py`. 입력 캐릭터 두 장, work 디렉터리의 대사 WAV, `--ai-clip` 원본 클립으로 재생성한다. 네트워크·유료 API 호출은 없다.
- 승인 없는 추가 생성·재생성, commit/push, 운영 배포는 하지 않는다.
