# ACE-Step Studio Stage3 Manual E2E Checklist

`목적`: 실제 백엔드/모델 로드 포함 상태에서 GUI 전면개편(v2) 기능을 최종 검증한다.

## Test Environment

- Windows(Tauri) 우선
- API base: `http://127.0.0.1:8001` 또는 Loader가 동기화한 동적 포트
- 샘플 오디오: WAV 1개 이상 준비
- 언어: `ko`, `en` 모두 1회 이상 확인

## 1. Loader + Startup

- [ ] 앱 시작 후 Loader가 `Ready`로 전환된다.
- [ ] 동적 포트 환경에서 `ace_step_studio_api_base`가 자동 갱신된다.
- [ ] stale localStorage 포트 상태에서도 home 진입이 복구된다.
- [ ] 초기화 지연 시 단계 라벨(`Initializing`, `Loading DiT`, `Loading 5Hz LM`)이 표시된다.

## 2. Compose

- [ ] `#/compose` 진입 가능, `#/create` 레거시 링크도 정상 동작.
- [ ] `Format Input` 버튼으로 `/format_input` 호출 성공.
- [ ] `Random Sample` 버튼으로 `/create_random_sample` 호출 성공.
- [ ] 기본 생성 제출 시 `/release_task` -> `/query_result` 완료.
- [ ] 생성 중 취소 버튼으로 `/v1/tasks/{task_id}/cancel` 성공.
- [ ] 고급 파라미터(`inference_steps`, `guidance_scale`, `infer_method`, `shift`)가 요청에 반영됨.

## 3. Edit(v2)

- [ ] `cover` 1회 제출/완료.
- [ ] `repaint` 1회 제출/완료.
- [ ] `extract` 1회 제출/완료 (`track_name` 전달 확인).
- [ ] `lego` 1회 제출/완료 (`track_name` 전달 확인).
- [ ] `complete` 1회 제출/완료 (`complete_track_classes` 전달 확인).
- [ ] 편집 중 취소 버튼 동작 확인.

## 4. Library + Audio

- [ ] `/v1/library` 목록이 화면에 렌더링된다.
- [ ] 트랙 삭제(`/v1/library/{track_id}`) 성공.
- [ ] 오디오 재생/다운로드(`/v1/audio`) 가능.

## 5. Ops + Models + Settings

- [ ] Ops 페이지에서 `/v1/stats` 조회 성공.
- [ ] Models 페이지에서 `/v1/models` 조회 성공(ACESTEP/OpenRouter 이중 스키마 허용).
- [ ] Settings에서 `dit_model/lm_model/lm_backend/download_source` 저장 성공.
- [ ] 설정 저장 후 앱 재시작 시 값 유지.

## 6. Error Handling

- [ ] API 실패 시 사용자 메시지/상태 배지가 표시된다.
- [ ] Home `System Check`에 최근 API 오류 링크/텍스트가 표시된다.

## 7. Rollback (UI_V2_FEATURES)

- [ ] `VITE_UI_V2_FEATURES=0` 빌드에서 앱 동작 가능.
- [ ] 롤백 빌드에서 `Ops/Models` nav가 숨겨진다.
- [ ] 레거시 경로(`#/create`, `#/edit`, `#/library`, `#/settings`)는 유지된다.
- [ ] `VITE_UI_V2_FEATURES=1` 재빌드 후 기본 동작 복구.

## Evidence Capture

- [ ] 스크린샷: `output/playwright/*.png`
- [ ] 자동검증 리포트:
  - `output/playwright/api_parity_report.json`
  - `output/playwright/loader_recovery_report.json`
  - `output/playwright/ui_parity_actions_report.json`
  - `output/playwright/legacy_routes_report_v2_on.json`
  - `output/playwright/legacy_routes_report_v2_off.json`
  - `output/playwright/phase3_gate_report.json`
