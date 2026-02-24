# ACE-Step Studio 대화 요약 (2026-02-09)

## 1) 프로젝트 개요
이 레포(`ACE-Step-1.5-main`)는 ACE-Step 1.5 음악 생성 모델(Backend: Python/FastAPI + PyTorch)을 로컬에서 실행할 수 있도록 제공하며, 추가로 “ACE-Step Studio”라는 데스크톱 GUI(Tauri + Web UI)를 통해 Suno-영감 UX로 더 쉽게 사용할 수 있는 형태로 확장 작업을 진행했습니다.

핵심 방향은 다음과 같습니다.
- 사용자가 `ACE-Step Studio.exe`를 실행하면 로더가 뜨고, 백엔드 준비/모델 확인 후 메인 GUI로 진입
- 기본은 로컬(127.0.0.1)에서만 동작하며, 설정에서 LAN(0.0.0.0) 공개도 가능(보안 키 필요)
- “Suno와 동일”은 저작권/트레이드드레스 리스크 때문에 금지: 리소스/폰트/아이콘/픽셀 복제 없이, 정보구조/밀도/무드만 유사하게 독자 UI로 구현

## 2) 사용자가 원하는 최종 목표(요구사항)
최종 목표는 “원클릭 실행 + 데스크톱 GUI + 오프라인 번들(모델 포함)”입니다.

- `ACE-Step Studio.exe` 실행
  - 로더 표시(환경 감지 → 백엔드 시작 → 모델 준비 상태 확인 → 헬스체크)
  - 메인 화면 진입(Create/Library/Settings)
- 오프라인 번들 요구
  - Python 런타임(`python_embeded/`) + 필수 모델(`checkpoints/`, DiT turbo + LM 4B + VAE + Embedding) 포함
  - 네트워크가 끊겨도 설치/실행/생성이 가능
- UI/UX
  - Suno-영감(다크 + 그라디언트/카드/피드 밀도)으로 더 “비슷한 느낌”
  - 하지만 완전 복제는 금지(독자 디자인 유지)
- Windows 사용성
  - 바탕화면에 실행 아이콘(바로가기 또는 exe 노출)이 있어야 함

## 3) 현재 구현된 것(현 상태)
### 3.1 데스크톱 런처(Tauri)
- Rust 런처가 백엔드를 subprocess로 띄움
- 포트 충돌 시 자동으로 빈 포트 선택
- 사용자 영역에 로그 저장:
  - `%APPDATA%\\ACE-Step Studio\\backend.out.log`
  - `%APPDATA%\\ACE-Step Studio\\backend.err.log`
- 캐시/임시 디렉토리를 설치 폴더가 아닌 사용자 쓰기 가능 위치로 유도:
  - `%LOCALAPPDATA%\\ACE-Step Studio\\cache`

### 3.2 Web UI(Studio UI)
- `Create / Library / Settings / Home` 구조의 기본 UI 구성
- 로더(LoaderPage)가 백엔드 `/health`를 일정 시간 폴링하고, 준비되면 `/v1/app-config`를 가져와 홈으로 이동
- GPU, DiT, LM 같은 상태를 홈/사이드바에 표시

### 3.3 오프라인 포터블 배포(Setup.exe 대신 우회)
NSIS(설치형 Setup.exe)로 “모델(특히 `*.safetensors` 대용량 shard)”을 포함하는 과정에서 `makensis`의 mmap/대용량 파일 처리 이슈로 빌드가 실패하는 문제가 있어, **단일 설치 파일 대신 ‘오프라인 포터블 폴더 배포’로 우회**했습니다.

현재 배포 위치(예시):
- `C:\\Users\\Administrator\\Desktop\\ACE-Step Studio Offline Portable ...\\ACE-Step Studio.exe`
- `...\\resources\\offline\\backend\\checkpoints\\` (필수 모델)
- `...\\resources\\offline\\python_embeded\\` (임베디드 파이썬)

바탕화면 아이콘은 `.lnk`로 생성해 대상 exe를 가리키도록 구성했습니다.

## 4) 현재 문제(관측된 이슈)와 원인
### 4.1 “Offline / Backend is not reachable” 오류
증상:
- 로더에서 “Offline / Backend is not reachable”가 뜨며 진행이 멈춤

원인(핵심):
- FastAPI 서버가 “startup에서 모델을 동기 로드(수십초~수분)”하는 동안 `/health`가 늦게 열려 UI가 backend down으로 판단하는 타이밍 문제가 있었습니다.

대응:
- UI 쪽은 `/health` 폴링을 길게(최대 수분) 하도록 개선했습니다.
- Backend 쪽은 “서버는 즉시 뜨고(/health 가능), 모델 초기화는 백그라운드”로 바꿔 체감 실패율을 낮추는 방향으로 수정했습니다.

### 4.2 UI에서 GPU가 “알 수 없음/—”로 표시
증상:
- 백엔드 로그에선 RTX 3090(24GB) 감지가 나오는데, UI에는 GPU가 unknown

