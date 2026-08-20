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
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_full_name TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_biography TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_following BIGINT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_posts_count BIGINT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_verified BOOLEAN;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_is_business BOOLEAN;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_category TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_profile_pic TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_external_url TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_avg_likes DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_avg_comments DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_engagement_rate DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ig_profile JSONB;
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
  if (!fs.existsSync(seedPath)) throw new Error(`Missing seed file: ${seedPath}`);

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
          v.id, v.name, v.uf, v.state, v.city, v.type, v.phone, v.email, v.website, v.instagram,
          v.completeness, v.score ?? 0, v.confidence ?? "baixa", v.scoreVersion ?? "v0-provisional",
          JSON.stringify(v.sources ?? []), JSON.stringify(v.metrics ?? {}),
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
  const profile = row.ig_profile || {};
  return {
    rank,
    id: row.id,
    name: row.name,
    displayName: row.ig_full_name || row.name,
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
    igFollowing: row.ig_following != null ? Number(row.ig_following) : null,
    igPostsCount: row.ig_posts_count != null ? Number(row.ig_posts_count) : null,
    igVerified: Boolean(row.ig_verified),
    igIsBusiness: Boolean(row.ig_is_business),
    igCategory: row.ig_category,
    igProfilePic: row.ig_profile_pic,
    igExternalUrl: row.ig_external_url,
    igBiography: row.ig_biography,
    igAvgLikes: row.ig_avg_likes != null ? Number(row.ig_avg_likes) : null,
    igAvgComments: row.ig_avg_comments != null ? Number(row.ig_avg_comments) : null,
    igEngagementRate: row.ig_engagement_rate != null ? Number(row.ig_engagement_rate) : null,
    recentPosts: Array.isArray(profile.recentPosts) ? profile.recentPosts.slice(0, 3) : [],
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
    res.json({ ok: true, vehicles: rows[0].c, apifyConfigured: Boolean(process.env.APIFY_TOKEN) });
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
      COUNT(*) FILTER (WHERE ig_biography IS NOT NULL)::int AS with_bio,
      COUNT(*) FILTER (WHERE ig_verified IS TRUE)::int AS verified,
      COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL)::int AS enriched,
      COALESCE(MAX(instagram_followers), 0)::bigint AS max_followers,
      MAX(score_version) AS score_version,
      MAX(updated_at) AS updated_at,
      MAX(last_enriched_at) AS last_enriched_at
    FROM vehicles
  `);
  const r = rows[0];
  res.json({
    total: r.total,
    states: r.states,
    types: r.types,
    withFollowers: r.with_followers,
    withBio: r.with_bio,
    verified: r.verified,
    enriched: r.enriched,
    maxFollowers: Number(r.max_followers),
    scoreVersion: r.score_version,
    scoredAt: r.updated_at,
    lastEnrichedAt: r.last_enriched_at,
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    dynamicRanking: true,
    note:
      r.with_bio > 0
        ? "Perfil IG enriquecido (bio, posts, engajamento). Top 20 recalcula ao vivo."
        : "Rode enrichment rico para preencher bio, posts e engajamento.",
  });
});

app.get("/api/top20", async (req, res) => {
  const uf = String(req.query.uf || "").toUpperCase();
  const type = String(req.query.type || "");
  if (!uf || !type) return res.status(400).json({ error: "uf and type are required" });

  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     WHERE uf = $1 AND type = $2
     ORDER BY score DESC, instagram_followers DESC NULLS LAST, name ASC
     LIMIT 20`,
    [uf, type]
  );
  res.json(rows.map((r, i) => mapVehicle(r, i + 1)));
});

app.get("/api/vehicle/:id", async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM vehicles WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(mapVehicle(rows[0]));
});

app.get("/api/stats", async (req, res) => {
  const uf = req.query.uf ? String(req.query.uf).toUpperCase() : null;
  const params = [];
  let where = "";
  if (uf) {
    params.push(uf);
    where = `WHERE uf = $1`;
  }
  const { rows } = await pool.query(
    `SELECT type,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE instagram_followers IS NOT NULL)::int AS with_followers,
      COALESCE(MAX(instagram_followers),0)::bigint AS max_followers
     FROM vehicles ${where}
     GROUP BY type ORDER BY type`,
    params
  );
  res.json(rows.map((r) => ({ ...r, max_followers: Number(r.max_followers) })));
});

app.get("/api/enrich/status", async (req, res) => {
  const id = req.query.id;
  if (id) {
    const job = getJob(String(id));
    if (!job) return res.status(404).json({ error: "job não encontrado" });
    return res.json(job);
  }
  res.json({ apifyConfigured: Boolean(process.env.APIFY_TOKEN), jobs: listJobs().slice(0, 10) });
});

