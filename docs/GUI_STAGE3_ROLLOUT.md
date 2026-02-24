# ACE-Step Studio Stage3 Rollout Guide

## Goal

`GUI 전면개편 + 장애대응 v2(Preflight/Stalled Health/Recovery)`를 안전하게 기본 활성화한다.

## Rollout Stages

### Stage 1: Internal Canary

- Build flags:
  - `VITE_UI_V2_FEATURES=1`
  - `VITE_FAILURE_RECOVERY_V2=1`
- 대상: 내부 QA/개발자
- 필수 게이트:
  - `scripts/run_phase3_gate.ps1` PASS (strict 기본)
  - 수동 E2E 체크리스트 PASS
- 실패 시:
  - 즉시 `VITE_FAILURE_RECOVERY_V2=0` 또는 `VITE_UI_V2_FEATURES=0` 롤백
  - 원인 수정 전 기본 배포 중지

### Stage 2: Default On + Rollback Ready

- Build flags:
  - `VITE_UI_V2_FEATURES=1`
  - `VITE_FAILURE_RECOVERY_V2=1` (기본)
- 운영 원칙:
  - `VITE_FAILURE_RECOVERY_V2=0` 롤백 빌드 항상 유지
  - 24시간 동안 `phase3_gate_report.json`, `failure_recovery_report.json`, `preflight_report.json` 모니터링
- 이탈 조건:
  - 실패 상세 메시지 표시율 저하
  - stalled 복구 액션 노출 실패
  - 생성/편집 성공률 급락

### Stage 3: Legacy Cleanup

- 조건:
  - Stage 2 안정성 연속 확보
  - 회귀 누적 없음
- 실행:
  - v1 분기 축소/정리
  - 정리 전 레거시 라우트 접근 통계 확인
  - 정리 기간에도 롤백 플래그 유지

## Operational Commands

Run full gate (strict default):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_phase3_gate.ps1 `
  -ApiBase http://127.0.0.1:8001 `
  -AudioPath outputs/smoke/8bd0d3a1-63a2-4247-8e39-665b69edd1c1.wav `
  -Out output/playwright
```

Known `/format_input` failure를 허용해야 할 때만 완화 모드 사용:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_phase3_gate.ps1 `
  -ApiBase http://127.0.0.1:8001 `
  -AudioPath outputs/smoke/8bd0d3a1-63a2-4247-8e39-665b69edd1c1.wav `
  -AllowKnownFormatInputFailure `
  -Out output/playwright
```

Rollback smoke only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_phase3_gate.ps1 `
  -SkipApi -SkipLoader -SkipUiActions `
  -Out output/playwright
```

## Gate Rules (v2.1)

- `run_phase3_gate.ps1`는 API/UI 실연동 스텝이 포함될 때(`-SkipApi`, `-SkipUiActions` 둘 다 아님) 먼저 `/health` 프리체크를 최대 90초 수행합니다.
- 프리체크 실패 시 `phase3_gate_report.json`에 `fatal_reason=PRECHECK_HEALTH_UNREACHABLE`를 기록하고 즉시 종료합니다.
- 필수 리포트 누락 시 게이트는 실패 처리됩니다.
  - `api_parity_report.json` (API 스모크 실행 시)
  - `loader_recovery_report.json` (Loader 스모크 실행 시)
  - `ui_parity_actions_report.json` + `failure_recovery_report.json` (UI 액션 스모크 실행 시)
  - `legacy_routes_report_v2_on.json` (항상)
  - `legacy_routes_report_v2_off.json` (rollback 스모크 실행 시)
  - `preflight_report.json` (API parity 결과에 preflight 샘플이 있을 때)

## Acceptance Gate Mapping

- API parity + preflight: `api_parity_report.json` (`fail=0`)
- strict 판정: `api_parity_report.json.strict_mode.format_input_status = pass|skip_known_failure|fail`
- Loader 복구: `loader_recovery_report.json` scenario `ok=true`
- UI parity + 실패복구: `ui_parity_actions_report.json`, `failure_recovery_report.json` (`ok=true`)
- Preflight 시나리오: `preflight_report.json` 생성 및 내용 유효
- 롤백 토글: `legacy_routes_report_v2_on.json`, `legacy_routes_report_v2_off.json` PASS
- 통합 판정: `phase3_gate_report.json`의 `ok=true`
