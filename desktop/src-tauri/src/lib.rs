use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Manager, State, WindowEvent};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
#[cfg(target_os = "windows")]
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
#[cfg(target_os = "windows")]
use windows::Win32::Media::Audio::{
    eCapture, eCommunications, eConsole, ERole, IMMDeviceEnumerator, MMDeviceEnumerator,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};

#[derive(Default)]
struct BackendState {
    url: Mutex<String>,
    child: Mutex<Option<Child>>,
    mic_apply_last_error_code: Mutex<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StudioConfig {
    version: Option<u32>,
    output_dir: Option<String>,
    bind_mode: Option<String>,
    api_key: Option<String>,
    dit_model: Option<String>,
    lm_model: Option<String>,
    lm_backend: Option<String>,
    download_source: Option<String>,
    language: Option<String>,
    mic_sync_enabled: Option<bool>,
    mic_input_volume_percent: Option<i32>,
}

impl StudioConfig {
    fn mic_sync_enabled(&self) -> bool {
        self.mic_sync_enabled.unwrap_or(false)
    }

    fn mic_input_volume_percent(&self) -> i32 {
        self.mic_input_volume_percent.unwrap_or(100).clamp(0, 100)
    }
}

#[cfg(not(target_os = "windows"))]
const MIC_ERR_UNSUPPORTED_PLATFORM: &str = "UNSUPPORTED_PLATFORM";
const MIC_ERR_COM_INIT_FAILED: &str = "COM_INIT_FAILED";
const MIC_ERR_NO_CAPTURE_ENDPOINT: &str = "NO_CAPTURE_ENDPOINT";
const MIC_ERR_ENDPOINT_ACTIVATE_FAILED: &str = "ENDPOINT_ACTIVATE_FAILED";
const MIC_ERR_SET_VOLUME_FAILED: &str = "SET_VOLUME_FAILED";
const MIC_ERR_READ_VOLUME_FAILED: &str = "READ_VOLUME_FAILED";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SystemMicRoleState {
    role: String,
    supported: bool,
    volume_percent: Option<i32>,
    muted: Option<bool>,
    error_code: Option<String>,
    error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SystemMicStateResponse {
    supported: bool,
    roles: Vec<SystemMicRoleState>,
    error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SetSystemMicVolumeResponse {
    supported: bool,
    requested_volume_percent: i32,
    roles: Vec<SystemMicRoleState>,
    error_code: Option<String>,
}

fn wire_packaged_resources(resource_dir: &Path) -> bool {
    // Support layouts:
    // 1) resource_dir/backend/acestep (legacy)
    // 2) resource_dir/offline/backend/acestep (offline bundle plan)
    // 3) resource_dir/acestep (simple copy of the repo folder)
    let mut root_set = false;
    let mut python_set = false;
    let backend_root = resource_dir.join("backend");
    if backend_root.join("acestep").is_dir() {
        std::env::set_var(
            "ACESTEP_STUDIO_ROOT",
            backend_root.to_string_lossy().to_string(),
        );
        root_set = true;
    } else if resource_dir
        .join("offline")
        .join("backend")
        .join("acestep")
        .is_dir()
    {
        std::env::set_var(
            "ACESTEP_STUDIO_ROOT",
            resource_dir
                .join("offline")
                .join("backend")
                .to_string_lossy()
                .to_string(),
        );
        root_set = true;
    } else if resource_dir.join("acestep").is_dir() {
        std::env::set_var(
            "ACESTEP_STUDIO_ROOT",
            resource_dir.to_string_lossy().to_string(),
        );
        root_set = true;
    }

    let embedded_python = resource_dir.join("python_embeded").join("python.exe");
    if embedded_python.exists() {
        std::env::set_var(
            "ACESTEP_STUDIO_PYTHON",
            embedded_python.to_string_lossy().to_string(),
        );
        python_set = true;
    } else {
        let embedded_python = resource_dir
            .join("offline")
            .join("python_embeded")
            .join("python.exe");
        if embedded_python.exists() {
            std::env::set_var(
                "ACESTEP_STUDIO_PYTHON",
                embedded_python.to_string_lossy().to_string(),
            );
            python_set = true;
        }
    }

    // Root is required to start the backend; python is optional if users override.
    if !root_set && python_set {
        log_launcher_error(&format!(
            "WARN: Found embedded python under resource_dir but did not find backend root. resource_dir={}",
            resource_dir.to_string_lossy()
        ));
    }
    root_set
}

fn log_launcher_error(msg: &str) {
    // Best-effort persistent log. This is critical on Windows where stdout/stderr
    // from a GUI app is typically not visible.
    let log_dir = default_config_dir();
    let _ = fs::create_dir_all(&log_dir);
    let path = log_dir.join("launcher.err.log");
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{msg}");
    }
}

fn default_config_dir() -> PathBuf {
    if let Ok(v) = std::env::var("ACESTEP_STUDIO_CONFIG_DIR") {
        if !v.trim().is_empty() {
            return PathBuf::from(v);
        }
    }
    // User preference: if E:\test exists, store Studio state there to avoid filling C:.
    // Can be overridden by ACESTEP_STUDIO_CONFIG_DIR at runtime.
    if cfg!(target_os = "windows") {
        let e_test = PathBuf::from(r"E:\test");
        if e_test.is_dir() {
            return e_test.join("ACE-Step Studio").join("config");
        }
    }
    if cfg!(target_os = "windows") {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("ACE-Step Studio");
        }
        if let Some(home) = dirs_next::home_dir() {
            return home.join("AppData").join("Roaming").join("ACE-Step Studio");
        }
    }
    if let Some(home) = dirs_next::home_dir() {
        return home.join(".config").join("ace-step-studio");
    }
    PathBuf::from(".")
}

fn config_path() -> PathBuf {
    default_config_dir().join("config.json")
}

fn backend_pid_path() -> PathBuf {
    default_config_dir().join("backend.pid")
}

fn kill_stale_backend_if_any() {
    // If Studio previously crashed, the backend may still be running and holding port 8001.
    // We record the child PID and best-effort terminate it on next launch.
    let pid_path = backend_pid_path();
    let pid_str = fs::read_to_string(&pid_path).ok().unwrap_or_default();
    let pid = pid_str.trim().parse::<u32>().ok();
    if pid.is_none() {
        return;
    }

    #[cfg(target_os = "windows")]
    {
        // /T: kill child processes, /F: force
        let _ = Command::new("taskkill")
            .arg("/PID")
            .arg(pid.unwrap().to_string())
            .arg("/T")
            .arg("/F")
            .output();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
    }

    let _ = fs::remove_file(&pid_path);
}

fn default_output_dir() -> String {
    // User preference: if E:\test exists, default outputs there (can still be changed in Settings).
    if cfg!(target_os = "windows") {
        let e_test = PathBuf::from(r"E:\test");
        if e_test.is_dir() {
            return e_test
                .join("ACE-Step Studio")
                .join("outputs")
                .to_string_lossy()
                .to_string();
        }
    }
    if let Some(home) = dirs_next::home_dir() {
        return home
            .join("Music")
            .join("ACE-Step Studio")
            .to_string_lossy()
            .to_string();
    }
    "ACE-Step Studio".to_string()
}

fn load_or_init_config() -> StudioConfig {
    let p = config_path();
    if let Ok(s) = fs::read_to_string(&p) {
        if let Ok(mut cfg) = serde_json::from_str::<StudioConfig>(&s) {
            // Keep backward compatibility with older config files that do not
            // include mic fields yet, and avoid persisting `null` values.
            let mut touched = false;
            if cfg.mic_sync_enabled.is_none() {
                cfg.mic_sync_enabled = Some(false);
                touched = true;
            }
            let mic_percent = cfg.mic_input_volume_percent.unwrap_or(100).clamp(0, 100);
            if cfg.mic_input_volume_percent != Some(mic_percent) {
                cfg.mic_input_volume_percent = Some(mic_percent);
                touched = true;
            }
            // If the user has E:\test, prefer it for outputs going forward unless explicitly changed.
            // This keeps the default behavior consistent across portable installs.
            if cfg!(target_os = "windows") {
                let e_root = PathBuf::from(r"E:\test")
                    .join("ACE-Step Studio")
                    .join("outputs");
                if e_root.parent().map(|p| p.is_dir()).unwrap_or(false) {
                    let cur = cfg.output_dir.clone().unwrap_or_default();
                    let cur_l = cur.to_ascii_lowercase();
                    let want_l = e_root.to_string_lossy().to_string().to_ascii_lowercase();
                    if !cur_l.starts_with(&want_l) {
                        let mut next = cfg;
                        next.output_dir = Some(default_output_dir());
                        save_config(&next);
                        return next;
                    }
                }
            }
            if touched {
                save_config(&cfg);
            }
            return cfg;
        }
    }
    let cfg = StudioConfig {
        version: Some(1),
        output_dir: Some(default_output_dir()),
        bind_mode: Some("local".to_string()),
        api_key: Some(String::new()),
        dit_model: Some("acestep-v15-turbo".to_string()),
        lm_model: Some("acestep-5Hz-lm-4B".to_string()),
        lm_backend: Some("pt".to_string()),
        download_source: Some("auto".to_string()),
        language: Some("ko".to_string()),
        mic_sync_enabled: Some(false),
        mic_input_volume_percent: Some(100),
    };
    save_config(&cfg);
    cfg
}

fn save_config(cfg: &StudioConfig) {
    let p = config_path();
    if let Some(dir) = p.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(&p, s);
    }
}

