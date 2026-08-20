import fs from "node:fs";
import path from "node:path";

const jsPath = path.join(process.env.TEMP || "/tmp", "radar.js");
const js = fs.readFileSync(jsPath, "utf8");
const needle = '[{"id":"atlas-';
const start = js.indexOf(needle);

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

const raw = js.slice(start, end);
const p = 120041;
const slice = raw.slice(p - 100, p + 100);
fs.writeFileSync(
  path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/radar-imprensa-nordeste-v2/data/debug-slice.txt"),
  slice
);
console.log("wrote debug-slice, codepoints:");
console.log([...slice].map((c) => (c === "\\" ? "BS" : c === '"' ? "Q" : c)).join(""));
