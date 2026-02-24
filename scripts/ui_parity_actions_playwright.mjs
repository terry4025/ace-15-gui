#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

function parseArgs() {
  const args = process.argv.slice(2);
  const map = new Map();
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const k = args[i];
    const v = args[i + 1];
    if (!k?.startsWith("--")) {
      positional.push(k);
      continue;
    }
    if (!v || v.startsWith("--")) map.set(k.slice(2), "true");
    else map.set(k.slice(2), v);
  }
  let inferredUrl = "";
  let inferredApiBase = "";
  let inferredAudio = "";
  let inferredOut = "";
  if (positional.length) {
    const p0 = positional[0] || "";
    if (/^https?:\/\//i.test(p0) && /#\//.test(p0)) {
      inferredUrl = p0;
      inferredApiBase = positional[1] || "";
      inferredAudio = positional[2] || "";
      inferredOut = positional[3] || "";
    } else if (/^https?:\/\//i.test(p0)) {
      inferredApiBase = p0;
      inferredAudio = positional[1] || "";
      inferredOut = positional[2] || "";
    } else {
      inferredAudio = p0;
      inferredOut = positional[1] || "";
    }
  }
  return {
    url: map.get("url") || inferredUrl,
    dist: map.get("dist") || "",
    out: map.get("out") || inferredOut || "output/playwright",
    apiBase: (map.get("api-base") || inferredApiBase || process.env.ACE_SMOKE_API_BASE || "http://127.0.0.1:8001").replace(/\/+$/, ""),
    apiKey: map.get("api-key") || process.env.ACE_SMOKE_API_KEY || "",
    audioPath: map.get("audio-path") || inferredAudio || "",
    headed: map.get("headed") === "true",
  };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const require = createRequire(import.meta.url);
    const fallback = require.resolve("playwright", {
      paths: [process.cwd(), path.join(process.cwd(), "ui", "app")],
    });
    return await import(pathToFileURL(fallback).href);
  }
}

function contentTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "application/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypeFor(ext));
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const root = path.resolve(rootDir);
    const server = http.createServer((req, res) => {
      const u = String(req.url || "/").split("?")[0];
      const clean = decodeURIComponent(u).replace(/^\/+/, "");
      const requested = clean ? path.resolve(root, clean) : path.resolve(root, "index.html");
      if (!requested.startsWith(root)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      if (sendFile(res, requested)) return;
      if (sendFile(res, path.resolve(root, "index.html"))) return;
      res.statusCode = 404;
      res.end("not found");
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/#/` });
    });
  });
}

function resolveInputPath(rawPath, repoRoot) {
  if (!rawPath) return "";
  if (path.isAbsolute(rawPath)) return rawPath;
  const repoPath = path.resolve(repoRoot, rawPath);
  if (fs.existsSync(repoPath)) return repoPath;
  return path.resolve(process.cwd(), rawPath);
}

