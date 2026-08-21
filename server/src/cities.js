import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packPath = path.resolve(__dirname, "../../data/ibge-top10-cities-ne-2025.json");

let pack = null;

function loadPack() {
  if (pack) return pack;
  pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  return pack;
}

export function normalizeCityName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getTopCitiesForUf(uf) {
  const data = loadPack();
  const block = data.ufs?.[String(uf || "").toUpperCase()];
  if (!block) return null;
  return {
    uf: String(uf).toUpperCase(),
    state: block.name,
    source: data.source,
    referenceDate: data.referenceDate,
    tableUpdatedAt: data.tableUpdatedAt,
    note: data.note,
    cities: block.cities,
  };
}

/** Resolve nome IBGE → nome exato presente no inventário (city). */
export function resolveCityName(ibgeName, inventoryCities) {
  const target = normalizeCityName(ibgeName);
  const exact = inventoryCities.find((c) => normalizeCityName(c) === target);
  if (exact) return exact;
  return inventoryCities.find((c) => {
    const n = normalizeCityName(c);
    return n.includes(target) || target.includes(n);
  }) || null;
}
