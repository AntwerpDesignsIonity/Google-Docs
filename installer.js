#!/usr/bin/env node
/* eslint-disable */
/**
 * IONITY GUI Installer
 * --------------------
 * A zero-dependency, cross-platform launchable installer.
 *
 * Run it via the platform launcher (`install.sh`, `install.command`,
 * `install.bat`) or directly with `node installer.js`. It starts a tiny
 * local HTTP server, opens the user's default browser, and provides a GUI
 * to:
 *   - check that Node.js / npm are available
 *   - install npm dependencies
 *   - start the IONITY desktop app
 *   - build platform installers (`npm run make`)
 *
 * No data is sent anywhere - the server binds to 127.0.0.1 on a free port
 * and exits as soon as the user closes the installer window or presses
 * Ctrl+C in the terminal.
 */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const crypto = require("crypto");

const ROOT = __dirname;
const PORT_PREF = parseInt(process.env.IONITY_INSTALLER_PORT || "0", 10);
const HOST = "127.0.0.1";

// A random token guards all action endpoints so other local processes
// can't trigger installs against this server.
const TOKEN = crypto.randomBytes(24).toString("hex");

// ---------------------------------------------------------------------------
// Background job tracking
// ---------------------------------------------------------------------------
const jobs = new Map(); // id -> { id, label, status, exitCode, log: string[] }

function createJob(label) {
  const id = crypto.randomBytes(8).toString("hex");
  const job = { id, label, status: "running", exitCode: null, log: [] };
  jobs.set(id, job);
  return job;
}

function pushLog(job, chunk) {
  // Cap log length so a runaway process can't exhaust memory.
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    job.log.push(line);
    if (job.log.length > 5000) job.log.splice(0, job.log.length - 5000);
  }
}

function runCommand(label, cmd, args, opts = {}) {
  const job = createJob(label);
  const isWin = process.platform === "win32";
  // On Windows .cmd/.bat shims (npm, npx) require shell:true.
  const useShell = isWin || opts.shell === true;

  let child;
  try {
    child = spawn(cmd, args, {
      cwd: ROOT,
      env: process.env,
      shell: useShell,
      windowsHide: true,
    });
  } catch (err) {
    job.status = "error";
    job.exitCode = -1;
    pushLog(job, `Failed to spawn ${cmd}: ${err.message}`);
    return job;
  }

  pushLog(job, `$ ${cmd} ${args.join(" ")}`);
  child.stdout.on("data", (d) => pushLog(job, d));
  child.stderr.on("data", (d) => pushLog(job, d));
  child.on("error", (err) => {
    pushLog(job, `error: ${err.message}`);
  });
  child.on("close", (code) => {
    job.exitCode = code;
    job.status = code === 0 ? "done" : "error";
    pushLog(job, `\n[process exited with code ${code}]`);
  });
  job.child = child;
  return job;
}

// ---------------------------------------------------------------------------
// Environment probe
// ---------------------------------------------------------------------------
function probe(cmd, args) {
  try {
    const res = spawnSync(cmd, args, {
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    if (res.status === 0) return (res.stdout || res.stderr || "").trim();
  } catch (_) {}
  return null;
}

function environment() {
  return {
    node: process.version,
    npm: probe("npm", ["--version"]),
    nodeModulesInstalled: fs.existsSync(path.join(ROOT, "node_modules")),
    platform: process.platform,
    arch: process.arch,
    cwd: ROOT,
  };
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self' 'unsafe-inline'; img-src 'self' data:;",
  });
  res.end(html);
}

function requireToken(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  const t = url.searchParams.get("t") || req.headers["x-ionity-token"];
  if (t !== TOKEN) {
    send(res, 403, { error: "forbidden" });
    return false;
  }
  return true;
}