가능 원인:
- Loader 단계에서 `/v1/app-config`를 못 불러오면 `cfg`가 null로 남아 GPU를 표시할 데이터가 없는 상태
- base URL이 기본값(8001)로 남아있거나, 실행 순서/헬스체크 실패로 config 로딩이 실패한 상태
- `/v1/app-config`에서 `recommended_lm_model` 계산이 잘못되어(함수 인자 타입 불일치) 응답이 실패하면 UI가 runtime 정보를 표시하지 못하는 상태

대응:
- Loader가 backend_url(Tauri invoke)로 base URL을 설정하고, health/config를 재시도하도록 강화
- `/v1/app-config` 응답에 runtime 정보(gpu_memory_gb 등)가 있으므로, config만 정상 로드되면 GPU 표시는 “정상(예: 24.0GB)”이 맞습니다.
- Studio 로더가 `/health`의 `models_stage`(GPU 감지/DiT 로드/LM 로드)를 표시하고, `models_initialized`/`llm_initialized` 조건을 충족한 뒤에만 메인 UI로 진입하도록 게이팅하면 “로드는 됐는데 표시가 비어있는” 케이스를 줄일 수 있습니다.

## 5) 아직 완성하지 못한 파트(미완/리스크)
### 5.1 “진짜 오프라인 설치형(Setup.exe)” 완성
현재는 포터블 폴더 배포로 우회했으며, NSIS Setup.exe로 “모델 포함 오프라인 설치”를 완성하려면 아래 중 하나가 필요합니다.
- NSIS 대신 다른 설치기/아카이브 방식 채택(대용량 파일/2GB+ shard 안정 처리)
- 모델 파일을 여러 조각으로 분할/별도 페이로드로 처리하는 설치 전략
- 설치형은 런처만 제공하고 모델은 “오프라인 별도 파일(USB/외장) import” 흐름 제공

### 5.2 UI를 더 Suno-영감으로 고도화(디자인 완성도)
기본 톤/레이아웃은 잡혀 있으나, 다음 개선이 남아있습니다.
- 카드 피드 밀도, hover/transition, 섹션 구조(홈 피드, 추천/최근) 고도화
- 커버(앨범) 카드의 “그라디언트 생성 규칙/다양성” 강화
- Library의 메타 칩/정렬, Create의 옵션 패널 UX(슬라이더/칩) 더 정교화
단, Suno 리소스/폰트/아이콘 복제는 금지입니다.

### 5.3 “사용자 친화” 운영 기능
- 실패 시 가이드(로그 열기/재시도/CPU 모드) UX 강화
- LAN 모드에서 API Key 강제 및 UI에서 키 관리 UX 정리
- 오디오 저장 규칙/메타 저장(추적 가능) 고도화

## 6) 프로젝트 구조(현재 레포 기준)
핵심 디렉토리/역할:
- `acestep/`
  - Python 패키지(모델/추론/핸들러/유틸)
- `acestep/api_server.py`
  - FastAPI 서버(Studio UI가 호출하는 `/health`, `/v1/app-config`, `/v1/library`, 생성 API 등)
- `checkpoints/`
  - 모델 파일 다운로드/저장 디렉토리(온라인/로컬 실행 시 사용)
- `ui/app/`
  - Studio Web UI (Vite + React + TS)
  - 라우트: Loader/Home/Create/Library/Settings
- `desktop/`
  - Tauri 데스크톱 앱(Windows WebView2)
  - `desktop/src-tauri/src/lib.rs`: 백엔드 프로세스 스폰/환경변수/로그/리소스 경로 처리
  - `desktop/src-tauri/tauri.conf.json`: 기본 빌드 설정
  - `desktop/src-tauri/tauri.offline.conf.json`: 오프라인 번들 전용 설정(대용량 리소스 포함)
  - `desktop/src-tauri/resources/offline/`: 오프라인 페이로드 스테이징(backend + models + python_embeded)
- `scripts/`
  - 오프라인 스테이징/빌드 스크립트
  - `stage_offline_backend.ps1`, `stage_offline_models.ps1`, `build_offline_runtime.ps1`, `build_offline_installer.ps1`
- `docs/ko/desktop.md`
  - 데스크톱 실행/패키징 관련 문서(진행 상황/주의사항 포함)

## 7) 다음 단계(권장 우선순위)
1) “오프라인 설치형” 전략 결정
   - NSIS 고집 vs 다른 설치기/아카이브 방식 vs 모델 외부 페이로드
2) Loader UX 정리
   - 모델 초기화 진행 상태(`models_stage`) 표시, 로그 열기 버튼, 실패 원인 안내
3) UI 고도화
   - Home 피드/카드/레이아웃 밀도 개선(독자 디자인 유지)
4) Smoke test 자동화
   - 포터블 폴더 기준: 실행 → health → config → 짧은 생성 → library 표시까지 “한 번에” 검증
