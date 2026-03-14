import express, { Request, Response } from 'express';
import fs from "node:fs";
import LogRecorder from "./logs.ts";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let logs = new LogRecorder();

app.get('/', (_req: Request, res: Response) => {
    const html = fs.readFileSync("./index.html", "utf-8");
    logs.newVisitor();
    console.log("GET at / at "+ new Date().toLocaleString());
    res.send(html);
});


app.get('/:id', (_req: Request, res: Response) => {
    console.log("GET at /:id at "+ new Date().toLocaleString());
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});