/**
 * Descoberta online de veículos via OpenRouter (Perplexity) + opcional Apify.
 * Jobs em memória; aplicação no Postgres via applyDiscoverResults.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const MODEL = process.env.OPENROUTER_MODEL || "perplexity/sonar-pro";

const jobs = new Map();

export function getDiscoverJob(id) {
  return jobs.get(id) || null;
}

export function listDiscoverJobs() {
  return [...jobs.values()].sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

export function isOpenRouterConfigured() {
  return Boolean(OPENROUTER_API_KEY);
}

function normalizeKey(city, name) {
  return `${String(city || "").trim()}|${String(name || "").trim()}`.toLowerCase();
}

function loadApCities() {
  const p = path.join(root, "data/ibge-cities-ap-2026.json");
  if (!fs.existsSync(p)) return [];
  const pack = JSON.parse(fs.readFileSync(p, "utf8"));
  return (pack.cities || []).map((c) => c.name).filter(Boolean);
}

async function openRouterAsk(city) {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY ausente no servidor");
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
      "HTTP-Referer": "https://radar-imprensa-amapa.kxryyk.easypanel.host",
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

function completenessOf(v) {
  const fields = [v.phone, v.email, v.website, v.instagram, v.whatsapp, v.address];
  const n = fields.filter(Boolean).length;
  if (n >= 3) return "complete";
  if (n >= 1) return "partial";
  return "minimal";
}

function scoreOf(v) {
  let s = 0.55;
  if (v.phone) s += 0.08;
  if (v.email) s += 0.08;
  if (v.website) s += 0.08;
  if (v.whatsapp) s += 0.06;
  if (v.instagram) s += 0.05;
  if (v.address) s += 0.04;
  return Math.min(0.95, Number(s.toFixed(2)));
}

async function existingKeys(pool, uf = "AP") {
  const { rows } = await pool.query(
    `SELECT city, name FROM vehicles WHERE uf = $1`,
    [uf]
  );
  return new Set(rows.map((r) => normalizeKey(r.city, r.name)));
}

async function nextApIds(pool, count) {
  const { rows } = await pool.query(
    `SELECT id FROM vehicles WHERE id ~ '^ap-[0-9]+$'`
  );
  let max = 0;
  for (const r of rows) {
    const n = Number(String(r.id).replace(/^ap-/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`ap-${String(max + i).padStart(3, "0")}`);
  }
  return ids;
}

async function runJob(pool, job) {
  try {
    const known = await existingKeys(pool, "AP");
    const found = [];
    for (const city of job.cities) {
      job.currentCity = city;
      job.progress = `${found.length} candidatos · ${city}`;
      let batch = [];
      try {
        const fromLlm = job.apifyOnly ? [] : await openRouterAsk(city);
        const fromApify = job.withApify || job.apifyOnly ? await apifyGoogle(city) : [];
        batch = [...fromLlm, ...fromApify];
      } catch (err) {
        job.errors.push({ city, error: String(err.message || err) });
        continue;
      }
      for (const item of batch) {
        if (!item?.name) continue;
        const cityName = item.city || city;
        const key = normalizeKey(cityName, item.name);
        if (known.has(key)) continue;
        known.add(key);
        found.push({
          name: String(item.name).trim(),
          type: ["Rádio", "TV", "Jornal", "Portal", "Blog"].includes(item.type) ? item.type : "Portal",
          city: cityName,
          uf: "AP",
          state: "Amapá",
          phone: item.phone || null,
          whatsapp: item.whatsapp || null,
          email: item.email || null,
          website: item.website || null,
          instagram: item.instagram || null,
          address: item.address || null,
          sourceNote: item.sourceNote || null,
          selected: true,
        });
      }
      job.candidates = found;
      job.found = found.length;
    }
    job.status = "done";
    job.finishedAt = new Date().toISOString();
    job.progress = `${found.length} candidatos novos`;
    job.currentCity = null;
  } catch (err) {
    job.status = "error";
    job.finishedAt = new Date().toISOString();
    job.errors.push({ error: String(err.message || err) });
  }
}

export async function startDiscover(pool, opts = {}) {
  if (!OPENROUTER_API_KEY && !opts.apifyOnly) {
    throw new Error("OPENROUTER_API_KEY não configurada neste serviço");
  }
  if (opts.apifyOnly && !APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN ausente (modo apify-only)");
  }

  const allCities = loadApCities();
  let cities = [];
  if (opts.city) cities = [String(opts.city)];
  else if (Array.isArray(opts.cities) && opts.cities.length) cities = opts.cities.map(String);
  else cities = allCities;

  if (!cities.length) throw new Error("Nenhuma cidade para descobrir");

  const id = `disc-${Date.now().toString(36)}`;
  const job = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    model: opts.apifyOnly ? null : MODEL,
    withApify: Boolean(opts.withApify),
    apifyOnly: Boolean(opts.apifyOnly),
    cities,
    currentCity: null,
    progress: "iniciando…",
    found: 0,
    applied: 0,
    candidates: [],
    errors: [],
  };
  jobs.set(id, job);
  setImmediate(() => runJob(pool, job));
  return {
    id: job.id,
    status: job.status,
    cities: job.cities,
    model: job.model,
    openRouterConfigured: isOpenRouterConfigured(),
  };
}

export async function applyDiscoverResults(pool, jobId, indices = null) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("job não encontrado");
  if (job.status !== "done") throw new Error("job ainda não terminou");

  const list =
    indices == null
      ? job.candidates.filter((c) => c.selected !== false)
      : indices.map((i) => job.candidates[i]).filter(Boolean);

  if (!list.length) return { applied: 0, items: [] };

  const ids = await nextApIds(pool, list.length);
  const client = await pool.connect();
  const inserted = [];
  try {
    await client.query("BEGIN");
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const id = ids[i];
      const completeness = completenessOf(v);
      const score = scoreOf(v);
      const sources = ["openrouter-perplexity", ...(v.sourceNote ? [String(v.sourceNote).slice(0, 80)] : [])];
      const metrics = {
        note: v.sourceNote || "Descoberto via painel (Perplexity/OpenRouter)",
        region: "amapa",
        discoveredAt: new Date().toISOString(),
        discoverJobId: jobId,
      };
      await client.query(
        `INSERT INTO vehicles (
          id, name, uf, state, city, type, phone, email, website, instagram,
          address, whatsapp, completeness, score, confidence, score_version, sources, metrics
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb
        )
        ON CONFLICT (id) DO NOTHING`,
        [
          id,
          v.name,
          "AP",
          "Amapá",
          v.city,
          v.type,
          v.phone,
          v.email,
          v.website,
          v.instagram,
          v.address,
          v.whatsapp,
          completeness,
          score,
          "média",
          "ap-discover-v1",
          JSON.stringify(sources),
          JSON.stringify(metrics),
        ]
      );
      inserted.push({ id, name: v.name, city: v.city, type: v.type });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  job.applied = (job.applied || 0) + inserted.length;
  // mark applied candidates
  for (const item of list) {
    item.applied = true;
  }
  return { applied: inserted.length, items: inserted };
}
