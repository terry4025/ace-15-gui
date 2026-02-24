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
  const expectedV2Raw = map.get("expect-v2") || "true";
  return {
    url: map.get("url") || inferredUrl,
    dist: map.get("dist") || "",
    out: map.get("out") || inferredOut || "output/playwright",
    expectedV2: String(expectedV2Raw).toLowerCase() !== "false" && String(expectedV2Raw) !== "0",
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

function noHash(url) {
  return String(url).replace(/#.*$/, "");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textHasAny(text, patterns) {
  return patterns.some((re) => re.test(text));
}

async function main() {
  const { url, dist, out, expectedV2, headed } = parseArgs();
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const screenshots = [];
  const routeChecks = [];
  try {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const routes = [
      "#/",
      "#/home",
      "#/compose",
      "#/create",
      "#/edit",
      "#/library",
      "#/settings",
      "#/updates",
    ];

    for (const hash of routes) {
      const target = `${noHash(targetUrl)}${hash}`;
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
      await wait(1200);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const hasNotFound = /Not Found/i.test(bodyText || "");
      const shot = path.join(outDir, `legacy_route_${hash.replace(/[^a-z0-9]/gi, "_") || "_root_"}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      screenshots.push(shot);
      routeChecks.push({
        hash,
        url: page.url(),
        ok: !hasNotFound,
        detail: hasNotFound ? "route rendered Not Found" : "ok",
      });
    }

    await page.goto(`${noHash(targetUrl)}#/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await wait(1000);

    const navText = await page.locator(".sidebar .nav").innerText().catch(() => "");
    const hasOps = textHasAny(navText || "", [/ops/i, /운영/]);
    const hasModels = textHasAny(navText || "", [/models/i, /모델/]);
    const expectNav = expectedV2
      ? { hasOps: true, hasModels: true }
      : { hasOps: false, hasModels: false };

    const navCheck = {
      expectedV2,
      hasOps,
      hasModels,
      ok: hasOps === expectNav.hasOps && hasModels === expectNav.hasModels,
      detail: `expected ops=${expectNav.hasOps}, models=${expectNav.hasModels}; got ops=${hasOps}, models=${hasModels}`,
    };

    const failedRoutes = routeChecks.filter((x) => !x.ok);
    const report = {
      at: new Date().toISOString(),
      baseUrl: targetUrl,
      expectedV2,
      routeChecks,
      navCheck,
      consoleErrors,
      screenshots,
    };
    const reportPath = path.join(outDir, expectedV2 ? "legacy_routes_report_v2_on.json" : "legacy_routes_report_v2_off.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

    if (failedRoutes.length || !navCheck.ok) {
      console.error(`Legacy route smoke failed. See ${reportPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Legacy route smoke passed. See ${reportPath}`);
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