app.post("/api/enrich/run", async (req, res) => {
  if (!requireEnrichAuth(req, res)) return;
  try {
    const job = await startEnrichment(pool, {
      uf: req.body?.uf,
      type: req.body?.type,
      limit: req.body?.limit,
      mode: req.body?.mode || "instagram",
      force: Boolean(req.body?.force),
    });
    res.status(202).json(job);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

const N8N_DISPATCH_WEBHOOK = process.env.N8N_DISPATCH_WEBHOOK || "";
const DISPATCH_DEFAULT_INSTANCE = process.env.DISPATCH_INSTANCE || "Agente";

function cleanPhone(p) {
  if (!p) return null;
  let d = String(p).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  return d.length >= 12 ? d : null;
}

app.post("/api/dispatch", async (req, res) => {
  try {
    const uf = String(req.body?.uf || "").toUpperCase();
    const type = String(req.body?.tipo || req.body?.type || "");
    const assunto = String(req.body?.assunto || "").trim();
    const texto = String(req.body?.texto || "").trim();
    const link = String(req.body?.link || "").trim();
    const canal = String(req.body?.canal || "whatsapp");
    const modo = String(req.body?.modo || "simulacao");
    const instancia = String(req.body?.instancia || DISPATCH_DEFAULT_INSTANCE).trim();
    const ids = Array.isArray(req.body?.vehicleIds) ? req.body.vehicleIds.map(String) : null;

    if (!uf || !type) return res.status(400).json({ error: "uf e tipo são obrigatórios" });
    if (!assunto || !texto) return res.status(400).json({ error: "assunto e texto são obrigatórios" });
    if (!["whatsapp", "email", "ambos"].includes(canal)) {
      return res.status(400).json({ error: "canal inválido" });
    }
    if (!["simulacao", "enviar"].includes(modo)) {
      return res.status(400).json({ error: "modo inválido" });
    }
    if (!N8N_DISPATCH_WEBHOOK) {
      return res.status(503).json({ error: "N8N_DISPATCH_WEBHOOK não configurado" });
    }

    let rows;
    if (ids?.length) {
      const { rows: r } = await pool.query(
        `SELECT id, name, phone, email, score, instagram_followers
         FROM vehicles WHERE uf = $1 AND type = $2 AND id = ANY($3::text[])
         ORDER BY score DESC NULLS LAST`,
        [uf, type, ids]
      );
      rows = r;
    } else {
      const { rows: r } = await pool.query(
        `SELECT id, name, phone, email, score, instagram_followers
         FROM vehicles WHERE uf = $1 AND type = $2
         ORDER BY score DESC, instagram_followers DESC NULLS LAST, name ASC
         LIMIT 20`,
        [uf, type]
      );
      rows = r;
    }

    const destinos = rows.map((v, i) => ({
      id: v.id,
      veiculo: v.name,
      phone: cleanPhone(v.phone),
      email: v.email || null,
      rank: i + 1,
      followers: v.instagram_followers != null ? Number(v.instagram_followers) : null,
    }));

    const reachable = destinos.filter((d) => {
      if (canal === "whatsapp") return Boolean(d.phone);
      if (canal === "email") return Boolean(d.email);
      return Boolean(d.phone || d.email);
    });

    const payload = {
      uf,
      tipo: type,
      assunto,
      texto,
      link,
      canal,
      modo,
      instancia,
      destinos,
    };

    const n8nRes = await fetch(N8N_DISPATCH_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const rawText = await n8nRes.text();
    let n8nJson = null;
    try {
      n8nJson = JSON.parse(rawText);
    } catch {
      n8nJson = { raw: rawText };
    }

    if (!n8nRes.ok) {
      return res.status(502).json({
        error: "falha no webhook n8n",
        status: n8nRes.status,
        detail: n8nJson,
      });
    }

    res.json({
      ok: true,
      modo,
      uf,
      tipo: type,
      totalVeiculos: destinos.length,
      comContato: reachable.length,
      semContato: destinos.length - reachable.length,
      n8n: n8nJson,
    });
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

// Recalcula scores com a fórmula atual (sem custo Apify)
{
  const { computeScore } = await import("./score.js");
  const { rows } = await pool.query(
    `SELECT id, completeness, email, phone, instagram, website, website_alive, city, type,
            instagram_followers, ig_engagement_rate, ig_avg_likes, ig_verified, sources
     FROM vehicles
     WHERE instagram_followers IS NOT NULL`
  );
  for (const row of rows) {
    const scored = computeScore(row);
    await pool.query(
      `UPDATE vehicles SET score = $2, confidence = $3, score_version = $4, updated_at = NOW() WHERE id = $1`,
      [row.id, scored.score, scored.confidence, scored.scoreVersion]
    );
  }
  console.log(`Rescored ${rows.length} enriched vehicles`);
}

app.listen(PORT, () => {
  console.log(`Radar API listening on :${PORT}`);
});
