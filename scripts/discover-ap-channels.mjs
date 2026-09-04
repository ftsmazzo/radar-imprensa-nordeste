/**
 * Descoberta de veículos do Amapá via OpenRouter (Perplexity) + opcional Apify Google Search.
 *
 * Uso:
 *   OPENROUTER_API_KEY=... npm run discover:ap
 *   OPENROUTER_API_KEY=... APIFY_TOKEN=... npm run discover:ap -- --with-apify
 *   APIFY_TOKEN=... npm run discover:ap -- --apify-only
 *
 * Modelo sugerido: perplexity/sonar-pro (ou sonar) no OpenRouter.
 * Não grava no Postgres — gera data/vehicles-ap-discovered.json para revisão humana.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const MODEL = process.env.OPENROUTER_MODEL || "perplexity/sonar-pro";
const withApify = process.argv.includes("--with-apify");
const apifyOnly = process.argv.includes("--apify-only");

const cities = JSON.parse(
  fs.readFileSync(path.join(root, "data/ibge-cities-ap-2026.json"), "utf8")
).cities.map((c) => c.name);

const existing = new Set(
  JSON.parse(fs.readFileSync(path.join(root, "data/vehicles-ap-v1.json"), "utf8")).items.map((v) =>
    `${v.city}|${v.name}`.toLowerCase()
  )
);

async function openRouterAsk(city) {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY ausente");
  const prompt = `Liste veículos de imprensa REAIS do município de ${city}, Amapá (Brasil):
rádios FM/AM, TVs, jornais, portais de notícias e blogs jornalísticos.
Para cada um, retorne JSON array com objetos:
{"name":"...","type":"Rádio|TV|Jornal|Portal|Blog","city":"${city}","phone":null,"whatsapp":null,"email":null,"website":null,"instagram":null,"address":null,"sourceNote":"onde achou"}
Regras: só dados públicos verificáveis; null se não souber; não invente telefone; não inclua prefeitura salvo se for o único canal de notícia local; máximo 12 itens.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://radar-imprensa-web.kxryyk.easypanel.host",
      "X-Title": "Radar Imprensa Amapa Discovery",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: "Você é um pesquisador de mídia local. Responda só com JSON válido (array)." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw);
  const text = data.choices?.[0]?.message?.content || "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

async function apifyGoogle(city) {
  if (!APIFY_TOKEN) return [];
  const queries = [
    `rádio FM ${city} Amapá contato`,
    `portal de notícias ${city} AP`,
    `jornal ${city} Amapá site`,
  ];
  const actor = process.env.APIFY_GOOGLE_ACTOR || "apify/google-search-scraper";
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=180`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries,
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      languageCode: "pt-BR",
      countryCode: "br",
    }),
  });
  if (!res.ok) {
    console.warn(`Apify Google falhou ${city}: ${res.status}`);
    return [];
  }
  const items = await res.json();
  const hits = [];
  for (const row of items) {
    for (const r of row.organicResults || []) {
      hits.push({
        name: r.title || r.url,
        type: "Portal",
        city,
        website: r.url || null,
        phone: null,
        email: null,
        whatsapp: null,
        instagram: null,
        address: null,
        sourceNote: `apify-google: ${r.description || ""}`.slice(0, 200),
      });
    }
  }
  return hits.slice(0, 15);
}

if (apifyOnly && !APIFY_TOKEN) {
  console.error("APIFY_TOKEN ausente (modo --apify-only).");
  process.exit(1);
}
if (!apifyOnly && !OPENROUTER_API_KEY) {
  console.error(`OPENROUTER_API_KEY ausente.

Defina a chave e rode:
  $env:OPENROUTER_API_KEY="sk-or-..."   # PowerShell
  npm run discover:ap

Sem OpenRouter, alternativas:
  APIFY_TOKEN=... npm run discover:ap -- --apify-only
  npm run import:anatel-ap   # depois de baixar PBFM.csv em data/anatel/
`);
  process.exit(1);
}

const found = [];
for (const city of cities) {
  process.stdout.write(`· ${city}… `);
  try {
    const fromLlm = apifyOnly ? [] : await openRouterAsk(city);
    let fromApify = [];
    if (withApify || apifyOnly) fromApify = await apifyGoogle(city);
    const batch = [...fromLlm, ...fromApify];
    let n = 0;
    for (const item of batch) {
      if (!item?.name) continue;
      const key = `${item.city || city}|${item.name}`.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      found.push({ ...item, city: item.city || city, uf: "AP", state: "Amapá" });
      n += 1;
    }
    console.log(`${n} novos (${batch.length} brutos)`);
  } catch (err) {
    console.log(`ERRO ${err.message || err}`);
  }
}

const out = {
  version: "ap-discovered-v1",
  model: apifyOnly ? null : MODEL,
  withApify: withApify || apifyOnly,
  apifyOnly,
  generatedAt: new Date().toISOString(),
  count: found.length,
  note: "Revisar manualmente antes de mesclar em vehicles-ap-v1.json",
  items: found,
};
const dest = path.join(root, "data/vehicles-ap-discovered.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`\nWrote ${found.length} candidates → ${dest}`);
