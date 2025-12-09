/**
 * Production-ready Express server:
 * - Serves index.html at `/` (cached in-memory)
 * - Serves static assets from the current directory (e.g., app.js)
 * - Exposes /health (204) and /metrics (JSON)
 * - Sets a CSP that allows self-hosted scripts and (optionally) Cloudflare beacon
 *
 * Install: npm i express helmet morgan compression
 * Run:     PORT=3000 NODE_ENV=production node server.js
 */
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, "index.html");

// In-memory cache for index.html
let indexCache = null;
let indexMtimeMs = null;
async function loadIndexHtml() {
  if (indexCache) return indexCache;
  const stat = await fs.stat(INDEX_PATH);
  indexMtimeMs = stat.mtimeMs;
  indexCache = await fs.readFile(INDEX_PATH, "utf8");
  return indexCache;
}

// --- Middleware hardening + CSP ---
app.set("trust proxy", true);

// Add the hash for the inline snippet the browser reported.
// Remove the hash if you remove that inline script from your HTML.
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "https://static.cloudflareinsights.com",
    "'sha256-4X4vtaMA1nKwjf1LliuNfGrTSPLjX6QARgIg1Nxy4q8='"
  ],
  styleSrc: ["'self'", "'unsafe-inline'"], // inline <style> still present
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  upgradeInsecureRequests: [],
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: cspDirectives,
    },
  })
);

app.use(compression());
app.use(express.json({ limit: "100kb" }));
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: () => process.env.NODE_ENV === "test",
  })
);

// Serve static assets (app.js, etc.) with caching
app.use(
  express.static(__dirname, {
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      }
    },
  })
);

// --- CPU sampling (rolling snapshot) ---
let cpuSnapshot = sampleCpuTimes();
let cpuLoadPercent = 0;
let lastCpuSampleMs = Date.now();

function sampleCpuTimes() {
  const cpus = os.cpus();
  const totals = cpus.reduce(
    (acc, cpu) => {
      acc.idle += cpu.times.idle;
      acc.total +=
        cpu.times.user +
        cpu.times.nice +
        cpu.times.sys +
        cpu.times.irq +
        cpu.times.idle;
      return acc;
    },
    { idle: 0, total: 0 }
  );
  return totals;
}

function refreshCpuLoad() {
  const current = sampleCpuTimes();
  const idleDiff = current.idle - cpuSnapshot.idle;
  const totalDiff = current.total - cpuSnapshot.total;
  const busy = Math.max(totalDiff - idleDiff, 0);
  cpuLoadPercent = totalDiff > 0 ? (busy / totalDiff) * 100 : 0;
  cpuSnapshot = current;
  lastCpuSampleMs = Date.now();
}

// Sample CPU once per second
const cpuTimer = setInterval(refreshCpuLoad, 1000);
cpuTimer.unref();

// --- Helpers ---
function getMemoryStats() {
  const free = os.freemem();
  const total = os.totalmem();
  const used = total - free;
  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usedPercent: total > 0 ? (used / total) * 100 : 0,
  };
}

function getProcessStats() {
  const mem = process.memoryUsage();
  return {
    pid: process.pid,
    uptimeSeconds: process.uptime(),
    rssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
  };
}

// --- Routes ---
app.get("/health", (_req, res) => res.sendStatus(204));

app.get("/metrics", (_req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    system: {
      uptimeSeconds: os.uptime(),
      loadAverage: {
        "1m": os.loadavg()[0],
        "5m": os.loadavg()[1],
        "15m": os.loadavg()[2],
      },
      cpu: {
        logicalCores: os.cpus().length,
        loadPercent: Number(cpuLoadPercent.toFixed(2)),
        lastSampleMs: lastCpuSampleMs,
      },
      memory: getMemoryStats(),
    },
    process: getProcessStats(),
  });
});

// Serve cached index.html
app.get("/", async (_req, res) => {
  try {
    const html = await loadIndexHtml();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    if (indexMtimeMs) {
      res.setHeader("Last-Modified", new Date(indexMtimeMs).toUTCString());
    }
    res.send(html);
  } catch (err) {
    console.error("Failed to serve index.html", err);
    res.status(500).send("Server error");
  }
});

// --- Server lifecycle ---
const server = app.listen(PORT, () => {
  console.log(`Metrics API listening on :${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  clearInterval(cpuTimer);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

["SIGTERM", "SIGINT"].forEach((sig) => process.on(sig, () => shutdown(sig)));
