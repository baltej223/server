import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, "index.html");

// CSP updated: include the Cloudflare inline bootstrap hash
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "https://static.cloudflareinsights.com",
    "'sha256-xRxUTO9nYMJT2pj8SJ2P3Pkh2fvl6I7MJplY5jzdWGA='"
  ],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  upgradeInsecureRequests: [],
};

app.set("trust proxy", true);
app.use(
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
  })
);
app.use(compression());
app.use(express.json({ limit: "100kb" }));
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: () => process.env.NODE_ENV === "test",
  })
);

// Static assets (cache ok); index.html will be served with no-store below
app.use(
  express.static(__dirname, {
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

// CPU sampling
let cpuSnapshot = sampleCpuTimes();
let cpuLoadPercent = 0;
let lastSampleMs = Date.now();

function sampleCpuTimes() {
  const cpus = os.cpus();
  return cpus.reduce(
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
}
function refreshCpuLoad() {
  const current = sampleCpuTimes();
  const idleDiff = current.idle - cpuSnapshot.idle;
  const totalDiff = current.total - cpuSnapshot.total;
  const busy = Math.max(totalDiff - idleDiff, 0);
  cpuLoadPercent = totalDiff > 0 ? (busy / totalDiff) * 100 : 0;
  cpuSnapshot = current;
  lastSampleMs = Date.now();
}
setInterval(refreshCpuLoad, 1000).unref();

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
        lastSampleMs,
      },
      memory: getMemoryStats(),
    },
    process: getProcessStats(),
  });
});

// No caching for index.html
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(INDEX_PATH);
});

const server = app.listen(PORT, () => {
  console.log(`Metrics API listening on :${PORT}`);
});
["SIGTERM", "SIGINT"].forEach((sig) =>
  process.on(sig, () => {
    console.log(`${sig} received, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  })
);
