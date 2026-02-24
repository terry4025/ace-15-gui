# ACE-Step Studio 대화/프로젝트 통합 기록

작성일: 2026-02-13  
대상: ACE-Step Studio (Desktop/Tauri + UI/React + Backend/FastAPI)

## 1. 문서 목적
- 지금까지의 요청/응답 흐름과 실제 구현 상태를 한 파일에서 추적하기 위한 기록 문서입니다.
- 기능 계획, 구현 반영 내용, 검증 결과, 남은 액션을 함께 정리합니다.

## 2. 대화 흐름 요약
1. GUI Loader 실행 요청이 있었고, 초기에는 `localhost` 연결 거부(`ERR_CONNECTION_REFUSED`) 이슈가 확인되었습니다.
2. 사용자 요청으로 GUI 전면 개편 + Loader 기반 전체 기능 연결/검증(3단계) 계획이 확정되었습니다.
3. 단계별로 Compose/Edit/Ops/Models/Settings/UI 라우팅 확장 및 디자인 개선이 진행되었습니다.
4. 생성 실패 시 `Task: <id>`만 보이는 모호한 실패 UX 문제가 보고되었습니다.
5. 이후 실패 복구 중심 v1 계획(표준 오류 표시, Retry Clone, 공통 상태 패널)이 확정되어 반영되었습니다.
6. 추가 요청으로 v2 계획(Preflight + Stalled Health + Strict Gate)이 확정되었습니다.
7. v2 구현에서 Backend/Frontend/Loader/Ops/Automation/Docs/Tauri command까지 연동 확장이 진행되었습니다.
8. 최종 상태에서 정적 빌드/컴파일 검증은 통과했으며, 실제 API/UI E2E 게이트 실행은 백엔드 미기동 상태로 보류되었습니다.
9. 추가 요청으로 Settings의 마이크 증폭 체감 이슈를 해결하기 위해, Windows 시스템 입력 볼륨(CoreAudio) 실적용 경로가 확정되어 반영되었습니다.

## 3. 핵심 요구사항 변천
- 초기: GUI 실행/연결 안정화
- 중기: GUI 전면개편 + API 패리티 + Loader 동적 포트 신뢰성
- 후기 v1: 실패 원인 표준화 + 복구 UX(수동 재시도)
- 최신 v2: 제출 전 차단(Preflight), 실행 중 정체(stalled) 감지, strict 게이트 기본화

## 4. 현재 반영된 주요 구현

## 4.1 Backend (FastAPI)
- `POST /v1/preflight` 신규 추가
  - `payload`, `client_files`, `client_audio` 기반 비파괴 검증
  - `ok`, `blocking_errors`, `warnings`, `normalized_payload`, `estimated_seconds`, `suggested_poll_ms` 반환
- `POST /query_result` 확장(optional)
  - `error_code`, `error_summary`, `retryable`
  - `stage`, `progress`, `queue_position`, `eta_seconds`, `avg_job_seconds`
  - `last_heartbeat`, `stall_seconds`, `health_state`, `recover_hint`, `next_poll_ms`
- `POST /v1/tasks/{task_id}/cancel` 확장(optional)
  - `task_id`, `status`, `error_code`, `recover_hint`
- `GET /v1/tasks/recent` 신규 추가
  - Ops용 최근 작업/오류 코드 분포 데이터 소스
- `GET /v1/stats` 확장(optional)
  - `preflight_calls_total`, `query_result_calls_total`, `cancel_calls_total`
  - `format_input_calls_total`, `format_input_fail_total`, `format_input_known_fail_total`
- `GET/POST /v1/app-config` 확장
  - `mic_sync_enabled`(bool, 기본 false), `mic_input_volume_percent`(int 0~100, 기본 100)
- 오류 분류 강화
  - `WinError 10054`/`ConnectionResetError` 계열을 `TASK_TIMEOUT`로 분류
  - `FORMAT_INPUT_KNOWN_RUNTIME_ASSERT`, `FORMAT_INPUT_INTERNAL_ERROR` 코드 분류 추가

## 4.2 Frontend (React UI)
- 기능 플래그
  - `VITE_FAILURE_RECOVERY_V2` 추가
- 타입/클라이언트 확장
  - `PreflightRequest/Response/Issue`, `TaskHealthState`
  - `api.preflight(...)`, `api.getRecentTasks(...)`
  - query 결과 정규화 강화(구형/신형 응답 병행)
- Create/Compose
  - 제출 전 preflight 적용(blocking 시 제출 중단)
  - warning 배너 표시 후 제출 진행
  - 서버 권장 폴링(`next_poll_ms`) 우선 + fallback 적응형 폴링
  - 브라우저 비가시 시 폴링 완화(최대 10s)
  - `Retry Clone`, `Cancel+Retry`, `Open Logs`
  - 마지막 제출/설정 로컬 저장 복원
- Edit(v2)
  - preflight 적용(파일 메타 기반 사전검증)
  - 동일한 복구 액션 + 서버 권장 폴링 기반 적응형 폴링
- 공통 상태 패널
  - health/stall/recover 힌트 포함한 `TaskStatusPanel` 확장
- Loader
  - `Restart backend`, `Collect diagnostics` 액션 추가
  - `/health` 타임아웃 사유(미기동/포트 불일치/초기화 지연) 구분 메시지
