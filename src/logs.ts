import fs from "node:fs";

interface ParsedObject {
    [key: string]: string;
}

class boml {
    private fileName: string = "";
    constructor(file_name: string) {
        this.fileName = file_name;
        this.create_file();
    }
    create_file() {
        if (!fs.existsSync(this.fileName)) {
            fs.writeFileSync(this.fileName, "");
        }
    }
    parse(): ParsedObject {
        let file_content = fs.readFileSync(this.fileName, "utf-8");
        let file_arr: string[] = file_content.split("\n");
        let object: ParsedObject = {};
        for (const line of file_arr) {
            let key_val = line.split("=");
            const [key, value]: [string, string] = [key_val[0], key_val[1]];
            if (key !== "" && value !== "") {
                object[key] = value;
            }
        }
        return object;
    }
    save(object: ParsedObject) {
        let file_content = "";
        for (const [key, value] of Object.entries(object)) {
            file_content += `${key}=${value}\n`;
        }
        fs.writeFileSync(this.fileName, file_content);
    }
    get(key: string): string {
        let file_object = this.parse();
        return file_object[key];
    }

    edit(key: string, value: string) {
        let file_object = this.parse();
        file_object[key] = value;
        this.save(file_object);
    }
}

export default class LogRecorder {
    private fileName: string = "";
    private boml: boml;

    constructor(fl_name: string = "logs.txt") {
        this.fileName = fl_name;
        this.boml = new boml(this.fileName);
    }
    newVisitor() {
        let current = this.boml.get("visitors");
        if (current == undefined) {
            this.boml.edit("visitors", "1");
        }
        else {
            this.boml.edit('visitors', (parseInt(current) + 1).toString());
        }
    }
    runningSince() {
        this.boml.edit("last_update", new Date().toLocaleString());
    }
    getVisitors(): number {
        let current = this.boml.get("visitors");
        if (current == undefined) {
            return 0;
        }
        else {
            return parseInt(current);
        }
    }
    getRunningSince(): string {
        let current = this.boml.get("last_update");
        if (current == undefined) {
            return "Unknown";
        }
        else {
            return current;
        }
    }
}