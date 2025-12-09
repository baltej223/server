const API_URL = "/metrics";
const POLL_MS = 5000;
const terminal = document.getElementById("terminal");

let start = Date.now();
let serverOffsetMs = 0; // serverTime - clientTime

/* ---------------------- HELPERS ---------------------- */
function addLog(text) {
  const line = document.createElement("div");
  line.className = "term-line";
  line.innerHTML = `<span class="p">➜</span> ${text}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(sec = 0) {
  if (!Number.isFinite(sec)) return "--";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function setStatusDot(el, status) {
  el.classList.remove("warn", "bad");
  if (status === "warn") el.classList.add("warn");
  if (status === "bad") el.classList.add("bad");
}

/* ---------------------- CLOCK + UPTIME ---------------------- */
function updateClock() {
  const now = new Date(Date.now() + serverOffsetMs);
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById("clock").textContent = `${h}:${m}:${s}`;
  document.getElementById("clock-tz").textContent = tz;
}
setInterval(updateClock, 1000); updateClock();

function updatePageUptime() {
  let diff = Math.floor((Date.now() - start) / 1000);
  let mm = String(Math.floor(diff / 60)).padStart(2,'0');
  let ss = String(diff % 60).padStart(2,'0');
  document.getElementById("uptime").textContent = `${mm}:${ss}`;
}
setInterval(updatePageUptime, 1000); updatePageUptime();

/* ---------------------- METRICS RENDER ---------------------- */
function renderMetrics(data) {
  // Adjust server clock offset
  const serverTs = Date.parse(data.timestamp);
  if (!Number.isNaN(serverTs)) {
    serverOffsetMs = serverTs - Date.now();
  }

  document.getElementById("hostname").textContent = data.hostname || "unknown";
  document.getElementById("sys-uptime").textContent = formatDuration(data.system?.uptimeSeconds);
  document.getElementById("sys-load").textContent = `load: ${data.system?.loadAverage?.["1m"]?.toFixed?.(2) ?? "--"} / ${data.system?.loadAverage?.["5m"]?.toFixed?.(2) ?? "--"} / ${data.system?.loadAverage?.["15m"]?.toFixed?.(2) ?? "--"}`;
  document.getElementById("sys-cores").innerHTML = `<span class="dot"></span> cores: ${data.system?.cpu?.logicalCores ?? "--"}`;

  const cpuPct = Number(data.system?.cpu?.loadPercent ?? 0);
  document.getElementById("cpu-load").textContent = Number.isFinite(cpuPct) ? `${cpuPct.toFixed(1)}%` : "--%";
  document.getElementById("cpu-bar").style.width = `${Math.min(Math.max(cpuPct, 0), 100)}%`;
  const lastSampleMs = data.system?.cpu?.lastSampleMs;
  const ageMs = lastSampleMs ? Date.now() - lastSampleMs : null;
  document.getElementById("cpu-sample").textContent = lastSampleMs ? `sampled ${Math.round(ageMs/1000)}s ago` : "sampling…";

  const mem = data.system?.memory || {};
  const usedPct = Number(mem.usedPercent ?? 0);
  document.getElementById("mem-used").textContent = `${formatBytes(mem.usedBytes)} / ${formatBytes(mem.totalBytes)}`;
  document.getElementById("mem-free").textContent = `free: ${formatBytes(mem.freeBytes)}`;
  document.getElementById("mem-bar").style.width = `${Math.min(Math.max(usedPct, 0), 100)}%`;

  const proc = data.process || {};
  document.getElementById("proc-uptime").textContent = `up ${formatDuration(proc.uptimeSeconds)}`;
  document.getElementById("proc-mem").textContent = `rss: ${formatBytes(proc.rssBytes)} • heap: ${formatBytes(proc.heapUsedBytes)} / ${formatBytes(proc.heapTotalBytes)}`;
  document.getElementById("proc-pid").innerHTML = `<span class="dot"></span> pid: ${proc.pid ?? "--"}`;

  document.getElementById("last-sync").textContent = new Date(Date.now() + serverOffsetMs).toLocaleTimeString();
}

/* ---------------------- API STATUS ---------------------- */
function setApiStatus(state, message) {
  const tag = document.getElementById("api-status-tag");
  const apiDot = document.getElementById("api-dot");
  const apiBadge = document.getElementById("api-badge");
  const healthDot = document.getElementById("health-dot");
  const healthBadge = document.getElementById("health-badge");

  if (state === "online") {
    tag.textContent = "API • online";
    tag.style.color = "var(--accent)";
    apiBadge.textContent = "ONLINE";
    apiBadge.className = "badge good";
    setStatusDot(apiDot, null);
    healthBadge.textContent = "HEALTHY";
    healthBadge.className = "badge good";
    setStatusDot(healthDot, null);
    if (message) addLog(message);
  } else {
    tag.textContent = state === "warn" ? "API • slow" : "API • offline";
    tag.style.color = state === "warn" ? "var(--warn)" : "var(--danger)";
    apiBadge.textContent = state === "warn" ? "DEGRADED" : "OFFLINE";
    apiBadge.className = `badge ${state === "warn" ? "warn" : "bad"}`;
    setStatusDot(apiDot, state === "warn" ? "warn" : "bad");
    healthBadge.textContent = "CHECK";
    healthBadge.className = "badge warn";
    setStatusDot(healthDot, "warn");
    if (message) addLog(message);
  }
}

/* ---------------------- POLLING ---------------------- */
async function pollMetrics() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(API_URL, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderMetrics(data);
    setApiStatus("online");
  } catch (err) {
    setApiStatus("bad", `api unreachable (${err.message})`);
  }
}

pollMetrics();
setInterval(pollMetrics, POLL_MS);

// Initial log
setTimeout(() => addLog("network stable — all tunnels active"), 1000);
setTimeout(() => addLog("system ready — welcome"), 2000);
setTimeout(() => addLog("metrics polling every 5s"), 2600);
