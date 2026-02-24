#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

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

function parseArgs() {
  const args = process.argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const k = args[i];
    const v = args[i + 1];
    if (!k.startsWith("--")) continue;
    if (!v || v.startsWith("--")) map.set(k.slice(2), "true");
    else map.set(k.slice(2), v);
  }
  return {
    url: map.get("url") || "http://127.0.0.1:5173/#/",
    out: map.get("out") || "output/playwright",
    apiBase: map.get("api-base") || process.env.ACE_SMOKE_API_BASE || "",
    apiKey: map.get("api-key") || process.env.ACE_SMOKE_API_KEY || "",
    headed: map.get("headed") === "true",
  };
}

async function main() {
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium) {
    throw new Error("Playwright chromium launcher not found");
  }
  const { url, out, apiBase, apiKey, headed } = parseArgs();
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (apiBase || apiKey) {
    await page.addInitScript(({ base, key }) => {
      if (base) localStorage.setItem("ace_step_studio_api_base", String(base));
      if (key) localStorage.setItem("ace_step_studio_api_key", String(key));
    }, { base: apiBase, key: apiKey });
  }
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || "unknown",
    });
  });

  const routes = [
    "#/",
    "#/home",
    "#/create",
    "#/library",
    "#/edit",
    "#/ops",
    "#/models",
    "#/settings",
  ];

  const screenshots = [];
  for (const hash of routes) {
    const target = url.replace(/#.*$/, "") + hash;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1400);
    const name = hash.replace(/[^a-z0-9]/gi, "_") || "_root_";
    const file = path.join(out, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    screenshots.push(file);
  }

  // Tiny interaction smoke on create page
  await page.goto(url.replace(/#.*$/, "") + "#/create", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(500);
  const textareas = page.locator("textarea");
  if (await textareas.count()) {
    await textareas.first().fill("smoke test prompt upbeat synth pop");
  }
  const afterInput = path.join(out, "create_after_input.png");
  await page.screenshot({ path: afterInput, fullPage: true });
  screenshots.push(afterInput);

  const report = {
    at: new Date().toISOString(),
    baseUrl: url,
    apiBase,
    screenshots,
    consoleErrors,
    failedRequests,
  };
  fs.writeFileSync(path.join(out, "ui_smoke_report.json"), JSON.stringify(report, null, 2), "utf-8");

  await browser.close();
  const defaultHealthUrl = "http://127.0.0.1:8001/health";
  const isDynamicPortRun = Boolean(apiBase) && !apiBase.includes("127.0.0.1:8001");
  const nonIgnorableFailed = failedRequests.filter((r) => !(isDynamicPortRun && r.url === defaultHealthUrl));
  const nonIgnorableConsole = consoleErrors.filter((msg) => {
    if (!isDynamicPortRun) return true;
    if (!msg.includes("ERR_CONNECTION_REFUSED")) return true;
    return nonIgnorableFailed.length > 0;
  });

  if (nonIgnorableConsole.length || nonIgnorableFailed.length) {
    console.error(
      `UI smoke completed with ${nonIgnorableConsole.length} console error(s) and ${nonIgnorableFailed.length} failed request(s). See report.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("UI smoke completed successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