fn clamp_mic_percent(v: i32) -> i32 {
    v.clamp(0, 100)
}

fn scalar_to_percent(v: f32) -> i32 {
    ((v.clamp(0.0, 1.0) * 100.0).round() as i32).clamp(0, 100)
}

fn percent_to_scalar(v: i32) -> f32 {
    clamp_mic_percent(v) as f32 / 100.0
}

fn mic_role_labels() -> [&'static str; 2] {
    ["console", "communications"]
}

fn build_mic_role_error(
    role: &str,
    code: &str,
    message: impl Into<String>,
) -> SystemMicRoleState {
    SystemMicRoleState {
        role: role.to_string(),
        supported: false,
        volume_percent: None,
        muted: None,
        error_code: Some(code.to_string()),
        error_message: Some(message.into()),
    }
}

#[cfg(not(target_os = "windows"))]
fn build_unsupported_mic_state() -> SystemMicStateResponse {
    let roles = mic_role_labels()
        .iter()
        .map(|role| build_mic_role_error(role, MIC_ERR_UNSUPPORTED_PLATFORM, "Windows desktop runtime only"))
        .collect();
    SystemMicStateResponse {
        supported: false,
        roles,
        error_code: Some(MIC_ERR_UNSUPPORTED_PLATFORM.to_string()),
    }
}

