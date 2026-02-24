# ACE-Step Studio GUI/Loader Verification

## Smoke Commands

Run from repo root:

```powershell
.\.venv\Scripts\python.exe scripts/smoke_api_parity.py --base http://127.0.0.1:8001
node scripts/loader_recovery_playwright.mjs --out output/playwright
node scripts/ui_parity_actions_playwright.mjs --api-base http://127.0.0.1:8001 --audio-path outputs/smoke/8bd0d3a1-63a2-4247-8e39-665b69edd1c1.wav --out output/playwright
node scripts/legacy_routes_playwright.mjs --out output/playwright --expect-v2 true
```

## Phase3 Gate Command

`3단계(검증/안정화/점진 전환)` 통합 실행:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_phase3_gate.ps1 `
  -ApiBase http://127.0.0.1:8001 `
  -AudioPath outputs/smoke/8bd0d3a1-63a2-4247-8e39-665b69edd1c1.wav `
  -Out output/playwright
```

## Coverage

- Loader recovery 4 scenarios:
  - `8001 empty + dynamic port from Tauri`
  - `8001 occupied + healthy backend`
  - `stale localStorage port -> fallback to 8001`
  - `initialization delay then ready`
- API parity:
  - `/health`, `/v1/app-config`, `/release_task`, `/query_result`, `/v1/tasks/{task_id}/cancel`
  - `/v1/library`, `/v1/audio`, `/format_input`, `/create_random_sample`, `/v1/stats`, `/v1/models`
- Edit task flow coverage:
  - `cover`, `repaint`, `extract`, `lego`, `complete`
  - `track_name`/`complete_track_classes` field submission checks
- Legacy/rollback coverage:
  - legacy route direct access: `#/create`, `#/edit`, `#/library`, `#/settings`
  - `UI_V2_FEATURES=0` rollback build에서 `Ops/Models` nav 비노출 검증
  - rollback 후 `UI_V2_FEATURES=1` 기본 빌드 복원

## Artifacts

- `output/playwright/loader_recovery_report.json`
- `output/playwright/ui_parity_actions_report.json`
- `output/playwright/api_parity_report.json`
- `output/playwright/legacy_routes_report_v2_on.json`
- `output/playwright/legacy_routes_report_v2_off.json`
- `output/playwright/phase3_gate_report.json`
- `output/playwright/*.png`

## Notes

- 일부 환경에서 `/format_input`이 백엔드 CUDA 런타임 이슈(`device-side assert`)로 간헐 실패할 수 있습니다.
- `run_phase3_gate.ps1`는 기본적으로 해당 known-failure를 `SKIP`으로 처리(`-AllowKnownFormatInputFailure`)해 UI/연결 회귀와 백엔드 런타임 이슈를 분리합니다.