function handler(req, res) {
  const url = new URL(req.url, `http://${HOST}`);

  if (req.method === "GET" && url.pathname === "/") {
    return sendHtml(res, renderIndex());
  }

  if (req.method === "GET" && url.pathname === "/api/env") {
    if (!requireToken(req, res)) return;
    return send(res, 200, environment());
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    if (!requireToken(req, res)) return;
    const action = url.searchParams.get("action");
    let job;
    switch (action) {
      case "install":
        job = runCommand("Install dependencies", "npm", ["install"]);
        break;
      case "start":
        job = runCommand("Start IONITY", "npm", ["start"]);
        break;
      case "make":
        job = runCommand("Build installers", "npm", ["run", "make"]);
        break;
      default:
        return send(res, 400, { error: "unknown action" });
    }
    return send(res, 200, { id: job.id, label: job.label });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/job/")) {
    if (!requireToken(req, res)) return;
    const id = url.pathname.slice("/api/job/".length);
    const job = jobs.get(id);
    if (!job) return send(res, 404, { error: "no such job" });
    const since = parseInt(url.searchParams.get("since") || "0", 10);
    return send(res, 200, {
      id: job.id,
      label: job.label,
      status: job.status,
      exitCode: job.exitCode,
      total: job.log.length,
      lines: job.log.slice(since),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/shutdown") {
    if (!requireToken(req, res)) return;
    send(res, 200, { ok: true });
    setTimeout(() => {
      for (const job of jobs.values()) {
        if (job.status === "running" && job.child && !job.child.killed) {
          try { job.child.kill(); } catch (_) {}
        }
      }
      process.exit(0);
    }, 100);
    return;
  }

  send(res, 404, { error: "not found" });
}

// ---------------------------------------------------------------------------
// HTML page
// ---------------------------------------------------------------------------
function renderIndex() {
  // The token is interpolated as a JSON string; this is the only dynamic
  // value injected into the page, so there is no XSS surface.
  const tokenJson = JSON.stringify(TOKEN);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IONITY Installer</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root {
    --ionity-blue: #1f4fc4;
    --ionity-blue-dark: #15368a;
    --ink: #0c1330;
    --muted: #5a6480;
    --bg: #f5f7fc;
    --card: #ffffff;
    --ok: #1a8a4a;
    --err: #c4361f;
    --border: #dde3f0;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--ink);
    min-height: 100vh;
  }
  header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 24px 32px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .logo {
    font-weight: 900;
    font-size: 36px;
    letter-spacing: 2px;
    color: var(--ionity-blue);
    font-family: "Arial Black", system-ui, sans-serif;
  }
  .tagline { color: var(--muted); font-size: 14px; }
  main {
    max-width: 920px;
    margin: 32px auto;
    padding: 0 24px 64px;
    display: grid;
    gap: 24px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px 24px;
    box-shadow: 0 1px 2px rgba(12, 19, 48, 0.04);
  }
  h2 { margin: 0 0 12px; font-size: 18px; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .kv { display: grid; grid-template-columns: 180px 1fr; gap: 6px 16px;
        font-size: 14px; color: var(--ink); }
  .kv .k { color: var(--muted); }
  button {
    appearance: none;
    border: 1px solid var(--ionity-blue);
    background: var(--ionity-blue);
    color: #fff;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
  }
  button.secondary {
    background: #fff;
    color: var(--ionity-blue);
  }
  button:hover:not(:disabled) { background: var(--ionity-blue-dark); color: #fff; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  .log {
    background: #0c1330;
    color: #d8e1ff;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    padding: 14px 16px;
    border-radius: 8px;
    height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 600; border: 1px solid var(--border);
  }
  .badge.ok  { color: var(--ok);  border-color: #b6e4c8; background: #eafaf0; }
  .badge.err { color: var(--err); border-color: #f1c5be; background: #fdecea; }
  .badge.run { color: var(--ionity-blue); border-color: #c4d2f3; background: #eef2fc; }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding-bottom: 24px; }
  a { color: var(--ionity-blue); }
</style>
</head>
<body>
<header>
  <div class="logo">IONITY</div>
  <div>
    <div style="font-weight:600">Desktop Installer</div>
    <div class="tagline">Installs dependencies, runs and builds the app locally. Nothing is sent to a remote server.</div>
  </div>
</header>
<main>
  <section class="card">
    <h2>Environment</h2>
    <div id="env" class="kv">Loading...</div>
  </section>

  <section class="card">
    <h2>Actions</h2>
    <div class="row">
      <button id="btn-install">1. Install Dependencies</button>
      <button id="btn-start" class="secondary">2. Start IONITY</button>
      <button id="btn-make"  class="secondary">3. Build Installers</button>
      <span id="status" class="badge">idle</span>
    </div>
    <p style="color:var(--muted);font-size:13px;margin-top:14px">
      <strong>1.</strong> Runs <code>npm install</code> to fetch Electron and build tools.<br>
      <strong>2.</strong> Runs <code>npm start</code> to launch the IONITY desktop app.<br>
      <strong>3.</strong> Runs <code>npm run make</code> to build native installer
      packages for your platform into <code>./out</code>.
    </p>
  </section>

  <section class="card">
    <h2>Output</h2>
    <div id="log" class="log">Ready.</div>
    <div class="row" style="margin-top:12px">
      <button id="btn-quit" class="secondary">Quit Installer</button>
    </div>
  </section>

  <footer>
    IONITY desktop installer &middot; runs entirely on 127.0.0.1.
  </footer>
</main>
<script>
(function () {
  const TOKEN = ${tokenJson};
  const $ = (id) => document.getElementById(id);
  const logEl = $("log");
  const statusEl = $("status");
  const btnInstall = $("btn-install");
  const btnStart = $("btn-start");
  const btnMake = $("btn-make");
  const btnQuit = $("btn-quit");
  let busy = false;
  let currentJob = null;
  let pollTimer = null;

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "badge " + (kind || "");
  }
  function setBusy(b) {
    busy = b;
    [btnInstall, btnStart, btnMake].forEach((el) => (el.disabled = b));
  }
  function appendLog(lines) {
    if (!lines || !lines.length) return;
    const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 10;
    logEl.textContent += "\\n" + lines.join("\\n");
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }

  async function loadEnv() {
    const r = await fetch("/api/env?t=" + encodeURIComponent(TOKEN));
    const env = await r.json();
    $("env").innerHTML =
      \`<div class="k">Node.js</div><div>\${env.node}</div>\` +
      \`<div class="k">npm</div><div>\${env.npm || "<span style='color:var(--err)'>not found</span>"}</div>\` +
      \`<div class="k">Platform</div><div>\${env.platform} / \${env.arch}</div>\` +
      \`<div class="k">Dependencies installed</div><div>\${env.nodeModulesInstalled ? "yes" : "no"}</div>\` +
      \`<div class="k">Project directory</div><div><code>\${env.cwd}</code></div>\`;
  }

  async function startAction(action, label) {
    if (busy) return;
    setBusy(true);
    setStatus(label + "...", "run");
    logEl.textContent = "$ " + label;
    const r = await fetch("/api/run?action=" + action + "&t=" + encodeURIComponent(TOKEN), { method: "POST" });
    if (!r.ok) {
      setStatus("error", "err");
      setBusy(false);
      return;
    }
    const job = await r.json();
    currentJob = { id: job.id, since: 0 };
    poll();
  }

  async function poll() {
    if (!currentJob) return;
    const r = await fetch("/api/job/" + currentJob.id + "?since=" + currentJob.since + "&t=" + encodeURIComponent(TOKEN));
    if (!r.ok) {
      setStatus("error", "err");
      setBusy(false);
      return;
    }
    const j = await r.json();
    appendLog(j.lines);
    currentJob.since = j.total;
    if (j.status === "running") {
      pollTimer = setTimeout(poll, 600);
    } else {
      setStatus(j.status === "done" ? "done" : "error (code " + j.exitCode + ")",
                j.status === "done" ? "ok" : "err");
      setBusy(false);
      currentJob = null;
      loadEnv();
    }
  }

  btnInstall.addEventListener("click", () => startAction("install", "Installing dependencies"));
  btnStart.addEventListener("click",  () => startAction("start",   "Starting IONITY"));
  btnMake.addEventListener("click",   () => startAction("make",    "Building installers"));
  btnQuit.addEventListener("click", async () => {
    await fetch("/api/shutdown?t=" + encodeURIComponent(TOKEN), { method: "POST" });
    document.body.innerHTML = "<main><section class='card'><h2>Installer closed.</h2><p>You can close this tab.</p></section></main>";
  });

  loadEnv();
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Open the user's default browser to a given URL.
// ---------------------------------------------------------------------------
function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (_) {
    // If opening fails, the user can still copy the URL from the console.
  }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------
function start() {
  const server = http.createServer(handler);
  server.on("error", (err) => {
    console.error("Installer server error:", err.message);
    process.exit(1);
  });
  server.listen(PORT_PREF, HOST, () => {
    const { port } = server.address();
    const url = `http://${HOST}:${port}/?t=${TOKEN}`;
    const sep = "=".repeat(60);
    console.log(sep);
    console.log("  IONITY Installer");
    console.log(sep);
    console.log("  Open this URL in your browser:");
    console.log("    " + url);
    console.log("");
    console.log("  Press Ctrl+C to quit.");
    console.log(sep);
    openBrowser(`http://${HOST}:${port}/`);
  });

  // Graceful shutdown - terminate any still-running child jobs.
  const bye = () => {
    console.log("\nShutting down installer...");
    for (const job of jobs.values()) {
      if (job.status === "running" && job.child && !job.child.killed) {
        try { job.child.kill(); } catch (_) {}
      }
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

start();
