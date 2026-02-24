# Installer (Scaffold)

이 폴더는 Windows 배포(Setup.exe) 스캐폴딩을 위한 자리입니다.

현실적인 배포 형태는 다음 2가지입니다.

1. **오프라인 풀 번들 설치형**: Python 런타임 + 앱 + 모델(수십 GB) 포함
2. **라이트 런처**: 앱만 포함, 첫 실행 시 모델 다운로드

현재 리포지토리는 1) 오프라인 풀 번들을 위해 아래 구성을 권장합니다.

- 앱: `ACE-Step Studio.exe` (Tauri 빌드 산출물)
- Python 런타임: `python_embeded/` (ACE-Step portable 패키지에서 가져옴)
- Backend 소스: `acestep/` 및 필요한 리소스
- 모델: `checkpoints/` 또는 `C:\\ProgramData\\ACE-Step\\checkpoints\\`

Inno Setup 예시 스크립트: `installer/inno/ACE-Step-Studio.iss`

