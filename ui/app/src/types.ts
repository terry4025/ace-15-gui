export type BindMode = "local" | "lan";
export type Language = "ko" | "en";
export type LMBackend = "pt" | "vllm";
export type DownloadSource = "auto" | "huggingface" | "modelscope";
export type SampleType = "simple_mode" | "custom_mode";
export type InferMethod = "ode" | "sde";

export type ApiWrap<T> = {
  data: T;
  code: number;
  error?: string | null;
  timestamp?: number;
  extra?: any;
};

export type StudioConfig = {
  version: number;
  output_dir: string;
  bind_mode: BindMode;
  api_key: string;
  dit_model: string;
  lm_model: string;
  lm_backend: LMBackend;
  download_source: DownloadSource;
  language: Language;
  // Optional for compatibility with older servers.
  mic_sync_enabled?: boolean;
  mic_input_volume_percent?: number;
};

export type SystemMicRole = "console" | "communications";

export type SystemMicRoleState = {
  role: SystemMicRole | string;
  supported: boolean;
  volume_percent?: number | null;
  muted?: boolean | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type SystemMicState = {
  supported: boolean;
  roles: SystemMicRoleState[];
  error_code?: string | null;
};

export type SetSystemMicVolumeResponse = {
  supported: boolean;
  requested_volume_percent: number;
  roles: SystemMicRoleState[];
  error_code?: string | null;
};

export type AppConfigResponse = {
  config: StudioConfig;
  paths: {
    config_path: string;
    output_dir: string;
    checkpoint_dir: string;
  };
  runtime: {
    // Service/runtime info (optional but used by Studio UI)
    backend_version?: string;
    gpu_memory_gb: number;
    gpu_tier: string;
    recommended_lm_model: string;
    available_dit_models: string[];
    available_lm_models: string[];
    // Studio runtime extras (optional; may be absent on older servers)
    models_initialized?: boolean;
    models_stage?: string;
    llm_initialized?: boolean;
    llm_lazy_load_disabled?: boolean;
    init_error?: string | null;
    llm_init_error?: string | null;
    gpu_name?: string;
    torch_version?: string;
    cuda_available?: boolean;
    xpu_available?: boolean;
    mps_available?: boolean;
  };
};

export type HealthResponse = {
  status: string;
  service: string;
  version: string;
  models_initialized: boolean;
  models_stage: string;
  llm_initialized: boolean;
  llm_lazy_load_disabled?: boolean;
  init_error?: string | null;
  llm_init_error?: string | null;
  gpu_memory_gb?: number | null;
  gpu_tier?: string;
  gpu_name?: string;
  torch_version?: string;
  cuda_available?: boolean;
  xpu_available?: boolean;
  mps_available?: boolean;
};

export type LibraryTrack = {
  track_id: string;
  created_at: number;
  audio_url: string | null;
  audio_path: string;
  meta: Record<string, any>;
};

export type ReleaseTaskPayload = {
  // Core
  prompt?: string;
  lyrics?: string;
  thinking?: boolean;
  vocal_language?: string;
  audio_format?: "mp3" | "wav" | "flac" | string;

  // Metadata / music attrs
  bpm?: number | null;
  key_scale?: string;
  time_signature?: string;
  audio_duration?: number | null;

  // Task + edit
  task_type?: "text2music" | "cover" | "repaint" | "lego" | "extract" | "complete" | string;
  instruction?: string;
  reference_audio_path?: string | null;
  src_audio_path?: string | null;
  repainting_start?: number;
  repainting_end?: number | null;
  audio_cover_strength?: number;
  track_name?: string | null;
  complete_track_classes?: string[];

  // Sampling / random mode
  sample_mode?: boolean;
  sample_query?: string;
  use_format?: boolean;

  // DiT controls
  model?: string | null;
  inference_steps?: number;
  guidance_scale?: number;
  use_adg?: boolean;
  cfg_interval_start?: number;
  cfg_interval_end?: number;
  infer_method?: InferMethod | string;
  shift?: number;
  timesteps?: string | null;

  // Seeding
  use_random_seed?: boolean;
  seed?: number;
  batch_size?: number;

  // 5Hz LM controls
  lm_model_path?: string | null;
  lm_backend?: "pt" | "vllm" | "mlx" | string;
  lm_temperature?: number;
  lm_cfg_scale?: number;
  lm_top_k?: number | null;
  lm_top_p?: number | null;
  lm_repetition_penalty?: number;
  lm_negative_prompt?: string;
  constrained_decoding?: boolean;
  constrained_decoding_debug?: boolean;
  use_cot_metas?: boolean;
  use_cot_caption?: boolean;
  use_cot_language?: boolean;
  allow_lm_batch?: boolean;

  // Analysis
  analysis_only?: boolean;
  full_analysis_only?: boolean;
};

export type ReleaseTaskResponse = {
  task_id: string;
  status: string;
  queue_position: number;
};

export type TaskErrorCode =
  | "INVALID_INPUT"
  | "MODEL_NOT_READY"
  | "OUT_OF_MEMORY"
  | "TASK_TIMEOUT"
  | "CANCELED"
  | "INTERNAL"
  | "FORMAT_INPUT_KNOWN_RUNTIME_ASSERT"
  | "FORMAT_INPUT_INTERNAL_ERROR";

export type TaskHealthState = "healthy" | "degraded" | "stalled" | "terminal";

export type TaskQueryItem = {
  task_id: string;
  status: number;
  progress_text?: string;
  result?: string | any[] | Record<string, any> | null;
  error?: string | null;
  error_code?: TaskErrorCode | string | null;
  error_summary?: string | null;
  retryable?: boolean | null;
  stage?: string | null;
  progress?: number | null;
  queue_position?: number;
  eta_seconds?: number | null;
  avg_job_seconds?: number | null;
  last_heartbeat?: number | null;
  stall_seconds?: number | null;
  health_state?: TaskHealthState | string | null;
  recover_hint?: string | null;
  next_poll_ms?: number | null;
  created_at?: number | null;
  updated_at?: number | null;
};

export type TaskStatusNormalized = {
  taskId: string;
  status: number;
  statusLabel: "queued" | "running" | "succeeded" | "failed" | "canceled";
  result: any[];
  progressText: string;
  errorText?: string;
  errorCode?: TaskErrorCode;
  errorSummary?: string;
  retryable?: boolean;
  stage: string;
  progress: number;
  queuePosition: number;
  etaSeconds?: number;
  avgJobSeconds?: number;
  lastHeartbeat?: number;
  stallSeconds?: number;
  healthState?: TaskHealthState;
  recoverHint?: string;
  nextPollMs?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type CancelTaskResponse = {
  ok: boolean;
  task_id?: string;
  status?: "canceled" | "running" | "queued";
  error_code?: TaskErrorCode | null;
  recover_hint?: string | null;
};

export type PreflightIssue = {
  code: string;
  message: string;
  field?: string | null;
  retryable?: boolean;
};

export type PreflightRequest = {
  payload: ReleaseTaskPayload | Record<string, any>;
  client_files?: {
    has_src_audio?: boolean;
    has_ref_audio?: boolean;
  };
  client_audio?: {
    source_duration_sec?: number;
    target_duration_sec?: number;
  };
};

export type PreflightResponse = {
  ok: boolean;
  blocking_errors?: PreflightIssue[];
  warnings?: PreflightIssue[];
  normalized_payload?: Record<string, any>;
  estimated_seconds?: number;
  suggested_poll_ms?: number;
};

export type FormatInputRequest = {
  prompt?: string;
  lyrics?: string;
  temperature?: number;
  param_obj?: {
    duration?: number;
    bpm?: number;
    key?: string;
    time_signature?: string;
    language?: string;
    [k: string]: any;
  };
};

export type FormatInputResponse = {
  caption?: string;
  lyrics?: string;
  bpm?: number;
  key_scale?: string;
  keyscale?: string;
  time_signature?: string;
  timesignature?: string;
  duration?: number;
  vocal_language?: string;
  [k: string]: any;
};

export type RandomSampleResponse = {
  caption?: string;
  prompt?: string;
  lyrics?: string;
  bpm?: number;
  key_scale?: string;
  keyscale?: string;
  time_signature?: string;
  timesignature?: string;
  duration?: number;
  vocal_language?: string;
  [k: string]: any;
};

export type StatsResponse = {
  jobs?: {
    total_jobs?: number;
    queued_jobs?: number;
    running_jobs?: number;
    succeeded_jobs?: number;
    failed_jobs?: number;
    canceled_jobs?: number;
    active_jobs?: number;
    [k: string]: any;
  };
  queue_size?: number;
  queue_maxsize?: number;
  avg_job_seconds?: number;
  preflight_calls_total?: number;
  query_result_calls_total?: number;
  cancel_calls_total?: number;
  format_input_calls_total?: number;
  format_input_fail_total?: number;
  format_input_known_fail_total?: number;
  [k: string]: any;
};

export type ModelCatalogItem = {
  id: string;
  name: string;
  is_default?: boolean;
  raw?: any;
};

export type ModelsResponseNormalized = {
  source: "acestep" | "openrouter" | "unknown";
  default_model?: string | null;
  models: ModelCatalogItem[];
  raw: any;
};