#[cfg(not(target_os = "windows"))]
fn build_unsupported_set_response(requested_volume_percent: i32) -> SetSystemMicVolumeResponse {
    let roles = mic_role_labels()
        .iter()
        .map(|role| build_mic_role_error(role, MIC_ERR_UNSUPPORTED_PLATFORM, "Windows desktop runtime only"))
        .collect();
    SetSystemMicVolumeResponse {
        supported: false,
        requested_volume_percent: clamp_mic_percent(requested_volume_percent),
        roles,
        error_code: Some(MIC_ERR_UNSUPPORTED_PLATFORM.to_string()),
    }
}

fn first_role_error_code(roles: &[SystemMicRoleState]) -> Option<String> {
    roles.iter().find_map(|r| r.error_code.clone())
}

fn set_last_mic_apply_error(state: &BackendState, code: Option<String>) {
    *state.mic_apply_last_error_code.lock().unwrap() = code;
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct MicRoleSpec {
    label: &'static str,
    role: ERole,
}

#[cfg(target_os = "windows")]
const MIC_ROLE_SPECS: [MicRoleSpec; 2] = [
    MicRoleSpec {
        label: "console",
        role: eConsole,
    },
    MicRoleSpec {
        label: "communications",
        role: eCommunications,
    },
];

#[cfg(target_os = "windows")]
struct ComGuard {
    should_uninitialize: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    fn init() -> Result<Self, String> {
        // SAFETY: COM is initialized per command call. We explicitly handle
        // RPC_E_CHANGED_MODE because another runtime component may already
        // own the apartment model on this thread.
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if hr.is_ok() {
            return Ok(Self {
                should_uninitialize: true,
            });
        }
        if hr == RPC_E_CHANGED_MODE {
            return Ok(Self {
                should_uninitialize: false,
            });
        }
        Err(format!("CoInitializeEx failed: 0x{:08X}", hr.0 as u32))
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninitialize {
            // SAFETY: Matches a successful CoInitializeEx call in this scope.
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn read_role_state(enumerator: &IMMDeviceEnumerator, spec: MicRoleSpec) -> SystemMicRoleState {
    let device = match unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, spec.role) } {
        Ok(v) => v,
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_NO_CAPTURE_ENDPOINT,
                format!("GetDefaultAudioEndpoint failed: {e}"),
            );
        }
    };

    let endpoint = match unsafe { device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) } {
        Ok(v) => v,
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_ENDPOINT_ACTIVATE_FAILED,
                format!("IMMDevice::Activate failed: {e}"),
            );
        }
    };

    let volume_percent = match unsafe { endpoint.GetMasterVolumeLevelScalar() } {
        Ok(v) => scalar_to_percent(v),
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_READ_VOLUME_FAILED,
                format!("GetMasterVolumeLevelScalar failed: {e}"),
            );
        }
    };

    let muted = match unsafe { endpoint.GetMute() } {
        Ok(v) => v.as_bool(),
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_READ_VOLUME_FAILED,
                format!("GetMute failed: {e}"),
            );
        }
    };

    SystemMicRoleState {
        role: spec.label.to_string(),
        supported: true,
        volume_percent: Some(volume_percent),
        muted: Some(muted),
        error_code: None,
        error_message: None,
    }
}

