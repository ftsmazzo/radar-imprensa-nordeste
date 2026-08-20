import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");

const CAPITALS = new Set([
  "Maceió",
  "Salvador",
  "Fortaleza",
  "São Luís",
  "João Pessoa",
  "Recife",
  "Teresina",
  "Natal",
  "Aracaju",
]);

const COMPLETENESS = { minimal: 0.35, partial: 0.7, complete: 1 };

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function scoreVehicle(v) {
  const completeness = COMPLETENESS[v.completeness] ?? 0.3;
  const contact =
    (v.email ? 0.45 : 0) + (v.phone ? 0.35 : 0) + (v.instagram ? 0.2 : 0);
  const website = v.website ? 1 : 0;
  const capital = CAPITALS.has(v.city) ? 1 : 0.45;
  const typeBoost =
    v.type === "TV" ? 1 : v.type === "Jornal" ? 0.9 : v.type === "Rádio" ? 0.75 : 0.65;
  const sourceTrust = Array.isArray(v.sources) && v.sources.length ? 0.85 : 0.4;

  // Provisional v0 weights — replace with real metrics after Apify
  const score =
    completeness * 0.15 +
    clamp01(contact) * 0.15 +
    website * 0.1 +
    capital * 0.15 +
    typeBoost * 0.15 +
    sourceTrust * 0.1 +
    // reserved slot for followers/audience (neutral until enrichment)
    0.5 * 0.2;

  const confidence =
    v.completeness === "complete" ? "média" : v.completeness === "partial" ? "baixa-média" : "baixa";

  return {
    ...v,
    score: Math.round(score * 1000) / 1000,
    scoreVersion: "v0-provisional",
    confidence,
    metrics: {
      followers: null,
      audience: null,
      circulation: null,
      readership: null,
    },
  };
}

function topNByGroup(items, n = 20) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.uf}||${item.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const ranked = {};
  for (const [key, list] of groups) {
    const [uf, type] = key.split("||");
    const sorted = [...list].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ca = COMPLETENESS[a.completeness] ?? 0;
      const cb = COMPLETENESS[b.completeness] ?? 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    ranked[uf] ??= {};
    ranked[uf][type] = sorted.slice(0, n).map((v, i) => ({ rank: i + 1, ...v }));
  }
  return ranked;
}

const vehicles = JSON.parse(fs.readFileSync(path.join(dataDir, "vehicles-v1.json"), "utf8"));
const scored = vehicles.map(scoreVehicle);
const top20 = topNByGroup(scored, 20);

fs.writeFileSync(path.join(dataDir, "vehicles-scored-v0.json"), JSON.stringify(scored));
fs.writeFileSync(path.join(dataDir, "top20-v0.json"), JSON.stringify(top20, null, 2));

const summary = {
  scoredAt: new Date().toISOString(),
  scoreVersion: "v0-provisional",
  total: scored.length,
  groups: Object.fromEntries(
    Object.entries(top20).map(([uf, types]) => [
      uf,
      Object.fromEntries(Object.entries(types).map(([t, list]) => [t, list.length])),
    ])
  ),
  note: "Score provisional sem métricas reais de audiência/seguidores. Recalibrar após Apify.",
};

fs.writeFileSync(path.join(dataDir, "top20-v0.meta.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
