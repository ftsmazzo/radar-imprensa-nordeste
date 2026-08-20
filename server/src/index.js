import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getJob, listJobs, startEnrichment } from "./enrich.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const ENRICH_TOKEN = process.env.ENRICH_TOKEN || "";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("select 1");
      return;
    } catch {
      console.log(`Waiting for Postgres... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Postgres unavailable");
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      uf CHAR(2) NOT NULL,
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      type TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      website TEXT,
      instagram TEXT,
      completeness TEXT,
      score DOUBLE PRECISION NOT NULL DEFAULT 0,
      confidence TEXT,
      score_version TEXT,
      sources JSONB,
      metrics JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS instagram_followers BIGINT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS website_alive BOOLEAN;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS vehicles_uf_type_score_idx ON vehicles (uf, type, score DESC);
    CREATE INDEX IF NOT EXISTS vehicles_enriched_idx ON vehicles (last_enriched_at NULLS FIRST);
  `);
}

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM vehicles");
  if (rows[0].c > 0) {
    console.log(`Vehicles already seeded: ${rows[0].c}`);
    return;
  }

  const seedPath = path.join(root, "data", "vehicles-scored-v0.json");
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Missing seed file: ${seedPath}`);
  }

  const vehicles = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  console.log(`Seeding ${vehicles.length} vehicles...`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const v of vehicles) {
      await client.query(
        `INSERT INTO vehicles (
          id, name, uf, state, city, type, phone, email, website, instagram,
          completeness, score, confidence, score_version, sources, metrics
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb
        ) ON CONFLICT (id) DO NOTHING`,
        [
          v.id,
          v.name,
          v.uf,
          v.state,
          v.city,
          v.type,
          v.phone,
          v.email,
          v.website,
          v.instagram,
          v.completeness,
          v.score ?? 0,
          v.confidence ?? "baixa",
          v.scoreVersion ?? "v0-provisional",
          JSON.stringify(v.sources ?? []),
          JSON.stringify(v.metrics ?? {}),
        ]
      );
    }
    await client.query("COMMIT");
    console.log("Seed complete");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function mapVehicle(row, rank = null) {
  return {
    rank,
    id: row.id,
    name: row.name,
    uf: row.uf,
    state: row.state,
    city: row.city,
    type: row.type,
    phone: row.phone,
    email: row.email,
    website: row.website,
    instagram: row.instagram,
    completeness: row.completeness,
    score: Number(row.score),
    confidence: row.confidence,
    scoreVersion: row.score_version,
    instagramFollowers: row.instagram_followers != null ? Number(row.instagram_followers) : null,
    websiteAlive: row.website_alive,
    lastEnrichedAt: row.last_enriched_at,
    sources: row.sources,
    metrics: row.metrics,
  };
}

function requireEnrichAuth(req, res) {
  if (!ENRICH_TOKEN) return true;
  const header = req.headers["x-enrich-token"] || req.query.token;
  if (header !== ENRICH_TOKEN) {
    res.status(401).json({ error: "token inválido" });
    return false;
  }
  return true;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM vehicles");
    res.json({
      ok: true,
      vehicles: rows[0].c,
      apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/api/meta", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(DISTINCT uf)::int AS states,
      COUNT(DISTINCT type)::int AS types,
      COUNT(*) FILTER (WHERE instagram_followers IS NOT NULL)::int AS with_followers,
      COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL)::int AS enriched,
      MAX(score_version) AS score_version,
      MAX(updated_at) AS updated_at,
      MAX(last_enriched_at) AS last_enriched_at
    FROM vehicles
  `);
  const r = rows[0];
  const dynamic = r.with_followers > 0;
  res.json({
    total: r.total,
    states: r.states,
    types: r.types,
    withFollowers: r.with_followers,
    enriched: r.enriched,
    scoreVersion: r.score_version,
    scoredAt: r.updated_at,
    lastEnrichedAt: r.last_enriched_at,
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    dynamicRanking: true,
    note: dynamic
      ? "Ranking dinâmico: Top 20 recalcula automaticamente quando o Apify atualiza seguidores no Postgres."
      : "Ranking ainda provisional. Rode o enrichment Apify para atualizar seguidores e recalcular o Top 20 ao vivo.",
  });
});

app.get("/api/top20", async (req, res) => {
  const uf = String(req.query.uf || "").toUpperCase();
  const type = String(req.query.type || "");
  if (!uf || !type) {
    return res.status(400).json({ error: "uf and type are required" });
  }

  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     WHERE uf = $1 AND type = $2
     ORDER BY score DESC, completeness DESC, name ASC
     LIMIT 20`,
    [uf, type]
  );

  res.json(rows.map((r, i) => mapVehicle(r, i + 1)));
});

app.get("/api/stats", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT uf, type, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE instagram_followers IS NOT NULL)::int AS with_followers
    FROM vehicles
    GROUP BY uf, type
    ORDER BY uf, type
  `);
  res.json(rows);
});

app.get("/api/enrich/status", async (req, res) => {
  const id = req.query.id;
  if (id) {
    const job = getJob(String(id));
    if (!job) return res.status(404).json({ error: "job não encontrado" });
    return res.json(job);
  }
  res.json({
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    jobs: listJobs().slice(0, 10),
  });
});

app.post("/api/enrich/run", async (req, res) => {
  if (!requireEnrichAuth(req, res)) return;
  try {
    const job = await startEnrichment(pool, {
      uf: req.body?.uf,
      limit: req.body?.limit,
      mode: req.body?.mode || "full",
    });
    res.status(202).json(job);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

const publicCandidates = [path.join(root, "public"), path.join(root, "web", "dist")];
const publicDir = publicCandidates.find((p) => fs.existsSync(p));
if (publicDir) {
  app.use(express.static(publicDir));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

await waitForDb();
await migrate();
await seedIfEmpty();

app.listen(PORT, () => {
  console.log(`Radar API listening on :${PORT}`);
});