#[cfg(target_os = "windows")]
fn apply_role_volume(
    enumerator: &IMMDeviceEnumerator,
    spec: MicRoleSpec,
    target_percent: i32,
) -> SystemMicRoleState {
    let device = match unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, spec.role) } {
        Ok(v) => v,
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_NO_CAPTURE_ENDPOINT,
                format!("GetDefaultAudioEndpoint failed: {e}"),
            );
        }
    };

    let endpoint = match unsafe { device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) } {
        Ok(v) => v,
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_ENDPOINT_ACTIVATE_FAILED,
                format!("IMMDevice::Activate failed: {e}"),
            );
        }
    };

    if let Err(e) = unsafe {
        endpoint.SetMasterVolumeLevelScalar(percent_to_scalar(target_percent), std::ptr::null())
    } {
        return build_mic_role_error(
            spec.label,
            MIC_ERR_SET_VOLUME_FAILED,
            format!("SetMasterVolumeLevelScalar failed: {e}"),
        );
    }

    let volume_percent = match unsafe { endpoint.GetMasterVolumeLevelScalar() } {
        Ok(v) => scalar_to_percent(v),
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_READ_VOLUME_FAILED,
                format!("GetMasterVolumeLevelScalar failed after set: {e}"),
            );
        }
    };

    let muted = match unsafe { endpoint.GetMute() } {
        Ok(v) => v.as_bool(),
        Err(e) => {
            return build_mic_role_error(
                spec.label,
                MIC_ERR_READ_VOLUME_FAILED,
                format!("GetMute failed after set: {e}"),
            );
        }
    };

    SystemMicRoleState {
        role: spec.label.to_string(),
        supported: true,
        volume_percent: Some(volume_percent),
        muted: Some(muted),
        error_code: None,
        error_message: None,
    }
}

#[cfg(target_os = "windows")]
fn get_system_mic_state_impl() -> SystemMicStateResponse {
    let _com = match ComGuard::init() {
        Ok(v) => v,
        Err(msg) => {
            let roles = mic_role_labels()
                .iter()
                .map(|role| build_mic_role_error(role, MIC_ERR_COM_INIT_FAILED, msg.clone()))
                .collect();
            return SystemMicStateResponse {
                supported: false,
                roles,
                error_code: Some(MIC_ERR_COM_INIT_FAILED.to_string()),
            };
        }
    };

    let enumerator: IMMDeviceEnumerator =
        match unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) } {
            Ok(v) => v,
            Err(e) => {
                let msg = format!("CoCreateInstance(MMDeviceEnumerator) failed: {e}");
                let roles = mic_role_labels()
                    .iter()
                    .map(|role| build_mic_role_error(role, MIC_ERR_NO_CAPTURE_ENDPOINT, msg.clone()))
                    .collect();
                return SystemMicStateResponse {
                    supported: false,
                    roles,
                    error_code: Some(MIC_ERR_NO_CAPTURE_ENDPOINT.to_string()),
                };
            }
        };

    let roles: Vec<SystemMicRoleState> = MIC_ROLE_SPECS
        .iter()
        .map(|spec| read_role_state(&enumerator, *spec))
        .collect();
    let supported = roles.iter().any(|r| r.supported);
    let error_code = first_role_error_code(&roles);

    SystemMicStateResponse {
        supported,
        roles,
        error_code,
    }
}

