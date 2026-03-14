import express, { Request, Response } from 'express';
import fs from "node:fs";
import LogRecorder from "./logs.ts";

// FOR CI-CD
import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let logs = new LogRecorder();

app.get('/', (_req: Request, res: Response) => {
  const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
  logs.newVisitor();
  console.log("GET at / at " + new Date().toLocaleString());
  res.send(html);
});

app.get('/redeploy', (_req: Request, res: Response) => {
  // it runs a redeploy.sh 
  // How can I do it?
  if (!process.env.REDEPLOY_SECRET) {
    return res.status(500).send("Redeploy secret not set");
  }

  if (_req.headers.authorization !== process.env.REDEPLOY_SECRET) {
    return res.status(403).send("Forbidden");
  }

  const scriptPath = path.resolve(process.cwd(), "redeploy.sh");

  const child = spawn("bash", [scriptPath], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  res.json({ message: "Redeploy started" });

  server.close(() => {
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
