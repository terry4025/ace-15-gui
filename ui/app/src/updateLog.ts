export type UpdateLogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: { en: string; ko: string };
  items: { en: string[]; ko: string[] };
};

export type UpdateLogViewEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

// Keep this updated on every improvement so the loader can show "what changed".
// Newest first.
export const UPDATE_LOG: UpdateLogEntry[] = [
  {
    version: "0.2.1",
    date: "2026-02-13",
    title: { en: "Visual Overhaul v5 + generation validation pass", ko: "비주얼 전면개편 v5 + 생성 검증 통과" },
    items: {
      en: [
        "Applied a second full visual pass with a new paper x neon editorial direction (sidebar, topbar, panels, hero, controls, cards, progress and tables).",
        "Improved contrast and focus states for every form control to reduce input mistakes under long sessions.",
        "Validated release_task end-to-end on the current backend (task queued and completed successfully).",
        "Kept API/route compatibility while changing only presentation tokens and style layers."
      ],
      ko: [
        "사이드바/탑바/패널/히어로/컨트롤/카드/진행바/테이블 전체를 paper x neon 에디토리얼 방향으로 한 번 더 전면 재설계했습니다.",
        "장시간 작업 시 입력 실수를 줄이도록 폼 컨트롤 대비와 포커스 상태를 전반적으로 강화했습니다.",
        "현재 백엔드 기준 release_task 실제 제출-완료까지 E2E 검증을 통과했습니다.",
        "API 및 라우트 호환성은 유지하고 표현 계층(토큰/스타일)만 변경했습니다."
      ]
    }
  },
  {
    version: "0.2.0",
    date: "2026-02-13",
    title: { en: "Major visual overhaul + generation failure diagnostics", ko: "대규모 비주얼 개편 + 생성 실패 진단 강화" },
    items: {
      en: [
        "Applied a new neo-print visual system (color tokens, panel contrast, nav/topbar tone, refreshed controls) for a clearly different Studio look.",
        "Backend now uses thinking-aware CoT defaults so requests with thinking OFF no longer trigger optional LM CoT by default.",
        "Task failure/cancel details are now surfaced consistently in query_result and local cache responses.",
        "App-config update endpoint now accepts JSON body, nested body payloads, and query body fallback safely."
      ],
      ko: [
        "Studio 전체 톤을 neo-print 스타일로 재구성했습니다(색상 토큰, 패널 대비, 내비/탑바 톤, 컨트롤 스타일 전면 교체).",
        "백엔드 CoT 기본값을 thinking 연동형으로 바꿔 Thinking OFF 요청에서 선택적 LM CoT가 기본 활성화되지 않도록 했습니다.",
        "작업 실패/취소 원인이 query_result 및 로컬 캐시 응답에서 일관되게 보이도록 개선했습니다.",
        "app-config 저장 API가 JSON 본문, 중첩 body, query body fallback을 안전하게 수용합니다."
      ]
    }
  },
  {
    version: "0.1.9",
    date: "2026-02-09",
    title: { en: "Base models selectable + better dropdown UI", ko: "Base 모델 선택 가능 + 드롭다운 UI 개선" },
    items: {
      en: [
        "Studio now always lists base-family DiT models (e.g. acestep-v15-base, acestep-v15-sft) even before download; selecting one triggers auto-download.",
        "Edit (v2) auto-switches away from turbo for advanced tasks when a base-family model is available.",
        "Select/dropdown styling improved for higher contrast (less gray)."
      ],
      ko: [
        "이제 base 계열 DiT 모델(예: acestep-v15-base, acestep-v15-sft)이 다운로드 전이어도 목록에 표시되며, 선택하면 자동 다운로드됩니다.",
        "Edit(v2) 고급 작업(Extract/Layer/Extend)에서 base 계열 모델이 있으면 turbo에서 자동 전환됩니다.",
        "셀렉트/드롭다운 스타일을 더 선명하게 개선했습니다(회색 느낌 감소)."
      ]
    }
  },
  {
    version: "0.1.8",
    date: "2026-02-09",
    title: {
      en: "Fix Windows startup crash + re-download incomplete checkpoints",
      ko: "Windows 시작 크래시 수정 + 불완전 체크포인트 자동 재다운로드"
    },
    items: {
      en: [
        "Backend now forces UTF-8 stdout/stderr to prevent startup crashes on Windows locales (cp949) when printing unicode status.",
        "Model auto-download now validates actual weight files; incomplete checkpoint folders are treated as corrupt and re-downloaded automatically."
      ],
      ko: [
        "백엔드 stdout/stderr를 UTF-8로 강제하여 Windows 로캘(cp949)에서 유니코드 출력 때문에 서버가 죽는 문제를 막았습니다.",
        "모델 자동 다운로드가 실제 weight 파일 존재를 검증합니다. 불완전한 체크포인트 폴더는 손상으로 판단해 자동 재다운로드합니다."
      ]
    }
  },
  {
    version: "0.1.7",
    date: "2026-02-09",
    title: { en: "Edit v2: Extend/Layer/Extract + multi-output results", ko: "Edit v2: Extend/Layer/Extract + 멀티 결과 표시" },
    items: {
      en: [
        "Added Extend (complete), Layer (lego), and Extract task types to Edit (v2) with advanced options (track selection, completion classes, region controls).",
        "Result view now parses /query_result payload directly so multi-audio tasks can show multiple outputs without relying on library scan."
      ],
      ko: [
        "Edit(v2)에 Extend(complete), Layer(lego), Extract 작업을 추가하고 고급 옵션(트랙 선택/완성 클래스/구간 제어)을 넣었습니다.",
        "/query_result 결과를 직접 파싱해 멀티 오디오 작업도 여러 결과를 바로 표시합니다(라이브러리 스캔 의존 제거)."
      ]
    }
  },
  {
    version: "0.1.6",
    date: "2026-02-09",
    title: {
      en: "Edit v2 (Cover/Repaint) + Korean Update Log + generation progress bar",
      ko: "Edit v2(Cover/Repaint) 동작 + 업데이트 로그 한글화 + 생성 진행바 추가"
    },
    items: {
      en: [
        "Edit v2 is now functional for Cover/Repaint via multipart uploads to `/release_task`.",
        "Update Log entries and the modal intro are localized (Korean/English).",
        "Create/Edit now show an animated progress bar while generating to make in-progress state obvious."
      ],
      ko: [
        "Edit v2에서 Cover/Repaint가 실제로 동작합니다(`/release_task` multipart 업로드로 연결).",
        "Update Log 항목과 안내 문구를 한글/영문으로 표시합니다.",
        "Create/Edit에서 생성 중 애니메이션 진행바를 표시해 진행 상태를 더 명확히 했습니다."
      ]
    }
  },
  {
    version: "0.1.5",
    date: "2026-02-09",
    title: { en: "Fix Windows cp949 crash during model load", ko: "Windows(cp949) 환경에서 모델 로드시 크래시 수정" },
    items: {
      en: [
        "Forced backend Python stdio to UTF-8 to prevent crashes like: `cp949 codec can't encode character \\u274c`.",
        "This stops loader failures when the backend prints unicode status markers (e.g. ❌) during init.",
        "No changes to generation quality; this is a Windows reliability fix."
      ],
      ko: [
        "백엔드 Python 로그 인코딩을 UTF-8로 강제하여 `cp949 codec can't encode character \\u274c`류 크래시를 방지했습니다.",
        "초기화 중 유니코드 상태 마커(예: ❌)를 출력해도 로더가 멈추지 않습니다.",
        "생성 품질 변화는 없고, Windows 안정성 개선입니다."
      ]
    }
  },
  {
    version: "0.1.4",
    date: "2026-02-09",
    title: { en: "Fix wrong API port showing in sidebar", ko: "사이드바 API 포트 표시 오류 수정" },
    items: {
      en: [
        "If Studio has a stale saved API base URL (old port), it now self-heals by re-syncing from Tauri and falling back to 8001 when reachable.",
        "This prevents cases where the sidebar shows a dead port like 57016 even though the backend is actually on 8001.",
        "No changes to generation behavior."
      ],
      ko: [
        "저장된 API base URL(이전 포트)이 오래됐을 때, Tauri에서 현재 백엔드 URL을 재동기화하고 가능하면 8001로 자동 복구합니다.",
        "백엔드는 8001인데 UI만 57016 같은 죽은 포트를 보여주는 문제를 막습니다.",
        "생성 동작 변화는 없습니다."
      ]
    }
  },
  {
    version: "0.1.3",
    date: "2026-02-09",
    title: { en: "Default saves moved to E:\\test", ko: "기본 저장 위치를 E:\\test로 변경" },
    items: {
      en: [
        "On Windows, when `E:\\\\test` exists, Studio now defaults config/logs/cache/outputs under that folder to avoid filling C:.",
        "You can still change `output_dir` in Settings; this just changes the default and aligns the backend with the launcher."
      ],
      ko: [
        "Windows에서 `E:\\\\test`가 존재하면, C: 용량을 채우지 않도록 기본 config/log/cache/output 경로를 해당 폴더 아래로 둡니다.",
        "Settings에서 `output_dir` 변경은 그대로 가능하며, 기본값만 바뀌고 백엔드와 런처 설정을 일치시킵니다."
      ]
    }
  },
  {
    version: "0.1.2",
    date: "2026-02-09",
    title: { en: "Fix loader stalls from stale API ports", ko: "이전 포트 때문에 로더가 멈추는 현상 수정" },
    items: {
      en: [
        "Loader now refreshes the backend URL more robustly (supports multiple Tauri global API shapes) to avoid getting stuck on a dead port after relaunch.",
        "Sidebar API link stays in sync with the currently spawned backend even when Windows assigns a dynamic port."
      ],
      ko: [
        "재실행 후 죽은 포트에 고착되는 문제를 막기 위해, 로더가 백엔드 URL을 더 견고하게 재조회합니다(Tauri 전역 API 형태 여러 케이스 지원).",
        "Windows에서 동적 포트가 할당되더라도 사이드바 API 링크가 현재 백엔드와 동기화됩니다."
      ]
    }
  },
  {
    version: "0.1.1",
    date: "2026-02-09",
    title: { en: "Feed-first cards + clearer status surfaces", ko: "피드형 카드 밀도 개선 + 상태 표시 개선" },
    items: {
      en: [
        "Suno-inspired (not copied) feed density: cover tiles + tighter cards for faster scanning.",
        "Update Log is treated as the source of truth for what changed in the current build."
      ],
      ko: [
        "Suno에서 영감만 얻고 복제하지 않은 방식으로 피드 밀도(커버 타일/타이트한 카드)를 개선했습니다.",
        "Update Log를 현재 빌드 변경사항의 기준으로 사용합니다."
      ]
    }
  },
  {
    version: "0.1.0",
    date: "2026-02-09",
    title: { en: "Initial Studio UI build", ko: "Studio UI 초기 빌드" },
    items: {
      en: [
        "Added loader Update Log so users can confirm version and changes in-app.",
        "Home/Library visuals refined for denser feed-style browsing (inspired, not copied)."
      ],
      ko: [
        "로더에 Update Log를 추가하여 버전/변경사항을 앱 안에서 확인할 수 있게 했습니다.",
        "Home/Library 비주얼을 더 조밀한 피드형 브라우징에 맞게 개선했습니다(영감, 복제 아님)."
      ]
    }
  }
];

export function getUpdateLog(lang?: string): UpdateLogViewEntry[] {
  const isKo = String(lang || "").toLowerCase().startsWith("ko");
  return UPDATE_LOG.map((e) => ({
    version: e.version,
    date: e.date,
    title: isKo ? e.title.ko : e.title.en,
    items: isKo ? e.items.ko : e.items.en
  }));
}

export function isUpdateLogFresh(uiVersion: string): boolean {
  const latest = UPDATE_LOG.length ? UPDATE_LOG[0].version : "";
  return !!latest && latest === String(uiVersion || "");
}