#[cfg(target_os = "windows")]
fn set_system_mic_volume_impl(requested_volume_percent: i32) -> SetSystemMicVolumeResponse {
    let target = clamp_mic_percent(requested_volume_percent);
    let _com = match ComGuard::init() {
        Ok(v) => v,
        Err(msg) => {
            let roles = mic_role_labels()
                .iter()
                .map(|role| build_mic_role_error(role, MIC_ERR_COM_INIT_FAILED, msg.clone()))
                .collect();
            return SetSystemMicVolumeResponse {
                supported: false,
                requested_volume_percent: target,
                roles,
                error_code: Some(MIC_ERR_COM_INIT_FAILED.to_string()),
            };
        }
    };

    let enumerator: IMMDeviceEnumerator =
        match unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) } {
            Ok(v) => v,
            Err(e) => {
                let msg = format!("CoCreateInstance(MMDeviceEnumerator) failed: {e}");
                let roles = mic_role_labels()
                    .iter()
                    .map(|role| build_mic_role_error(role, MIC_ERR_NO_CAPTURE_ENDPOINT, msg.clone()))
                    .collect();
                return SetSystemMicVolumeResponse {
                    supported: false,
                    requested_volume_percent: target,
                    roles,
                    error_code: Some(MIC_ERR_NO_CAPTURE_ENDPOINT.to_string()),
                };
            }
        };

    let roles: Vec<SystemMicRoleState> = MIC_ROLE_SPECS
        .iter()
        .map(|spec| apply_role_volume(&enumerator, *spec, target))
        .collect();
    let supported = roles.iter().any(|r| r.supported);
    let error_code = first_role_error_code(&roles);

    SetSystemMicVolumeResponse {
        supported,
        requested_volume_percent: target,
        roles,
        error_code,
    }
}

#[cfg(not(target_os = "windows"))]
fn get_system_mic_state_impl() -> SystemMicStateResponse {
    build_unsupported_mic_state()
}

#[cfg(not(target_os = "windows"))]
fn set_system_mic_volume_impl(requested_volume_percent: i32) -> SetSystemMicVolumeResponse {
    build_unsupported_set_response(requested_volume_percent)
}

fn random_key() -> String {
    use rand::RngCore;
    let mut buf = [0u8; 24];
    rand::rng().fill_bytes(&mut buf);
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, buf)
}

fn pick_port(preferred: u16) -> u16 {
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return preferred;
    }
    let l = TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral port");
    l.local_addr().unwrap().port()
}

fn backend_responds_on_8001() -> bool {
    // Minimal HTTP probe without extra deps.
    // This is used to prefer stable port 8001 even when it is already occupied by an existing backend.
    let addr = "127.0.0.1:8001";
    let sock = addr.parse().ok();
    if sock.is_none() {
        return false;
    }
    let sock = sock.unwrap();
    let mut s = match std::net::TcpStream::connect_timeout(&sock, Duration::from_millis(350)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = s.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = s.set_write_timeout(Some(Duration::from_millis(500)));

    let req = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if s.write_all(req).is_err() {
        return false;
    }

    let mut buf = [0u8; 512];
    let n = match s.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    head.contains(" 200 ") || head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")
}

fn find_backend_root() -> Option<PathBuf> {
    if let Ok(v) = std::env::var("ACESTEP_STUDIO_ROOT") {
        let p = PathBuf::from(v);
        if p.join("acestep").is_dir() {
            return Some(p);
        }
    }

    fn walk_up(mut p: PathBuf) -> Option<PathBuf> {
        for _ in 0..8 {
            if p.join("pyproject.toml").exists() && p.join("acestep").is_dir() {
                return Some(p);
            }
            if !p.pop() {
                break;
            }
        }
        None
    }

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(p) = walk_up(cwd) {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Packaged/portable layout: allow running if the folder next to the exe
            // contains the Python package sources directly.
            if dir.join("acestep").is_dir() {
                return Some(dir.to_path_buf());
            }
            if let Some(p) = walk_up(dir.to_path_buf()) {
                return Some(p);
            }
        }
    }
    None
}

