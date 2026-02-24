# ACE-Step Studio (Desktop GUI) - Windows

이 문서는 ACE-Step 1.5를 “Suno-영감(독자 디자인)” 데스크톱 GUI로 실행/빌드하는 방법을 설명합니다.

## 법적/디자인 노트

본 UI는 제공된 Suno 스크린샷을 참고해 정보 구조/사용성 감각을 따르되, 폰트/아이콘/그래픽 리소스/레이아웃을 픽셀 단위로 복제하지 않는 독자 디자인입니다.

## 구성

- Backend: `acestep/api_server.py` (FastAPI)
- Frontend: `ui/app/` (Vite + React + TS)
- Desktop: `desktop/` (Tauri v2, WebView2)

## 개발 실행 (Dev)

1. Python venv 준비(예시):

```powershell
cd C:\path\to\ACE-Step-1.5-main
python -m venv .venv
.\.venv\Scripts\pip.exe install -e .
```

2. Desktop 앱 실행(Dev):

```powershell
cd desktop
npm install
npm run tauri dev
```

- Desktop 런처가 Backend를 subprocess로 띄우고, UI가 로드됩니다.
- Backend 로그는 `%APPDATA%\ACE-Step Studio\backend.out.log`, `backend.err.log`에 저장됩니다.

## 릴리즈 빌드 (Build)

```powershell
cd desktop
npm install
npm run tauri build
```

생성된 산출물은 보통 `desktop/src-tauri/target/release/` 및 `desktop/src-tauri/target/release/bundle/` 아래에 생성됩니다.

## Portable 배포(개발용/실험용)

현재 런처는 다음 우선순위로 Python 런타임을 찾습니다.

1. `ACESTEP_STUDIO_PYTHON` 환경변수로 지정된 경로
2. `ACE-Step Studio.exe`와 같은 폴더의 `python_embeded\python.exe`
3. Backend 루트의 `.venv\Scripts\python.exe`
4. 시스템 `python`

따라서 다음과 같은 폴더 레이아웃으로도 실행할 수 있습니다.

```
ACE-Step Studio\
  ACE-Step Studio.exe
  python_embeded\
    python.exe
  acestep\
    ...
  checkpoints\
    ...
```

## 설정 파일 / 출력 폴더

- 설정: `%APPDATA%\ACE-Step Studio\config.json`
- 기본 출력 폴더: `%USERPROFILE%\Music\ACE-Step Studio\`

## 네트워크 모드(Local/LAN)

- 기본: Local(`127.0.0.1`)
- LAN 모드(`0.0.0.0`)는 API Key가 자동 생성/저장됩니다(설정 파일).

## LM(Thinking) 초기화 동작

- `ACESTEP_INIT_LLM`의 기본값은 `auto`이며, GPU VRAM 티어에 따라 5Hz LM 초기화를 자동으로 결정합니다.
- ACE-Step Studio 로더는 `/health`를 통해 모델 초기화 단계(`models_stage`)를 표시하고, 준비되면 설정(`/v1/app-config`)을 로드하여 메인 화면으로 진입합니다.
