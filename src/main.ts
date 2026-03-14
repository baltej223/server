import express, { Request, Response } from 'express';
import fs from "node:fs";
import LogRecorder from "./logs.ts";

// FOR CI-CD
import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";
import verifyGithubWebhook from './webhook.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

interface RawBodyRequest extends Request {
    rawBody: Buffer;
}

app.use(
    express.json({
        verify: (req: RawBodyRequest, res, buf) => {
            req.rawBody = buf;
        },
    })
);

let logs = new LogRecorder();

app.get('/', (_req: Request, res: Response) => {
    const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
    logs.newVisitor();
    console.log("GET at / at " + new Date().toLocaleString());
    res.send(html);
});

app.post('/redeploy', (_req: Request, res: Response) => {
    // it runs a redeploy.sh 
    // How can I do it?
    console.log("Received redeploy request at " + new Date().toLocaleString());

    const githubSignature = _req.headers["x-hub-signature-256"];

    if (!githubSignature) {
        return res.status(401).send("No signature");
    }

    if (!verifyGithubWebhook(_req)) {
        return res.status(401).send("Forbidden");
    }

    const scriptPath = path.resolve(process.cwd(), "..","redeploy.sh");

    const child = spawn("bash", [scriptPath], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: process.cwd()
    });

    child.stdout.on("data", (data) => {
        console.log(`[redeploy stdout]: ${data}`);
    });

    child.stderr.on("data", (data) => {
        console.error(`[redeploy stderr]: ${data}`);
    });

    child.on("close", (code) => {
        console.log(`[redeploy exited with code ${code}]`);
    });

    child.unref();

    res.json({ message: "Redeploy started" });

    server.close(() => {
        process.exit(0);
    });
});

app.get('/test-spawn', (_req: Request, res: Response) => {
    console.log("=== TEST SPAWN DEBUG ===");
    
    const scriptPath = path.resolve(process.cwd(), "..","redeploy.sh");
    console.log("Script path:", scriptPath);

    const child = spawn("bash", [scriptPath], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: process.cwd()
    });

    child.stdout.on("data", (data) => {
        console.log(`[test stdout]: ${data}`);
    });

    child.stderr.on("data", (data) => {
        console.error(`[test stderr]: ${data}`);
    });

    child.on("close", (code) => {
        console.log(`[test exited with code ${code}]`);
    });

    res.json({ message: "Test spawn done - check terminal output" });
});


process.on("SIGINT", () => {
    console.log("Shutting down server...");
    server.close(() => process.exit(0));
});


const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