fn spawn_backend(state: &BackendState) -> Result<(), String> {
    kill_stale_backend_if_any();

    let mut cfg = load_or_init_config();
    if cfg.mic_sync_enabled() {
        let requested = cfg.mic_input_volume_percent();
        let applied = set_system_mic_volume_impl(requested);
        let code = applied
            .error_code
            .clone()
            .or_else(|| first_role_error_code(&applied.roles));
        if let Some(c) = code.clone() {
            log_launcher_error(&format!(
                "WARN: failed to apply system mic volume at startup (requested={} code={})",
                requested, c
            ));
        }
        set_last_mic_apply_error(state, code);
    } else {
        set_last_mic_apply_error(state, None);
    }
    let bind_mode = cfg.bind_mode.clone().unwrap_or_else(|| "local".to_string());
    let host = if bind_mode == "lan" {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    let mut api_key = cfg.api_key.clone().unwrap_or_default();
    if bind_mode == "lan" && api_key.trim().is_empty() {
        api_key = random_key();
        cfg.api_key = Some(api_key.clone());
        save_config(&cfg);
    }

    // Prefer stable port 8001. If it's already in use but looks like our backend is running there,
    // reuse it rather than switching to a random port (which confuses users and breaks old links).
    if TcpListener::bind(("127.0.0.1", 8001)).is_err() && backend_responds_on_8001() {
        let url = "http://127.0.0.1:8001".to_string();
        *state.url.lock().unwrap() = url;
        return Ok(());
    }
    let port = pick_port(8001);
    let url = format!("http://127.0.0.1:{port}");
    *state.url.lock().unwrap() = url.clone();

    let root = find_backend_root()
        .ok_or_else(|| "Could not locate backend root (pyproject.toml).".to_string())?;

    // Log into the same config dir.
    let log_dir = default_config_dir();
    let _ = fs::create_dir_all(&log_dir);
    let stdout_path = log_dir.join("backend.out.log");
    let stderr_path = log_dir.join("backend.err.log");

    let stdout = fs::File::create(stdout_path).map_err(|e| e.to_string())?;
    let stderr = fs::File::create(stderr_path).map_err(|e| e.to_string())?;

    // Prefer an explicit override, then a portable embedded python, then a repo-local venv, then system python.
    let python = if let Ok(v) = std::env::var("ACESTEP_STUDIO_PYTHON") {
        let p = PathBuf::from(v);
        if p.exists() {
            p
        } else {
            PathBuf::from("python")
        }
    } else if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let embedded = exe_dir.join("python_embeded").join("python.exe");
        if embedded.exists() {
            embedded
        } else {
            let venv_python = root.join(".venv").join("Scripts").join("python.exe");
            if venv_python.exists() {
                venv_python
            } else {
                PathBuf::from("python")
            }
        }
    } else {
        let venv_python = root.join(".venv").join("Scripts").join("python.exe");
        if venv_python.exists() {
            venv_python
        } else {
            PathBuf::from("python")
        }
    };

    let mut cmd = Command::new(python);
    cmd.current_dir(&root);
    // Windows default stdio encoding can be cp949; backend prints unicode markers like "❌" in status/error strings.
    // Force UTF-8 so the backend never crashes while writing logs.
    cmd.env("PYTHONUTF8", "1");
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.arg("-X").arg("utf8");
    cmd.arg("-m")
        .arg("acestep.api_server")
        .arg("--host")
        .arg(host)
        .arg("--port")
        .arg(port.to_string());
    if !api_key.trim().is_empty() {
        cmd.arg("--api-key").arg(api_key.trim());
    }

    // Prefer stable settings on Windows; users can override from UI per-request.
    cmd.env("ACESTEP_API_PORT", port.to_string());
    cmd.env("ACESTEP_API_HOST", host);
    // Keep backend's config/output aligned with the launcher (Python also reads these env vars).
    cmd.env(
        "ACESTEP_STUDIO_CONFIG_DIR",
        default_config_dir().to_string_lossy().to_string(),
    );
    if let Some(out) = cfg.output_dir.clone().filter(|v| !v.trim().is_empty()) {
        cmd.env("ACESTEP_STUDIO_OUTPUT_DIR", out);
    } else {
        cmd.env("ACESTEP_STUDIO_OUTPUT_DIR", default_output_dir());
    }
    cmd.env(
        "ACESTEP_LM_BACKEND",
        cfg.lm_backend.clone().unwrap_or_else(|| "pt".to_string()),
    );
    cmd.env(
        "ACESTEP_LM_MODEL_PATH",
        cfg.lm_model
            .clone()
            .unwrap_or_else(|| "acestep-5Hz-lm-4B".to_string()),
    );
    cmd.env(
        "ACESTEP_CONFIG_PATH",
        cfg.dit_model
            .clone()
            .unwrap_or_else(|| "acestep-v15-turbo".to_string()),
    );
    cmd.env(
        "ACESTEP_DOWNLOAD_SOURCE",
        cfg.download_source
            .clone()
            .unwrap_or_else(|| "auto".to_string()),
    );
    // Default to auto so the backend can choose based on GPU tier (per docs).
    // If the parent environment explicitly sets ACESTEP_INIT_LLM, honor it.
    if std::env::var("ACESTEP_INIT_LLM")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .is_none()
    {
        cmd.env("ACESTEP_INIT_LLM", "auto");
    }
    // Keep caches/temp files out of the install dir (which may be read-only).
    // Users can override via Settings -> output_dir; cache is internal.
    let cache_dir = if cfg!(target_os = "windows") {
        let e_test = PathBuf::from(r"E:\test");
        if e_test.is_dir() {
            e_test.join("ACE-Step Studio").join("cache")
        } else if let Ok(v) = std::env::var("LOCALAPPDATA") {
            PathBuf::from(v).join("ACE-Step Studio").join("cache")
        } else {
            default_config_dir().join("cache")
        }
    } else {
        default_config_dir().join("cache")
    };
    cmd.env("ACESTEP_CACHE_DIR", cache_dir.to_string_lossy().to_string());

    // Ensure checkpoints download into a user-writable location and not inside the portable/installed app dir.
    // This prevents the desktop/portable folder from ballooning over time.
    let checkpoint_dir = if cfg!(target_os = "windows") {
        let e_test = PathBuf::from(r"E:\test");
        if e_test.is_dir() {
            e_test.join("ACE-Step Studio").join("checkpoints")
        } else {
            cache_dir.join("checkpoints")
        }
    } else {
        cache_dir.join("checkpoints")
    };
    let _ = fs::create_dir_all(&checkpoint_dir);
    cmd.env(
        "ACESTEP_CHECKPOINT_DIR",
        checkpoint_dir.to_string_lossy().to_string(),
    );

    // Avoid inheriting any handles from the UI process.
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::from(stdout));
    cmd.stderr(Stdio::from(stderr));

    // On Windows, backend is a console subsystem binary (python.exe). Ensure we do not spawn
    // a visible console window that users can accidentally close (which sends CTRL_CLOSE_EVENT),
    // leading to MKL/Fortran runtime aborts like `forrtl: error (200)`.
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start backend: {e}"))?;
    // Record PID for best-effort cleanup on next launch.
    let pid_path = backend_pid_path();
    if let Some(dir) = pid_path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let _ = fs::write(&pid_path, format!("{}", child.id()));
    *state.child.lock().unwrap() = Some(child);
    Ok(())
}

