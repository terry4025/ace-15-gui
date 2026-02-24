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
  const inferredUrl = positional[0] && /^https?:\/\//i.test(positional[0]) ? positional[0] : "";
  const inferredOut = inferredUrl ? (positional[1] || "") : (positional[0] || "");
  return {
    url: map.get("url") || inferredUrl,
    dist: map.get("dist") || "",
    out: map.get("out") || inferredOut || "output/playwright",
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitFor(condition, timeoutMs = 30000, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return true;
    await wait(intervalMs);
  }
  return false;
}

function wrap(data) {
  return { code: 200, data, error: null, timestamp: Date.now() };
}

function healthReady() {
  return {
    status: "ok",
    service: "acestep-api",
    version: "test",
    models_initialized: true,
    models_stage: "ready",
    llm_initialized: false,
    llm_lazy_load_disabled: true,
    gpu_memory_gb: 8,
    gpu_tier: "tier3",
    gpu_name: "Test GPU",
  };
}

function healthInitializing() {
  return {
    status: "ok",
    service: "acestep-api",
    version: "test",
    models_initialized: false,
    models_stage: "initializing",
    llm_initialized: false,
    llm_lazy_load_disabled: true,
    gpu_memory_gb: 8,
    gpu_tier: "tier3",
    gpu_name: "Test GPU",
  };
}

function appConfig() {
  return {
    config: {
      version: 1,
      output_dir: "outputs",
      bind_mode: "local",
      api_key: "",
      dit_model: "acestep-v15-turbo",
      lm_model: "acestep-5Hz-lm-4B",
      lm_backend: "pt",
      download_source: "auto",
      language: "ko",
    },
    paths: {
      config_path: "config/studio.json",
      output_dir: "outputs",
      checkpoint_dir: "checkpoints",
    },
    runtime: {
      backend_version: "test",
      gpu_memory_gb: 8,
      gpu_tier: "tier3",
      recommended_lm_model: "acestep-5Hz-lm-4B",
      available_dit_models: ["acestep-v15-turbo"],
      available_lm_models: ["acestep-5Hz-lm-4B"],
      models_initialized: true,
      models_stage: "ready",
      llm_initialized: false,
      llm_lazy_load_disabled: true,
    },
  };
}

function scenarioList() {
  return [
    {
      id: "s1_8001_empty_dynamic_port",
      label: "8001 empty + dynamic port from Tauri",
      initialBase: "http://127.0.0.1:8001",
      tauriBase: "http://127.0.0.1:39111",
      expectedBase: "http://127.0.0.1:39111",
      timeoutMs: 25000,
      responder(req, state, ctx) {
        if (req.pathname === "/health") {
          if (req.origin === ctx.tauriBase) return { status: 200, body: wrap(healthReady()) };
          if (req.origin === "http://127.0.0.1:8001") return { abort: "connectionrefused" };
        }
        if (req.pathname === "/v1/app-config" && req.method === "GET" && req.origin === ctx.tauriBase) {
          return { status: 200, body: wrap(appConfig()) };
        }
        return null;
      },
      assert(state) {
        return { ok: state.finalBase === this.expectedBase, detail: `base=${state.finalBase}` };
      },
    },
    {
      id: "s2_8001_occupied_healthy_backend",
      label: "8001 occupied + healthy backend",
      initialBase: "http://127.0.0.1:8001",
      tauriBase: "",
      expectedBase: "http://127.0.0.1:8001",
      timeoutMs: 20000,
      responder(req) {
        if (req.origin !== "http://127.0.0.1:8001") return null;
        if (req.pathname === "/health") return { status: 200, body: wrap(healthReady()) };
        if (req.pathname === "/v1/app-config" && req.method === "GET") return { status: 200, body: wrap(appConfig()) };
        return null;
      },
      assert(state) {
        return { ok: state.finalBase === this.expectedBase, detail: `base=${state.finalBase}` };
      },
    },
    {
      id: "s3_stale_localstorage_port",
      label: "stale localStorage port -> fallback to 8001",
      initialBase: "http://127.0.0.1:39999",
      tauriBase: "",
      expectedBase: "http://127.0.0.1:8001",
      timeoutMs: 25000,
      responder(req) {
        if (req.origin === "http://127.0.0.1:39999" && req.pathname === "/health") return { abort: "connectionrefused" };
        if (req.origin === "http://127.0.0.1:8001" && req.pathname === "/health") return { status: 200, body: wrap(healthReady()) };
        if (req.origin === "http://127.0.0.1:8001" && req.pathname === "/v1/app-config" && req.method === "GET") {
          return { status: 200, body: wrap(appConfig()) };
        }
        return null;
      },
      assert(state) {
        return { ok: state.finalBase === this.expectedBase, detail: `base=${state.finalBase}` };
      },
    },
    {
      id: "s4_initialization_delay",
      label: "initialization delay then ready",
      initialBase: "http://127.0.0.1:8001",
      tauriBase: "",
      expectedBase: "http://127.0.0.1:8001",
      timeoutMs: 30000,
      responder(req, state) {
        if (req.origin !== "http://127.0.0.1:8001") return null;
        if (req.pathname === "/health") {
          state.healthCalls += 1;
          if (state.healthCalls < 3) return { status: 200, body: wrap(healthInitializing()) };
          return { status: 200, body: wrap(healthReady()) };
        }
        if (req.pathname === "/v1/app-config" && req.method === "GET") return { status: 200, body: wrap(appConfig()) };
        return null;
      },
      assert(state) {
        const ok = state.finalBase === this.expectedBase && state.healthCalls >= 3;
        return { ok, detail: `base=${state.finalBase}, healthCalls=${state.healthCalls}` };
      },
    },
  ];
}

