# ACE-Step Studio 수동 검증 체크리스트

## 1) Loader / 연결
- [ ] 첫 실행 시 Loader가 `/health` 상태를 갱신하고 Home으로 이동한다.
- [ ] 재실행 시 이전 포트가 남아 있어도 API 링크가 현재 백엔드 포트로 동기화된다.
- [ ] 모델 초기화 지연 시 로더 에러 없이 상태가 갱신된다.
- [ ] Loader의 `백엔드 재시작` 버튼이 동작하고 backend URL이 재동기화된다.
- [ ] Loader의 `진단 수집` 버튼이 동작하고 진단 폴더(`bundle-*`)가 생성된다.

## 2) Create (Compose)
- [ ] 기본 생성(`prompt`, `duration`, `batch`)이 제출된다.
- [ ] `format_input` 버튼이 prompt/lyrics/metadata를 갱신한다.
- [ ] `create_random_sample` 버튼이 입력 필드를 채운다.
- [ ] 고급 파라미터(`inference_steps`, `guidance_scale`, `infer_method`, `shift`)가 전달된다.
- [ ] 제출 전 `preflight`가 호출된다.
- [ ] preflight blocking 시 제출이 중단되고 차단 카드가 표시된다.
- [ ] running 중 stalled 상태가 감지되면 health/stall/recover 힌트가 표시된다.
- [ ] `Retry Clone`, `Cancel + Retry`, `Open Logs` 액션이 동작한다.

## 3) Edit (v2)
- [ ] `cover`, `repaint`, `extract`, `lego`, `complete` 제출이 가능하다.
- [ ] `extract/lego`에서 `track_name`이 요청에 포함된다.
- [ ] `complete`에서 `complete_track_classes`가 요청에 포함된다.
- [ ] 결과 카드에서 오디오 재생이 가능하다.
- [ ] preflight blocking/warning 카드가 상황에 맞게 표시된다.
- [ ] 파일 재선택이 필요한 복구 메시지가 표시된다.

## 4) Library
- [ ] 목록 조회/필터/정렬이 동작한다.
- [ ] 트랙 삭제가 동작한다.
- [ ] 오디오 플레이어 재생이 동작한다.

## 5) Ops / Models / Settings
- [ ] Ops에서 `/v1/stats` 값이 보인다.
- [ ] Ops에서 `preflight/query_result/cancel` 카운터가 보인다.
- [ ] Ops에서 최근 실패 작업(`/v1/tasks/recent`)과 오류 코드 분포가 보인다.
- [ ] Models에서 `/v1/models`가 래핑형/오픈라우터형 모두 정상 표시된다.
- [ ] Settings에서 `dit_model`, `lm_model`, `lm_backend`, `download_source` 저장이 동작한다.
- [ ] Settings에서 `시스템 마이크 동기화` 토글 + `입력 볼륨`(0~100) 저장이 동작한다.
- [ ] Windows 사운드 설정의 입력 볼륨이 Settings 저장 후 1초 내 동일 값(±3%)으로 반영된다.
- [ ] Console/Communications 역할 값이 둘 다 갱신된다.
- [ ] 장치 오류 강제 시 설정 저장은 성공하고 경고 코드가 표시된다.
- [ ] 진단 번들 `summary.json`에 `mic_sync_enabled`, `mic_input_volume_percent`, `mic_apply_last_error_code`가 기록된다.

## 6) 회귀
- [ ] 기존 라우트 `#/create`, `#/edit`, `#/library`, `#/settings` 접근이 깨지지 않는다.
- [ ] 앱 재시작 후 설정/연결 상태가 유지된다.
- [ ] `VITE_FAILURE_RECOVERY_V2=0`에서 기존 v1 동작으로 회귀 가능하다.