- Ops
  - 최근 실패 작업(서버 기준), 오류 코드 분포
  - preflight/query/cancel 호출 카운터 표시
  - format_input 호출/실패/known failure 카운터 표시
- Settings
  - `시스템 마이크 동기화` 토글 + `입력 볼륨(0~100)` 슬라이더 추가
  - 설정 저장 성공 후 Tauri 런타임에서는 `set_system_mic_volume` 호출로 Windows 입력 볼륨 적용
  - 시스템 적용 실패 시 저장 성공은 유지하고 경고 코드 표시

## 4.3 Desktop/Tauri
- 신규 command
  - `restart_backend`
  - `collect_diagnostics_bundle`
  - `get_system_mic_state`
  - `set_system_mic_volume`
- 진단 번들
  - timestamp 폴더 생성
  - `backend.out.log`, `backend.err.log`, `config.json`, `output/playwright/*report.json`, `summary.json` 복사/생성
  - `summary.json`에 `backend_url`, `gate_report_present`, `latest_error_hint`, `format_input_known_fail_count` 포함
  - `summary.json`에 `mic_sync_enabled`, `mic_input_volume_percent`, `mic_apply_last_error_code` 포함
  - 앱 시작 시 `mic_sync_enabled=true`이면 `mic_input_volume_percent`를 시스템 입력 볼륨으로 재적용(실패 시 launcher.err.log 기록)

## 4.4 Automation/Gate/Docs
- `scripts/smoke_api_parity.py`
  - preflight pass/block/warn 검증
  - recent/stats/query/cancel optional 필드 타입 검증 강화
  - `strict_mode.format_input_status` + known-failure 근거(`skip_reason`, `detected_signature`) 리포트화
- `scripts/ui_parity_actions_playwright.mjs`
  - preflight blocking 카드 검증
  - stalled 상태 주입(route fulfill) 및 렌더 검증
  - `next_poll_ms` 기반 폴링 backoff 검증 추가
  - `Cancel+Retry`, `Retry Clone`, `Open Logs` 동작 검증
- `scripts/run_phase3_gate.ps1`
  - strict 기본값 전환(`AllowKnownFormatInputFailure` opt-in)
  - API `/health` 90초 프리체크 및 실패 시 `fatal_reason=PRECHECK_HEALTH_UNREACHABLE`
  - 필수 리포트 누락 검증 + `preflight_report.json` 조건부 필수화
  - `reportStats.strictFormatInputStatus` 고정 출력
- 문서 업데이트
  - `docs/GUI_STAGE3_ROLLOUT.md`
  - `docs/ko/STUDIO_SMOKE_CHECKLIST.md`
  - `docs/ko/API.md`
  - `docs/en/API.md`

## 5. 최근 검증 상태
- 통과
  - Python 문법: `py -3 -m py_compile acestep/api_server.py scripts/smoke_api_parity.py`
  - Node 문법: `node --check scripts/ui_parity_actions_playwright.mjs`
  - UI 빌드: `npm --prefix ui/app run build`
  - Tauri 체크: `cargo check` (`desktop/src-tauri`)
- 미실행/보류
  - 실제 API/UI E2E 게이트 실행
  - 사유: 당시 `http://127.0.0.1:8001/health`가 `UNREACHABLE` 상태

## 6. 현재 알려진 리스크/주의
- 백엔드 미기동 시 Loader/스모크/실작업 E2E는 검증할 수 없습니다.
- `/format_input`은 환경별 known failure가 있어 strict 완화 플래그를 명시적으로만 사용해야 합니다.

## 7. 다음 실행 권장 순서
1. 백엔드 기동 확인
   - `http://127.0.0.1:8001/health`
2. strict 게이트 실행
   - `powershell -ExecutionPolicy Bypass -File scripts/run_phase3_gate.ps1 -ApiBase http://127.0.0.1:8001 -AudioPath <wav경로> -Out output/playwright`
3. 필요 시에만 완화 모드
   - 위 명령에 `-AllowKnownFormatInputFailure` 추가
4. 산출물 확인
   - `output/playwright/phase3_gate_report.json`
   - `output/playwright/api_parity_report.json`
   - `output/playwright/ui_parity_actions_report.json`
   - `output/playwright/failure_recovery_report.json`
   - `output/playwright/preflight_report.json`

## 8. 관련 핵심 파일 목록
- Backend
  - `acestep/api_server.py`
- Frontend
  - `ui/app/src/types.ts`
  - `ui/app/src/lib/api.ts`
  - `ui/app/src/lib/flags.ts`
  - `ui/app/src/lib/tauri.ts`
  - `ui/app/src/components/TaskStatusPanel.tsx`
  - `ui/app/src/pages/Create.tsx`
  - `ui/app/src/pages/EditV2.tsx`
  - `ui/app/src/pages/Loader.tsx`
  - `ui/app/src/pages/Ops.tsx`
  - `ui/app/src/i18n.ts`
  - `ui/app/src/styles.css`
- Desktop/Tauri
  - `desktop/src-tauri/Cargo.toml`
  - `desktop/src-tauri/src/lib.rs`
- Scripts
  - `scripts/smoke_api_parity.py`
  - `scripts/ui_parity_actions_playwright.mjs`
  - `scripts/run_phase3_gate.ps1`
- Docs
  - `docs/GUI_STAGE3_ROLLOUT.md`
  - `docs/ko/STUDIO_SMOKE_CHECKLIST.md`
  - `docs/ko/API.md`
  - `docs/en/API.md`