async function runScenario(browser, baseUrl, outDir, s) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const state = {
    healthCalls: 0,
    routed: 0,
    aborted: 0,
    continued: 0,
    consoleErrors: [],
    finalBase: "",
    finalUrl: "",
    reachedHome: false,
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") state.consoleErrors.push(msg.text());
  });

  await page.addInitScript(({ initialBase, tauriBase }) => {
    localStorage.clear();
    localStorage.setItem("ace_step_studio_api_base", initialBase);
    localStorage.removeItem("ace_step_studio_api_key");
    if (tauriBase) {
      const invoke = async (cmd) => (cmd === "backend_url" ? tauriBase : null);
      globalThis.__TAURI__ = { core: { invoke }, invoke };
    } else {
      try {
        delete globalThis.__TAURI__;
      } catch {
        globalThis.__TAURI__ = undefined;
      }
    }
  }, { initialBase: s.initialBase, tauriBase: s.tauriBase });

  await page.route("**/*", async (route) => {
    const req = route.request();
    let url;
    try {
      url = new URL(req.url());
    } catch {
      await route.continue();
      state.continued += 1;
      return;
    }
    const pathname = url.pathname || "";
    const isApi = pathname === "/health" || pathname.startsWith("/v1/");
    if (!isApi) {
      await route.continue();
      state.continued += 1;
      return;
    }

    const ctx = { tauriBase: s.tauriBase };
    const action = s.responder(
      {
        method: req.method().toUpperCase(),
        origin: `${url.protocol}//${url.host}`,
        pathname,
      },
      state,
      ctx,
    );

    if (!action) {
      await route.abort("failed");
      state.aborted += 1;
      state.routed += 1;
      return;
    }
    if (action.abort) {
      await route.abort(action.abort);
      state.aborted += 1;
      state.routed += 1;
      return;
    }
    await route.fulfill({
      status: action.status ?? 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action.body ?? wrap({ ok: true })),
    });
    state.routed += 1;
  });

  await page.goto(baseUrl.replace(/#.*$/, "") + "#/", { waitUntil: "domcontentloaded", timeout: 60000 });
  state.reachedHome = await waitFor(async () => page.url().includes("#/home"), s.timeoutMs, 250);
  state.finalUrl = page.url();
  state.finalBase = await page.evaluate(() => String(localStorage.getItem("ace_step_studio_api_base") || ""));

  const shot = path.join(outDir, `loader_${s.id}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await context.close();

  const navOk = state.reachedHome;
  const assertRes = s.assert(state);
  return {
    id: s.id,
    label: s.label,
    screenshot: shot,
    reachedHome: state.reachedHome,
    finalUrl: state.finalUrl,
    finalBase: state.finalBase,
    healthCalls: state.healthCalls,
    routed: state.routed,
    aborted: state.aborted,
    continued: state.continued,
    consoleErrors: state.consoleErrors,
    ok: navOk && !!assertRes.ok,
    detail: `nav=${navOk}; ${assertRes.detail}`,
  };
}

async function main() {
  const { url, dist, out, headed } = parseArgs();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.isAbsolute(out) ? out : path.resolve(repoRoot, out);
  fs.mkdirSync(outDir, { recursive: true });

  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium) throw new Error("Playwright chromium launcher not found");

  const distDirRaw = dist || path.join("ui", "app", "dist");
  const distDir = path.isAbsolute(distDirRaw) ? distDirRaw : path.resolve(repoRoot, distDirRaw);
  let targetUrl = url;
  let staticServer = null;
  if (!targetUrl) {
    if (!fs.existsSync(distDir)) throw new Error(`dist not found: ${distDir}`);
    const started = await startStaticServer(distDir);
    staticServer = started.server;
    targetUrl = started.url;
  }

  const browser = await chromium.launch({ headless: !headed });
  const scenarios = scenarioList();
  const results = [];
  try {
    for (const s of scenarios) {
      // Run scenarios in sequence so route mocking stays deterministic.
      // Each scenario uses a fresh context/localStorage.
      // eslint-disable-next-line no-await-in-loop
      const result = await runScenario(browser, targetUrl, outDir, s);
      results.push(result);
    }
  } finally {
    await browser.close();
    if (staticServer) {
      await new Promise((resolve) => staticServer.close(() => resolve(undefined)));
    }
  }

  const report = {
    at: new Date().toISOString(),
    baseUrl: targetUrl,
    scenarios: results,
  };
  const reportPath = path.join(outDir, "loader_recovery_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  const failed = results.filter((x) => !x.ok);
  if (failed.length) {
    console.error(`Loader recovery smoke failed (${failed.length}/${results.length}). See ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Loader recovery smoke passed (${results.length}/${results.length}). See ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
