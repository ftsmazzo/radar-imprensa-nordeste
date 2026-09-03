import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packPath = path.resolve(__dirname, "../../data/ibge-top10-cities-ne-2025.json");
const apPackPath = path.resolve(__dirname, "../../data/ibge-cities-ap-2026.json");

let pack = null;
let apPack = null;

function loadPack() {
  if (pack) return pack;
  pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  return pack;
}

function loadApPack() {
  if (apPack) return apPack;
  apPack = JSON.parse(fs.readFileSync(apPackPath, "utf8"));
  return apPack;
}

export function defaultLimitPerCity(uf) {
  return String(uf || "").toUpperCase() === "AP" ? 5 : 8;
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
  const code = String(uf || "").toUpperCase();
  if (code === "AP") {
    const data = loadApPack();
    return {
      uf: "AP",
      state: data.state || "Amapá",
      source: data.source,
      referenceDate: data.referenceDate,
      tableUpdatedAt: data.tableUpdatedAt,
      note: data.note,
      cities: data.cities,
    };
  }
  const data = loadPack();
  const block = data.ufs?.[code];
  if (!block) return null;
  return {
    uf: code,
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