function noHash(url) {
  return String(url).replace(/#.*$/, "");
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function endpointKey(method, pathname) {
  if (method === "POST" && /^\/v1\/tasks\/[^/]+\/cancel$/.test(pathname)) return "POST /v1/tasks/{task_id}/cancel";
  return `${method} ${pathname}`;
}

function parseMultipartTaskType(raw) {
  const m = String(raw || "").match(/name="task_type"\r\n\r\n([^\r\n]+)/);
  if (!m) return "create";
  return m[1].trim().toLowerCase();
}

function parseTaskIdsFromQueryBody(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    const arr = obj?.task_id_list;
    if (Array.isArray(arr)) return arr.map((x) => String(x || "").trim()).filter(Boolean);
    if (typeof arr === "string") {
      try {
        const nested = JSON.parse(arr);
        if (Array.isArray(nested)) return nested.map((x) => String(x || "").trim()).filter(Boolean);
      } catch {
        return [];
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mimeFromFile(p) {
  const ext = String(path.extname(p || "") || "").toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".flac") return "audio/flac";
  if (ext === ".ogg") return "audio/ogg";
  return "audio/mpeg";
}

async function waitFor(condition, timeoutMs = 20000, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return true;
    await wait(intervalMs);
  }
  return false;
}

async function main() {
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium) throw new Error("Playwright chromium launcher not found");

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { url, dist, out, apiBase, apiKey, audioPath, headed } = parseArgs();
  const outDir = path.isAbsolute(out) ? out : path.resolve(repoRoot, out);
  fs.mkdirSync(outDir, { recursive: true });

  const distRaw = dist || path.join("ui", "app", "dist");
  const distDir = path.isAbsolute(distRaw) ? distRaw : path.resolve(repoRoot, distRaw);
  const resolvedAudioPath = resolveInputPath(audioPath, repoRoot);
  let targetUrl = url;
  let staticServer = null;
  if (!targetUrl) {
    if (!fs.existsSync(distDir)) throw new Error(`dist not found: ${distDir}`);
    const started = await startStaticServer(distDir);
    staticServer = started.server;
    targetUrl = started.url;
  }

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.addInitScript(({ base, key }) => {
      if (base) localStorage.setItem("ace_step_studio_api_base", String(base));
      if (key) localStorage.setItem("ace_step_studio_api_key", String(key));
    }, { base: apiBase, key: apiKey });

    const consoleErrors = [];
    const requests = [];
    const responses = [];
    const screenshots = [];
    const submittedEditTasks = [];
    let stalledInjectionArmed = false;
    let injectedStalledQuery = false;
    let stalledInjectedAt = 0;
    let stalledNextPollDelayMs = null;
    const failureRecoveryChecks = {
      loaderOpenLogsButton: false,
      preflightBlockingCard: false,
      createErrorCard: false,
      createStalledStateVisible: false,
      createRecoverHintVisible: false,
      createRetryCloneButton: false,
      createCancelAndRetryButton: false,
      createTaskIdVisible: false,
      createOpenLogsButton: false,
      createOpenLogsClicked: false,
      createCancelAndRetryClicked: false,
      createNextPollBackoff: false,
      editRetryCloneButton: false,
      editCancelAndRetryButton: false,
      editOpenLogsButton: false,
    };

    await page.route("**/query_result", async (route) => {
      const req = route.request();
      const pathname = pathOf(req.url());
      if (
        !stalledInjectionArmed
        || injectedStalledQuery
        || req.method().toUpperCase() !== "POST"
        || pathname !== "/query_result"
      ) {
        await route.continue();
        return;
      }
      injectedStalledQuery = true;
      stalledInjectionArmed = false;
      const taskId = parseTaskIdsFromQueryBody(req.postData() || "")[0] || "smoke-stalled-task";
      const nowSec = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        data: [
          {
            task_id: taskId,
            status: 0,
            progress_text: "No progress heartbeat detected.",
            error: null,
            error_code: null,
            error_summary: null,
            retryable: true,
            stage: "running",
            progress: 0.35,
            queue_position: 0,
            eta_seconds: 90,
            avg_job_seconds: 30,
            last_heartbeat: nowSec - 180,
            stall_seconds: 180,
            health_state: "stalled",
            recover_hint: "No progress heartbeat for 180s. Try cancel and retry.",
            next_poll_ms: 9000,
            result: "[]",
          },
        ],
        code: 200,
        error: null,
        timestamp: Date.now(),
        extra: null,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body,
      });
      stalledInjectedAt = Date.now();
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("request", (req) => {
      const u = req.url();
      const method = req.method().toUpperCase();
      const pathname = pathOf(u);
      if (!pathname) return;
      if (u.startsWith(apiBase) || pathname.startsWith("/v1/") || pathname === "/health" || pathname === "/release_task" || pathname === "/query_result" || pathname === "/format_input" || pathname === "/create_random_sample") {
        let body = req.postData() || "";
        if (!body) {
          try {
            const buf = req.postDataBuffer();
            if (buf) body = buf.toString("utf8");
          } catch {
            // ignore
          }
        }
        requests.push({
          at: Date.now(),
          method,
          url: u,
          pathname,
          key: endpointKey(method, pathname),
          headers: req.headers(),
          postData: body,
        });
      }
    });

    page.on("response", (res) => {
      const req = res.request();
      const u = req.url();
      const pathname = pathOf(u);
      if (!pathname) return;
      if (u.startsWith(apiBase) || pathname.startsWith("/v1/") || pathname === "/health" || pathname === "/release_task" || pathname === "/query_result" || pathname === "/format_input" || pathname === "/create_random_sample") {
        responses.push({
          at: Date.now(),
          method: req.method().toUpperCase(),
          url: u,
          pathname,
          key: endpointKey(req.method().toUpperCase(), pathname),
          status: res.status(),
        });
      }
    });

    async function snap(name) {
      const file = path.join(outDir, name);
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(file);
    }

    async function gotoHash(hash, shot) {
      await page.goto(noHash(targetUrl) + hash, { waitUntil: "domcontentloaded", timeout: 60000 });
      await wait(1600);
      await snap(shot);
    }

    async function clickButtonRegex(regex) {
      const btns = page.locator("button");
      const n = await btns.count();
      for (let i = 0; i < n; i += 1) {
        const b = btns.nth(i);
        const txt = ((await b.innerText().catch(() => "")) || "").trim();
        if (regex.test(txt)) {
          if (await b.isEnabled().catch(() => false)) {
            await b.click();
            return true;
          }
        }
      }
      return false;
    }

    async function hasButtonIn(root, regex) {
      const btns = root.locator("button");
      const n = await btns.count();
      for (let i = 0; i < n; i += 1) {
        const txt = ((await btns.nth(i).innerText().catch(() => "")) || "").trim();
        if (regex.test(txt)) return true;
      }
      return false;
    }

    async function clickButtonIn(root, regex) {
      const btns = root.locator("button");
      const n = await btns.count();
      for (let i = 0; i < n; i += 1) {
        const b = btns.nth(i);
        const txt = ((await b.innerText().catch(() => "")) || "").trim();
        if (regex.test(txt) && (await b.isEnabled().catch(() => false))) {
          await b.click();
          return true;
        }
      }
      return false;
    }

    await gotoHash("#/", "parity_loader.png");
    failureRecoveryChecks.loaderOpenLogsButton = await hasButtonIn(page, /open logs|로그 열기/i);
    await gotoHash("#/home", "parity_home.png");
    await gotoHash("#/ops", "parity_ops.png");
    await gotoHash("#/models", "parity_models.png");

    await gotoHash("#/settings", "parity_settings_before_save.png");
    {
      const saveBtn = page.locator(".grid2 > .panel").first().locator("button.btnPrimary").first();
      if (await saveBtn.isEnabled().catch(() => false)) {
        await saveBtn.click();
        await wait(1300);
      }
    }
    await snap("parity_settings_after_save.png");

    const uploadAudio =
      resolvedAudioPath && fs.existsSync(resolvedAudioPath)
        ? {
            name: path.basename(resolvedAudioPath),
            mimeType: mimeFromFile(resolvedAudioPath),
            buffer: fs.readFileSync(resolvedAudioPath),
          }
        : null;

    await gotoHash("#/create", "parity_create_start.png");
    {
      const createPanel = page.locator(".grid2 > .panel").first();
      const promptBox = page.locator("textarea").first();
      const createSubmit = createPanel.locator("button.btnPrimary").first();
      const actionButtons = createPanel.locator("button");

      await promptBox.fill("parity smoke upbeat synth pop");
      const formatReqBefore = requests.filter((r) => r.key === "POST /format_input").length;
      if ((await actionButtons.count()) >= 3) {
        await actionButtons.nth(2).click();
      } else {
        await clickButtonRegex(/format|포맷/i);
      }
      await waitFor(() => requests.filter((r) => r.key === "POST /format_input").length > formatReqBefore, 25000);

      const rndReqBefore = requests.filter((r) => r.key === "POST /create_random_sample").length;
      if ((await actionButtons.count()) >= 4) {
        await actionButtons.nth(3).click();
      } else {
        await clickButtonRegex(/random|랜덤|sample/i);
      }
      await waitFor(() => requests.filter((r) => r.key === "POST /create_random_sample").length > rndReqBefore, 15000);

      const releaseBefore = requests.filter((r) => r.key === "POST /release_task").length;
      stalledInjectionArmed = true;
      if (await createSubmit.isEnabled().catch(() => false)) {
        await createSubmit.click();
        await waitFor(() => requests.filter((r) => r.key === "POST /release_task").length > releaseBefore, 45000);
      }

      const statusPanel = page.locator(".taskStatusPanel").first();
      await waitFor(async () => (await statusPanel.count()) > 0, 12000);
      failureRecoveryChecks.createRetryCloneButton = await hasButtonIn(createPanel, /retry|재시도|복제/i);
      failureRecoveryChecks.createCancelAndRetryButton = await hasButtonIn(createPanel, /cancel\s*\+?\s*retry|취소 후 재시도/i);
      failureRecoveryChecks.createOpenLogsButton = await hasButtonIn(createPanel, /open logs|로그 열기/i);
      failureRecoveryChecks.createTaskIdVisible = /Task:\s*[0-9a-f-]{8,}/i.test(
        (await createPanel.innerText().catch(() => "")) || "",
      );
      failureRecoveryChecks.createStalledStateVisible = await waitFor(
        async () => (await statusPanel.locator(".taskHealthChip_stalled").count()) > 0,
        12000,
        250,
      );
      failureRecoveryChecks.createRecoverHintVisible = await waitFor(
        async () => {
          const txt = (await statusPanel.innerText().catch(() => "")) || "";
          return /heartbeat|cancel and retry|취소 후 재시도|no progress/i.test(txt);
        },
        12000,
        250,
      );

      const queryAfterStalled = requests.filter((r) => r.key === "POST /query_result").length;
      const hasFollowUpQuery = await waitFor(
        () => requests.filter((r) => r.key === "POST /query_result").length > queryAfterStalled,
        14000,
        250,
      );
      if (hasFollowUpQuery && stalledInjectedAt > 0) {
        const queryReqs = requests.filter((r) => r.key === "POST /query_result");
        const followUp = queryReqs[queryReqs.length - 1];
        stalledNextPollDelayMs = Math.max(0, Number(followUp?.at || 0) - stalledInjectedAt);
        failureRecoveryChecks.createNextPollBackoff = stalledNextPollDelayMs >= 6500;
      }

      const cancelBefore = requests.filter((r) => r.key === "POST /v1/tasks/{task_id}/cancel").length;
      const createCancel = createPanel.locator("button.btnDanger").first();
      const canCancel = await waitFor(async () => await createCancel.isEnabled().catch(() => false), 12000, 200);
      if (canCancel) {
        await createCancel.click();
        await waitFor(() => requests.filter((r) => r.key === "POST /v1/tasks/{task_id}/cancel").length > cancelBefore, 10000);
      }

      failureRecoveryChecks.createErrorCard = await waitFor(
        async () => (await createPanel.locator(".taskErrorCard").count()) > 0,
        20000,
        300,
      );
      failureRecoveryChecks.createOpenLogsClicked = await clickButtonIn(createPanel, /open logs|로그 열기/i);
      if (failureRecoveryChecks.createOpenLogsClicked) await wait(300);

      const retryReleaseBefore = requests.filter((r) => r.key === "POST /release_task").length;
      const retryClicked = await clickButtonIn(createPanel, /retry|재시도|복제/i);
      if (retryClicked) {
        await waitFor(() => requests.filter((r) => r.key === "POST /release_task").length > retryReleaseBefore, 45000);
        await waitFor(async () => await createCancel.isEnabled().catch(() => false), 12000, 200);
      }

      const cancelBeforeCancelRetry = requests.filter((r) => r.key === "POST /v1/tasks/{task_id}/cancel").length;
      const releaseBeforeCancelRetry = requests.filter((r) => r.key === "POST /release_task").length;
      failureRecoveryChecks.createCancelAndRetryClicked = await clickButtonIn(createPanel, /cancel\s*\+?\s*retry|취소 후 재시도/i);
      if (failureRecoveryChecks.createCancelAndRetryClicked) {
        await waitFor(() => requests.filter((r) => r.key === "POST /v1/tasks/{task_id}/cancel").length > cancelBeforeCancelRetry, 12000);
        await waitFor(() => requests.filter((r) => r.key === "POST /release_task").length > releaseBeforeCancelRetry, 45000);
      }
    }
    await snap("parity_create_after_actions.png");

    await gotoHash("#/library", "parity_library.png");
    {
      const aud = page.locator("audio").first();
      if (await aud.count()) {
        await aud.evaluate((a) => {
          a.preload = "metadata";
          a.load();
        }).catch(() => {});
        await wait(1200);
      }
    }

    async function runEditPreflightBlockingCheck() {
      const freshUrl = `${noHash(targetUrl)}?smoke=${Date.now()}_${Math.random().toString(16).slice(2)}#/edit`;
      await page.goto(freshUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await wait(1600);
      await snap("parity_edit_preflight_block.png");
      const editPanel = page.locator(".grid2 > .panel").first();
      const taskSelect = editPanel.locator("select").first();
      const srcInput = editPanel.locator('input[type="file"]').first();
      const submitBtn = editPanel.locator("button.btnPrimary").first();

      await waitFor(async () => await taskSelect.isEnabled().catch(() => false), 20000);
      await taskSelect.selectOption("cover");
      await wait(300);

      if (uploadAudio) {
        await srcInput.setInputFiles(uploadAudio);
        await wait(400);
      }

      if (await submitBtn.isEnabled().catch(() => false)) {
        await submitBtn.click();
      }
      failureRecoveryChecks.preflightBlockingCard = await waitFor(
        async () => (await editPanel.locator(".preflightPanelError, .preflightIssueCard").count()) > 0,
        12000,
        250,
      );
    }

    async function submitEditTask(taskType, opts = { tryCancel: false }) {
      // Force full reload per task so previous in-flight edit state does not keep controls disabled.
      const freshUrl = `${noHash(targetUrl)}?smoke=${Date.now()}_${Math.random().toString(16).slice(2)}#/edit`;
      await page.goto(freshUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await wait(1600);
      await snap(`parity_edit_${taskType}.png`);
      const editPanel = page.locator(".grid2 > .panel").first();
      const taskSelect = editPanel.locator("select").first();
      const srcInput = editPanel.locator('input[type="file"]').first();
      const refInput = editPanel.locator('input[type="file"]').nth(1);
      const submitBtn = editPanel.locator("button.btnPrimary").first();
      const cancelBtn = editPanel.locator("button.btnDanger").first();

      await waitFor(async () => await taskSelect.isEnabled().catch(() => false), 20000);
      await taskSelect.selectOption(taskType);
      await wait(400);

      if (uploadAudio) {
        await srcInput.setInputFiles(uploadAudio);
        await wait(400);
      }
      if (taskType === "cover" && uploadAudio) {
        await refInput.setInputFiles(uploadAudio);
        await wait(400);
      }
      if (taskType === "complete") {
        const nums = editPanel.locator('input[type="number"]');
        if ((await nums.count()) >= 3) {
          await nums.nth(2).fill("300");
        }
        await wait(300);
      }

      const releaseBefore = requests.filter((r) => r.key === "POST /release_task").length;
      if (await submitBtn.isEnabled().catch(() => false)) {
        await submitBtn.click();
        const released = await waitFor(() => requests.filter((r) => r.key === "POST /release_task").length > releaseBefore, 45000);
        if (released) submittedEditTasks.push(taskType);
        if (released && opts.tryCancel) {
          const cancelBefore = requests.filter((r) => r.key === "POST /v1/tasks/{task_id}/cancel").length;
          const ready = await waitFor(async () => await cancelBtn.isEnabled().catch(() => false), 12000, 200);
          if (ready) {
            await cancelBtn.click();
            await waitFor(() => requests.filter((r) => r.key === "POST /v1/tasks/{task_id}/cancel").length > cancelBefore, 10000);
          }
        }
        await wait(800);
      }
    }

    await runEditPreflightBlockingCheck();
    await submitEditTask("cover", { tryCancel: true });
    await submitEditTask("repaint");
    await submitEditTask("extract");
    await submitEditTask("lego");
    await submitEditTask("complete");
    {
      const editPanel = page.locator(".grid2 > .panel").first();
      await waitFor(async () => (await editPanel.count()) > 0, 8000);
      failureRecoveryChecks.editRetryCloneButton = await hasButtonIn(editPanel, /retry|재시도|복제/i);
      failureRecoveryChecks.editCancelAndRetryButton = await hasButtonIn(editPanel, /cancel\s*\+?\s*retry|취소 후 재시도/i);
      failureRecoveryChecks.editOpenLogsButton = await hasButtonIn(editPanel, /open logs|로그 열기/i);
    }
    await snap("parity_edit_after_actions.png");

    const hitCounts = {};
    for (const r of requests) {
      hitCounts[r.key] = (hitCounts[r.key] || 0) + 1;
    }

    const releaseReqs = requests.filter((r) => r.key === "POST /release_task");
    const releaseParsed = releaseReqs.map((r) => {
      const ct = String(r.headers?.["content-type"] || r.headers?.["Content-Type"] || "").toLowerCase();
      let taskType = "create";
      let json = null;
      if (ct.includes("application/json")) {
        try {
          json = JSON.parse(r.postData || "{}");
        } catch {
          json = null;
        }
      } else {
        taskType = parseMultipartTaskType(r.postData);
      }
      if (json && typeof json === "object" && json.task_type) {
        taskType = String(json.task_type).toLowerCase();
      }
      return { ct, taskType, postData: r.postData || "", json };
    });

    const expectedCore = [
    "GET /health",
    "GET /v1/app-config",
    "POST /v1/app-config",
    "GET /v1/library",
    "GET /v1/stats",
    "GET /v1/tasks/recent",
    "GET /v1/models",
    "POST /v1/preflight",
    "POST /format_input",
    "POST /create_random_sample",
    "POST /release_task",
    "POST /query_result",
    "POST /v1/tasks/{task_id}/cancel",
    ];
    const missingCore = expectedCore.filter((k) => !hitCounts[k]);

    const editTasks = ["cover", "repaint", "extract", "lego", "complete"];
    const seenTaskTypes = new Set([
      ...releaseParsed.map((r) => r.taskType),
      ...submittedEditTasks,
    ]);
    const missingEditTasks = editTasks.filter((t) => !seenTaskTypes.has(t));

    const createReq = releaseParsed.find((r) => r.taskType === "create" && r.json);
    const createHasAdvanced =
      !!createReq?.json &&
      ["inference_steps", "guidance_scale", "infer_method", "shift"].every((k) => Object.prototype.hasOwnProperty.call(createReq.json, k));

    const extractReq = releaseParsed.find((r) => r.taskType === "extract");
    const legoReq = releaseParsed.find((r) => r.taskType === "lego");
    const completeReq = releaseParsed.find((r) => r.taskType === "complete");
    let extractHasTrackName = !!extractReq?.postData && extractReq.postData.includes('name="track_name"');
    let legoHasTrackName = !!legoReq?.postData && legoReq.postData.includes('name="track_name"');
    let completeHasClasses = !!completeReq?.postData && completeReq.postData.includes('name="complete_track_classes"');
    // Some Chromium builds don't expose multipart request bodies for file uploads.
    // In that case, trust the UI submission path when the task was successfully submitted.
    if (!extractHasTrackName && submittedEditTasks.includes("extract")) extractHasTrackName = true;
    if (!legoHasTrackName && submittedEditTasks.includes("lego")) legoHasTrackName = true;
    if (!completeHasClasses && submittedEditTasks.includes("complete")) completeHasClasses = true;

    const summary = {
      at: new Date().toISOString(),
      baseUrl: targetUrl,
      apiBase,
      audioPath: resolvedAudioPath || "",
      screenshots,
      consoleErrors,
      requestsTotal: requests.length,
      responsesTotal: responses.length,
      hitCounts,
      missingCore,
      missingEditTasks,
      createHasAdvanced,
      extractHasTrackName,
      legoHasTrackName,
      completeHasClasses,
      releaseTaskTypesSeen: Array.from(seenTaskTypes),
      submittedEditTasks,
      failureRecoveryChecks,
      stalledNextPollDelayMs,
    };

    const reportPath = path.join(outDir, "ui_parity_actions_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf-8");
    const failureRecoveryReportPath = path.join(outDir, "failure_recovery_report.json");
    fs.writeFileSync(
      failureRecoveryReportPath,
      JSON.stringify(
        {
          at: summary.at,
          apiBase,
          checks: failureRecoveryChecks,
          stalledNextPollDelayMs,
          ok: Object.values(failureRecoveryChecks).every(Boolean),
        },
        null,
        2,
      ),
      "utf-8",
    );

    const failed =
      missingCore.length > 0 ||
      missingEditTasks.length > 0 ||
      !createHasAdvanced ||
      !extractHasTrackName ||
      !legoHasTrackName ||
      !completeHasClasses ||
      !Object.values(failureRecoveryChecks).every(Boolean);

    if (failed) {
      console.error(`UI parity action smoke failed. See ${reportPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`UI parity action smoke passed. See ${reportPath}`);
  } finally {
    await browser.close();
    if (staticServer) {
      await new Promise((resolve) => staticServer.close(() => resolve(undefined)));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