fn kill_backend(state: &BackendState) {
    if let Some(mut ch) = state.child.lock().unwrap().take() {
        let _ = ch.kill();
    }
    let _ = fs::remove_file(backend_pid_path());
}

#[tauri::command]
fn backend_url(state: State<BackendState>) -> String {
    state.url.lock().unwrap().clone()
}

#[tauri::command]
fn restart_backend(state: State<BackendState>) -> Result<String, String> {
    kill_backend(&state);
    spawn_backend(&state)?;
    Ok(state.url.lock().unwrap().clone())
}

#[tauri::command]
fn get_system_mic_state() -> SystemMicStateResponse {
    get_system_mic_state_impl()
}

#[tauri::command]
fn set_system_mic_volume(
    state: State<BackendState>,
    volume_percent: i32,
) -> SetSystemMicVolumeResponse {
    let out = set_system_mic_volume_impl(volume_percent);
    let code = out
        .error_code
        .clone()
        .or_else(|| first_role_error_code(&out.roles));
    set_last_mic_apply_error(&state, code);
    out
}

fn copy_if_exists(
    src: &Path,
    dest_dir: &Path,
    copied: &mut Vec<String>,
    missing: &mut Vec<String>,
) {
    let display_src = src.to_string_lossy().to_string();
    if !src.exists() {
        missing.push(display_src);
        return;
    }
    let file_name = src
        .file_name()
        .map(|s| s.to_os_string())
        .unwrap_or_else(|| "unknown".into());
    let dest_path = dest_dir.join(file_name);
    match fs::copy(src, &dest_path) {
        Ok(_) => copied.push(dest_path.to_string_lossy().to_string()),
        Err(e) => missing.push(format!("{display_src} ({e})")),
    }
}

fn last_non_empty_line(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    for line in raw.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut out = trimmed.to_string();
        if out.len() > 280 {
            out.truncate(280);
            out.push_str("...");
        }
        return Some(out);
    }
    None
}

fn count_known_format_input_failures(cfg_dir: &Path) -> usize {
    let mut total = 0usize;
    let needles = ["device-side assert", "format_input_known_runtime_assert"];
    for name in ["backend.err.log", "backend.out.log"] {
        let p = cfg_dir.join(name);
        let raw = fs::read_to_string(&p).ok().unwrap_or_default().to_lowercase();
        for needle in needles {
            total += raw.matches(needle).count();
        }
    }
    total
}

