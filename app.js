const API_URL = "/metrics";
const POLL_MS = 5000;
let start = Date.now();
let serverOffsetMs = 0; // serverTime - clientTime
let els = {};

function q(id) {
  return document.getElementById(id);
}

/* ---------------------- HELPERS ---------------------- */
function addLog(text) {
  if (!els.terminal) return;
  const line = document.createElement("div");
  line.className = "term-line";
  line.innerHTML = `<span class="p">➜</span> ${text}`;
  els.terminal.appendChild(line);
  els.terminal.scrollTop = els.terminal.scrollHeight;
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
  if (!el) return;
  el.classList.remove("warn", "bad");
  if (status === "warn") el.classList.add("warn");
  if (status === "bad") el.classList.add("bad");
}

/* ---------------------- CLOCK + UPTIME ---------------------- */
function updateClock() {
  if (!els.clock || !els.clockTz) return;
  const now = new Date(Date.now() + serverOffsetMs);
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  els.clock.textContent = `${h}:${m}:${s}`;
  els.clockTz.textContent = tz;
}

function updatePageUptime() {
  if (!els.uptime) return;
  let diff = Math.floor((Date.now() - start) / 1000);
  let mm = String(Math.floor(diff / 60)).padStart(2, "0");
  let ss = String(diff % 60).padStart(2, "0");
  els.uptime.textContent = `${mm}:${ss}`;
}

/* ---------------------- METRICS RENDER ---------------------- */
function renderMetrics(data) {
  if (!data) return;

  const serverTs = Date.parse(data.timestamp);
  if (!Number.isNaN(serverTs)) {
    serverOffsetMs = serverTs - Date.now();
  }

  if (els.hostname) els.hostname.textContent = data.hostname || "unknown";
  if (els.sysUptime) els.sysUptime.textContent = formatDuration(data.system?.uptimeSeconds);
  if (els.sysLoad) {
    els.sysLoad.textContent = `load: ${data.system?.loadAverage?.["1m"]?.toFixed?.(2) ?? "--"} / ${data.system?.loadAverage?.["5m"]?.toFixed?.(2) ?? "--"} / ${data.system?.loadAverage?.["15m"]?.toFixed?.(2) ?? "--"}`;
  }
  if (els.sysCores) {
    els.sysCores.innerHTML = `<span class="dot"></span> cores: ${data.system?.cpu?.logicalCores ?? "--"}`;
  }

  const cpuPct = Number(data.system?.cpu?.loadPercent ?? 0);
  if (els.cpuLoad) els.cpuLoad.textContent = Number.isFinite(cpuPct) ? `${cpuPct.toFixed(1)}%` : "--%";
  if (els.cpuBar) els.cpuBar.style.width = `${Math.min(Math.max(cpuPct, 0), 100)}%`;
  const lastSampleMs = data.system?.cpu?.lastSampleMs;
  const ageMs = lastSampleMs ? Date.now() - lastSampleMs : null;
  if (els.cpuSample) els.cpuSample.textContent = lastSampleMs ? `sampled ${Math.round(ageMs / 1000)}s ago` : "sampling…";

  const mem = data.system?.memory || {};
  const usedPct = Number(mem.usedPercent ?? 0);
  if (els.memUsed) els.memUsed.textContent = `${formatBytes(mem.usedBytes)} / ${formatBytes(mem.totalBytes)}`;
  if (els.memFree) els.memFree.textContent = `free: ${formatBytes(mem.freeBytes)}`;
  if (els.memBar) els.memBar.style.width = `${Math.min(Math.max(usedPct, 0), 100)}%`;

  const proc = data.process || {};
  if (els.procUptime) els.procUptime.textContent = `up ${formatDuration(proc.uptimeSeconds)}`;
  if (els.procMem) els.procMem.textContent = `rss: ${formatBytes(proc.rssBytes)} • heap: ${formatBytes(proc.heapUsedBytes)} / ${formatBytes(proc.heapTotalBytes)}`;
  if (els.procPid) els.procPid.innerHTML = `<span class="dot"></span> pid: ${proc.pid ?? "--"}`;

  if (els.lastSync) els.lastSync.textContent = new Date(Date.now() + serverOffsetMs).toLocaleTimeString();
}

/* ---------------------- API STATUS ---------------------- */
function setApiStatus(state, message) {
  const tag = els.apiStatusTag;
  const apiDot = els.apiDot;
  const apiBadge = els.apiBadge;
  const healthDot = els.healthDot;
  const healthBadge = els.healthBadge;
  if (!tag || !apiDot || !apiBadge || !healthDot || !healthBadge) return;

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

/* ---------------------- INIT ----------------------
