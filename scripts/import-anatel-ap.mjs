/**
 * Cruza o seed do Amapá com Planos Básicos ANATEL (PBFM / PBOM).
 *
 * Fonte oficial (dados abertos):
 *   https://dados.gov.br/dados/conjuntos-dados/plano-basico-de-radiodifusao
 * Baixe o ZIP, extraia PBFM.csv e/ou PBOM.csv em data/anatel/
 *
 * Uso:
 *   node scripts/import-anatel-ap.mjs
 *   node scripts/import-anatel-ap.mjs --csv data/anatel/PBFM.csv
 *
 * Não grava no Postgres — gera data/vehicles-ap-anatel.json para revisão.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const anatelDir = path.join(root, "data/anatel");

function parseArgs() {
  const args = process.argv.slice(2);
  const csvIdx = args.indexOf("--csv");
  return {
    csv: csvIdx >= 0 ? args[csvIdx + 1] : null,
  };
}

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === sep && !inQ) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || "").trim();
    });
    return row;
  });
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
    const found = Object.keys(row).find((h) => normalize(h) === normalize(k));
    if (found && row[found]) return String(row[found]).trim();
  }
  return "";
}

function loadExisting() {
  const seed = JSON.parse(fs.readFileSync(path.join(root, "data/vehicles-ap-v1.json"), "utf8"));
  return {
    items: seed.items || [],
    keys: new Set((seed.items || []).map((v) => `${normalize(v.city)}|${normalize(v.name)}`)),
  };
}

function resolveCsvPaths(explicit) {
  if (explicit) return [path.resolve(root, explicit)];
  if (!fs.existsSync(anatelDir)) return [];
  return fs
    .readdirSync(anatelDir)
    .filter((f) => /^pb(fm|om|ot|tvd)?\.csv$/i.test(f) || /pbfm|pbom/i.test(f))
    .map((f) => path.join(anatelDir, f));
}

function rowToCandidate(row, sourceFile) {
  const uf = pick(row, ["UF", "UF_OUTORGA", "SIGLA_UF", "Estado"]);
  if (uf && uf.toUpperCase() !== "AP") return null;

  const city = pick(row, ["Municipio", "Município", "MUNICIPIO", "Cidade", "LOCALIDADE"]);
  const name =
    pick(row, ["Entidade", "ENTIDADE", "Razao_Social", "Razão Social", "Nome", "ESTACAO", "Estação"]) ||
    pick(row, ["Canal", "CANAL", "Frequencia", "Frequência"]);
  if (!city || !name) return null;

  const freq = pick(row, ["Frequencia", "Frequência", "FREQ", "Canal", "CANAL"]);
  const service = pick(row, ["Servico", "Serviço", "SERVICO", "Modalidade"]);
  const displayName = freq && !/fm|am|\d/i.test(name) ? `${name} ${freq}` : name;

  return {
    name: displayName,
    type: /tv|tvd/i.test(service) || /pbtvd/i.test(sourceFile) ? "TV" : "Rádio",
    city,
    uf: "AP",
    state: "Amapá",
    phone: null,
    whatsapp: null,
    email: null,
    website: null,
    instagram: null,
    address: null,
    frequency: freq || null,
    service: service || null,
    sourceNote: `anatel:${path.basename(sourceFile)}`,
  };
}

const { csv } = parseArgs();
const paths = resolveCsvPaths(csv);

if (!paths.length) {
  console.error(`Nenhum CSV ANATEL encontrado.

1) Baixe o ZIP em:
   https://dados.gov.br/dados/conjuntos-dados/plano-basico-de-radiodifusao
2) Extraia PBFM.csv (e opcionalmente PBOM.csv) em:
   ${anatelDir}
3) Rode de novo: npm run import:anatel-ap
`);
  process.exit(1);
}

const { keys } = loadExisting();
const found = [];
const seen = new Set();

for (const file of paths) {
  if (!fs.existsSync(file)) {
    console.warn(`Arquivo ausente: ${file}`);
    continue;
  }
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  let n = 0;
  for (const row of rows) {
    const item = rowToCandidate(row, file);
    if (!item) continue;
    const key = `${normalize(item.city)}|${normalize(item.name)}`;
    if (keys.has(key) || seen.has(key)) continue;
    seen.add(key);
    found.push(item);
    n += 1;
  }
  console.log(`· ${path.basename(file)} → ${n} candidatos novos (${rows.length} linhas)`);
}

const out = {
  version: "ap-anatel-v1",
  generatedAt: new Date().toISOString(),
  sources: paths.map((p) => path.relative(root, p)),
  count: found.length,
  note: "Plano Básico ≠ outorga ativa. Revisar antes de mesclar em vehicles-ap-v1 / build-ap-vehicles.mjs",
  items: found,
};
const dest = path.join(root, "data/vehicles-ap-anatel.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`\nWrote ${found.length} candidates → ${dest}`);