#[tauri::command]
fn collect_diagnostics_bundle(state: State<BackendState>) -> Result<String, String> {
    let cfg_dir = default_config_dir();
    let root = cfg_dir.join("diagnostics");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs();
    let bundle_dir = root.join(format!("bundle-{ts}"));
    fs::create_dir_all(&bundle_dir).map_err(|e| e.to_string())?;

    let mut copied: Vec<String> = Vec::new();
    let mut missing: Vec<String> = Vec::new();

    copy_if_exists(
        &cfg_dir.join("backend.out.log"),
        &bundle_dir,
        &mut copied,
        &mut missing,
    );
    copy_if_exists(
        &cfg_dir.join("backend.err.log"),
        &bundle_dir,
        &mut copied,
        &mut missing,
    );
    copy_if_exists(&config_path(), &bundle_dir, &mut copied, &mut missing);

    let report_source = find_backend_root()
        .map(|r| r.join("output").join("playwright"))
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|d| d.join("output").join("playwright"))
        });
    let report_dest = bundle_dir.join("output_playwright");
    let mut reports_copied = 0usize;
    if let Some(dir) = report_source.clone() {
        if dir.is_dir() {
            let _ = fs::create_dir_all(&report_dest);
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if !p.is_file() {
                        continue;
                    }
                    let name = p
                        .file_name()
                        .map(|x| x.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if !name.ends_with("report.json") {
                        continue;
                    }
                    copy_if_exists(&p, &report_dest, &mut copied, &mut missing);
                    reports_copied += 1;
                }
            }
        }
    }

    let summary_path = bundle_dir.join("summary.json");
    let backend_url = state.url.lock().unwrap().clone();
    let cfg = load_or_init_config();
    let gate_report_present = report_source
        .as_ref()
        .map(|p| p.join("phase3_gate_report.json").is_file())
        .unwrap_or(false);
    let latest_error_hint = last_non_empty_line(&cfg_dir.join("backend.err.log"))
        .or_else(|| last_non_empty_line(&cfg_dir.join("backend.out.log")));
    let format_input_known_fail_count = count_known_format_input_failures(&cfg_dir);
    let mic_apply_last_error_code = state.mic_apply_last_error_code.lock().unwrap().clone();
    let summary = serde_json::json!({
        "created_at_unix": ts,
        "bundle_dir": bundle_dir.to_string_lossy().to_string(),
        "config_dir": cfg_dir.to_string_lossy().to_string(),
        "backend_url": backend_url,
        "report_source_dir": report_source.map(|p| p.to_string_lossy().to_string()),
        "gate_report_present": gate_report_present,
        "latest_error_hint": latest_error_hint,
        "format_input_known_fail_count": format_input_known_fail_count,
        "mic_sync_enabled": cfg.mic_sync_enabled(),
        "mic_input_volume_percent": cfg.mic_input_volume_percent(),
        "mic_apply_last_error_code": mic_apply_last_error_code,
        "reports_copied": reports_copied,
        "copied_files": copied,
        "missing_files": missing,
    });
    fs::write(
        &summary_path,
        serde_json::to_string_pretty(&summary).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(bundle_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    // Use Windows Explorer to open a file/folder.
    // This keeps the web UI independent from Tauri JS plugin APIs.
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("open_path is only implemented for Windows in this build".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // If packaged with resources, wire them up via env vars so the backend launcher can find them.
            // On Windows portable runs (copying a folder next to the exe), Tauri's resource_dir()
            // can fail; fall back to "exe_dir/resources".
            let mut wired = false;
            if let Ok(resource_dir) = app.path().resource_dir() {
                wired = wire_packaged_resources(&resource_dir);
            }
            if !wired {
                if let Ok(exe) = std::env::current_exe() {
                    if let Some(exe_dir) = exe.parent() {
                        let resource_dir = exe_dir.join("resources");
                        if resource_dir.is_dir() {
                            wired = wire_packaged_resources(&resource_dir);
                        }
                    }
                }
            }
            if !wired {
                log_launcher_error("WARN: Could not resolve resource_dir; portable layout expects ./resources next to the exe.");
            }

            let state = BackendState::default();
            // Start backend before we show the UI; UI still has its own loader.
            if let Err(e) = spawn_backend(&state) {
                log_launcher_error(&format!("ERROR: {e}"));
                eprintln!("{e}");
            }
            app.manage(state);
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { .. } = e {
                let state = w.state::<BackendState>();
                kill_backend(&state);
            }
        })
        .invoke_handler(tauri::generate_handler![
            backend_url,
            restart_backend,
            get_system_mic_state,
            set_system_mic_volume,
            collect_diagnostics_bundle,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
