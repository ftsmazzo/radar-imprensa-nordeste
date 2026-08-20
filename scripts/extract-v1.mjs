import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const jsPath = path.join(process.env.TEMP || "/tmp", "radar.js");

function unescapeTemplateLiteral(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === "\\" || n === "`" || n === "$") {
        out += n;
        i += 1;
        continue;
      }
    }
    out += s[i];
  }
  return out;
}

function extractJsonArray(js, needle) {
  const start = js.indexOf(needle);
  if (start < 0) throw new Error("Array start not found");

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < js.length; i++) {
    const ch = js[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) throw new Error("Could not find end of array");
  return unescapeTemplateLiteral(js.slice(start, end));
}

if (!fs.existsSync(jsPath)) {
  console.error("Missing", jsPath);
  process.exit(1);
}

const js = fs.readFileSync(jsPath, "utf8");
const raw = extractJsonArray(js, '[{"id":"atlas-');
const data = JSON.parse(raw);

const byType = {};
const byUf = {};
let withEmail = 0;
let withInstagram = 0;
let withPhone = 0;
let withWebsite = 0;

for (const v of data) {
  byType[v.type] = (byType[v.type] || 0) + 1;
  byUf[v.uf] = (byUf[v.uf] || 0) + 1;
  if (v.email) withEmail += 1;
  if (v.instagram) withInstagram += 1;
  if (v.phone) withPhone += 1;
  if (v.website) withWebsite += 1;
}

const meta = {
  extractedAt: new Date().toISOString(),
  source: "https://radarimprensanordeste.manus.space/",
  count: data.length,
  byType,
  byUf,
  contacts: { withEmail, withInstagram, withPhone, withWebsite },
};

const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "vehicles-v1.json"), JSON.stringify(data));
fs.writeFileSync(path.join(dataDir, "vehicles-v1.meta.json"), JSON.stringify(meta, null, 2));

console.log("OK", meta.count);
console.log(JSON.stringify(meta.byType));
console.log(JSON.stringify(meta.contacts));
