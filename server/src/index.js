import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getJob, listJobs, startEnrichment } from "./enrich.js";
import { defaultLimitPerCity, getTopCitiesForUf, resolveCityName } from "./cities.js";
import {
  CATALOG,
  attachIbge,
  facets as searchFacets,
  listCities,
  parseSearchQuery,
  searchVehicles,
} from "./search.js";
import { REGION_META, resolveRadarRegion } from "./region.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const ENRICH_TOKEN = process.env.ENRICH_TOKEN || "";
const RADAR_REGION = resolveRadarRegion();
const REGION = REGION_META[RADAR_REGION];

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
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS editorial_rank SMALLINT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS editorial_band TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS editorial_confidence TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS editorial_justification TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS editorial_sources JSONB;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_followers BIGINT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_reach_value DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_reach_unit TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_metric_source TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_source_type TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_evidence_quality DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_observation TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_score_editorial DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_score_digital DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_score_reach DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_score_evidence DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_score_final DOUBLE PRECISION;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS desk_coverage TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS quantitative_rank SMALLINT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS whatsapp TEXT;
    CREATE INDEX IF NOT EXISTS vehicles_uf_type_score_idx ON vehicles (uf, type, score DESC);
    CREATE INDEX IF NOT EXISTS vehicles_enriched_idx ON vehicles (last_enriched_at NULLS FIRST);
    CREATE INDEX IF NOT EXISTS vehicles_editorial_rank_idx ON vehicles (uf, editorial_rank)
      WHERE editorial_rank IS NOT NULL;
    CREATE INDEX IF NOT EXISTS vehicles_quantitative_rank_idx ON vehicles (uf, quantitative_rank)
      WHERE quantitative_rank IS NOT NULL;
    CREATE INDEX IF NOT EXISTS vehicles_uf_city_idx ON vehicles (uf, city);
    CREATE INDEX IF NOT EXISTS vehicles_name_idx ON vehicles (name);
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

async function applyEditorialRanking() {
  const editorialPath = path.join(root, "data", "editorial-ranking-v1.json");
  if (!fs.existsSync(editorialPath)) {
    console.log("Editorial ranking file missing — skip");
    return;
  }

  const pack = JSON.parse(fs.readFileSync(editorialPath, "utf8"));
  const items = Array.isArray(pack.items) ? pack.items : [];
  if (!items.length) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE vehicles SET
        editorial_rank = NULL,
        editorial_band = NULL,
        editorial_confidence = NULL,
        editorial_justification = NULL,
        editorial_sources = NULL
    `);

    const { computeScore } = await import("./score.js");
    let applied = 0;
    for (const item of items) {
      const sources = {
        directory: item.sourceDirectory || null,
        desk: item.sourceDesk || null,
        version: pack.version || "editorial-v1",
      };
      const { rows } = await client.query(`SELECT * FROM vehicles WHERE id = $1`, [item.vehicleId]);
      if (!rows[0]) continue;
      const row = rows[0];
      const scored = computeScore({
        ...row,
        editorial_rank: item.rank,
        editorial_band: item.band,
        editorial_confidence: item.confidence,
      });
      await client.query(
        `UPDATE vehicles SET
          editorial_rank = $2,
          editorial_band = $3,
          editorial_confidence = $4,
          editorial_justification = $5,
          editorial_sources = $6::jsonb,
          score = $7,
          confidence = $8,
          score_version = $9,
          updated_at = NOW()
        WHERE id = $1`,
        [
          item.vehicleId,
          item.rank,
          item.band || null,
          item.confidence || null,
          item.justification || null,
          JSON.stringify(sources),
          scored.score,
          scored.confidence,
          scored.scoreVersion,
        ]
      );
      applied += 1;
    }
    await client.query("COMMIT");
    console.log(`Editorial ranking applied: ${applied}/${items.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function applyDeskScore() {
  const deskPath = path.join(root, "data", "desk-score-v1.json");
  if (!fs.existsSync(deskPath)) {
    console.log("Desk score file missing — skip");
    return;
  }

  const pack = JSON.parse(fs.readFileSync(deskPath, "utf8"));
  const items = Array.isArray(pack.items) ? pack.items : [];
  if (!items.length) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE vehicles SET
        desk_followers = NULL,
        desk_reach_value = NULL,
        desk_reach_unit = NULL,
        desk_metric_source = NULL,
        desk_source_type = NULL,
        desk_evidence_quality = NULL,
        desk_observation = NULL,
        desk_score_editorial = NULL,
        desk_score_digital = NULL,
        desk_score_reach = NULL,
        desk_score_evidence = NULL,
        desk_score_final = NULL,
        desk_coverage = NULL,
        quantitative_rank = NULL
    `);

    const { computeScore } = await import("./score.js");
    let applied = 0;
    let followersFilled = 0;
    for (const item of items) {
      const { rows } = await client.query(`SELECT * FROM vehicles WHERE id = $1`, [item.vehicleId]);
      if (!rows[0]) continue;
      const row = rows[0];
      const fillFollowers =
        item.deskFollowers != null && (row.instagram_followers == null || Number(row.instagram_followers) < Number(item.deskFollowers));

      const scored = computeScore({
        ...row,
        desk_followers: item.deskFollowers,
        desk_score_final: item.deskScoreFinal,
        desk_coverage: item.deskCoverage,
        quantitative_rank: item.quantitativeRank,
        instagram_followers: fillFollowers ? item.deskFollowers : row.instagram_followers,
      });

      await client.query(
        `UPDATE vehicles SET
          desk_followers = $2,
          desk_reach_value = $3,
          desk_reach_unit = $4,
          desk_metric_source = $5,
          desk_source_type = $6,
          desk_evidence_quality = $7,
          desk_observation = $8,
          desk_score_editorial = $9,
          desk_score_digital = $10,
          desk_score_reach = $11,
          desk_score_evidence = $12,
          desk_score_final = $13,
          desk_coverage = $14,
          quantitative_rank = $15,
          instagram_followers = CASE
            WHEN $16::boolean THEN COALESCE(GREATEST(instagram_followers, $2), $2)
            ELSE instagram_followers
          END,
          metrics = COALESCE(metrics, '{}'::jsonb) || $17::jsonb,
          score = $18,
          confidence = $19,
          score_version = $20,
          updated_at = NOW()
        WHERE id = $1`,
        [
          item.vehicleId,
          item.deskFollowers,
          item.deskReachValue,
          item.deskReachUnit,
          item.deskMetricSource,
          item.deskSourceType,
          item.deskEvidenceQuality,
          item.deskObservation,
          item.deskScoreEditorial,
          item.deskScoreDigital,
          item.deskScoreReach,
          item.deskScoreEvidence,
          item.deskScoreFinal,
          item.deskCoverage,
          item.quantitativeRank,
          fillFollowers,
          JSON.stringify({
            deskScoreFinal: item.deskScoreFinal,
            deskCoverage: item.deskCoverage,
            quantitativeRank: item.quantitativeRank,
            deskFollowers: item.deskFollowers,
            deskReachValue: item.deskReachValue,
            deskReachUnit: item.deskReachUnit,
            source: pack.version || "desk-score-v1",
          }),
          scored.score,
          scored.confidence,
          scored.scoreVersion,
        ]
      );
      applied += 1;
      if (fillFollowers) followersFilled += 1;
    }
    await client.query("COMMIT");
    console.log(`Desk score applied: ${applied}/${items.length} (followers filled/upgraded: ${followersFilled})`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function applyAmapaSeed() {
  const apPath = path.join(root, "data", "vehicles-ap-v1.json");
  if (!fs.existsSync(apPath)) {
    console.log("Amapá seed missing — skip");
    return;
  }
  const pack = JSON.parse(fs.readFileSync(apPath, "utf8"));
  const items = Array.isArray(pack.items) ? pack.items : [];
  if (!items.length) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let applied = 0;
    for (const v of items) {
      await client.query(
        `INSERT INTO vehicles (
          id, name, uf, state, city, type, phone, email, website, instagram,
          address, whatsapp, completeness, score, confidence, score_version, sources, metrics
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          uf = EXCLUDED.uf,
          state = EXCLUDED.state,
          city = EXCLUDED.city,
          type = EXCLUDED.type,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          website = EXCLUDED.website,
          instagram = EXCLUDED.instagram,
          address = EXCLUDED.address,
          whatsapp = EXCLUDED.whatsapp,
          completeness = EXCLUDED.completeness,
          score = EXCLUDED.score,
          confidence = EXCLUDED.confidence,
          score_version = EXCLUDED.score_version,
          sources = EXCLUDED.sources,
          metrics = EXCLUDED.metrics,
          updated_at = NOW()`,
        [
          v.id, v.name, v.uf, v.state, v.city, v.type, v.phone, v.email, v.website, v.instagram,
          v.address, v.whatsapp, v.completeness, v.score ?? 0, v.confidence ?? "baixa",
          v.scoreVersion ?? "ap-desk-v1",
          JSON.stringify(v.sources ?? []), JSON.stringify(v.metrics ?? {}),
        ]
      );
      applied += 1;
    }
    await client.query("COMMIT");
    console.log(`Amapá seed applied: ${applied}/${items.length}`);
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
    address: row.address || null,
    whatsapp: row.whatsapp || null,
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
    editorialRank: row.editorial_rank != null ? Number(row.editorial_rank) : null,
    editorialBand: row.editorial_band || null,
    editorialConfidence: row.editorial_confidence || null,
    editorialJustification: row.editorial_justification || null,
    editorialSources: row.editorial_sources || null,
    deskFollowers: row.desk_followers != null ? Number(row.desk_followers) : null,
    deskReachValue: row.desk_reach_value != null ? Number(row.desk_reach_value) : null,
    deskReachUnit: row.desk_reach_unit || null,
    deskMetricSource: row.desk_metric_source || null,
    deskSourceType: row.desk_source_type || null,
    deskEvidenceQuality: row.desk_evidence_quality != null ? Number(row.desk_evidence_quality) : null,
    deskObservation: row.desk_observation || null,
    deskScoreFinal: row.desk_score_final != null ? Number(row.desk_score_final) : null,
    deskScoreEditorial: row.desk_score_editorial != null ? Number(row.desk_score_editorial) : null,
    deskScoreDigital: row.desk_score_digital != null ? Number(row.desk_score_digital) : null,
    deskScoreReach: row.desk_score_reach != null ? Number(row.desk_score_reach) : null,
    deskScoreEvidence: row.desk_score_evidence != null ? Number(row.desk_score_evidence) : null,
    deskCoverage: row.desk_coverage || null,
    quantitativeRank: row.quantitative_rank != null ? Number(row.quantitative_rank) : null,
    note: (row.metrics && row.metrics.note) || null,
  };
}

function mapVehicleSummary(row, ibge = {}) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.ig_full_name || row.name,
    uf: row.uf,
    state: row.state,
    city: row.city,
    type: row.type,
    phone: row.phone || null,
    email: row.email || null,
    website: row.website || null,
    instagram: row.instagram || null,
    address: row.address || null,
    whatsapp: row.whatsapp || null,
    score: Number(row.score),
    editorialRank: row.editorial_rank != null ? Number(row.editorial_rank) : null,
    quantitativeRank: row.quantitative_rank != null ? Number(row.quantitative_rank) : null,
    deskScoreFinal: row.desk_score_final != null ? Number(row.desk_score_final) : null,
    instagramFollowers: row.instagram_followers != null ? Number(row.instagram_followers) : null,
    igVerified: Boolean(row.ig_verified),
    ...ibge,
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
      search: "/api/search",
      catalog: "/api/catalog",
      region: RADAR_REGION,
      brand: REGION.brand,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    region: RADAR_REGION,
    brand: REGION.brand,
    tag: REGION.tag,
    ufs: REGION.ufs,
    defaultUf: REGION.defaultUf,
    defaultMode: REGION.defaultMode,
    limitPerCity: REGION.limitPerCity,
    footer: REGION.footer,
    dispatchConfigured: Boolean(process.env.N8N_DISPATCH_WEBHOOK),
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

app.get("/api/meta", async (req, res) => {
  const uf = req.query.uf ? String(req.query.uf).toUpperCase() : null;
  const params = [];
  const where = uf ? (params.push(uf), "WHERE uf = $1") : "";
  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(DISTINCT uf)::int AS states,
      COUNT(DISTINCT type)::int AS types,
      COUNT(*) FILTER (WHERE instagram_followers IS NOT NULL)::int AS with_followers,
      COUNT(*) FILTER (WHERE ig_biography IS NOT NULL)::int AS with_bio,
      COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS with_phone,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS with_email,
      COUNT(*) FILTER (WHERE whatsapp IS NOT NULL AND BTRIM(whatsapp) <> '')::int AS with_whatsapp,
      COUNT(*) FILTER (WHERE ig_verified IS TRUE)::int AS verified,
      COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL)::int AS enriched,
      COUNT(*) FILTER (WHERE editorial_rank IS NOT NULL)::int AS editorial,
      COUNT(*) FILTER (WHERE desk_score_final IS NOT NULL)::int AS desk_scored,
      COUNT(*) FILTER (WHERE desk_followers IS NOT NULL)::int AS desk_followers,
      COUNT(*) FILTER (WHERE desk_reach_value IS NOT NULL)::int AS desk_reach,
      COALESCE(MAX(instagram_followers), 0)::bigint AS max_followers,
      MAX(score_version) AS score_version,
      MAX(updated_at) AS updated_at,
      MAX(last_enriched_at) AS last_enriched_at
    FROM vehicles
    ${where}
  `,
    params
  );
  const r = rows[0];
  res.json({
    total: r.total,
    states: r.states,
    types: r.types,
    withFollowers: r.with_followers,
    withBio: r.with_bio,
    withPhone: r.with_phone,
    withEmail: r.with_email,
    withWhatsapp: r.with_whatsapp,
    verified: r.verified,
    enriched: r.enriched,
    editorial: r.editorial,
    deskScored: r.desk_scored,
    deskFollowers: r.desk_followers,
    deskReach: r.desk_reach,
    maxFollowers: Number(r.max_followers),
    scoreVersion: r.score_version,
    scoredAt: r.updated_at,
    lastEnrichedAt: r.last_enriched_at,
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    dynamicRanking: true,
    note:
      uf === "AP"
        ? "Radar Amapá: 16 municípios, até 5 principais por cidade. Desk research web (Atlas da Imprensa + sites oficiais)."
        : r.desk_scored > 0
        ? "Desk research quantitativo aplicado (seguidores/alcance/evidência). Modos Editorial e Quantitativo disponíveis."
        : r.editorial > 0
          ? "Ranking editorial humano incorporado (Top 20 não-TV por estado). Score mescla editorial + Apify."
          : r.with_bio > 0
            ? "Perfil IG enriquecido (bio, posts, engajamento). Top 20 recalcula ao vivo."
            : "Rode enrichment rico para preencher bio, posts e engajamento.",
  });
});

app.get("/api/catalog", (_req, res) => {
  res.json(CATALOG);
});

app.get("/api/search", async (req, res) => {
  const parsed = parseSearchQuery(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const { total, rows, ibgeLookup } = await searchVehicles(pool, parsed);
    const items = rows.map((r, i) => {
      const ibge = attachIbge(r, ibgeLookup);
      const rank = parsed.offset + i + 1;
      if (parsed.fields === "full") return { ...mapVehicle(r, rank), ...ibge };
      return mapVehicleSummary(r, ibge);
    });
    res.json({
      total,
      limit: parsed.limit,
      offset: parsed.offset,
      filters: {
        q: parsed.q || null,
        uf: parsed.ufs,
        type: parsed.types,
        city: parsed.city || null,
        top10: parsed.top10,
        ibgeRank: parsed.ibgeRank,
        hasPhone: parsed.hasPhone,
        hasEmail: parsed.hasEmail,
        hasInstagram: parsed.hasInstagram,
        hasWebsite: parsed.hasWebsite,
        hasContact: parsed.hasContact,
        editorialOnly: parsed.editorialOnly,
        quantitativeOnly: parsed.quantitativeOnly,
        sort: parsed.sort,
        fields: parsed.fields,
      },
      items,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/cities", async (req, res) => {
  const parsed = parseSearchQuery(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const cities = await listCities(pool, parsed);
    res.json({
      total: cities.length,
      top10: parsed.top10,
      uf: parsed.ufs,
      cities,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/facets", async (req, res) => {
  const parsed = parseSearchQuery(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const data = await searchFacets(pool, parsed);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/top20", async (req, res) => {
  const uf = String(req.query.uf || "").toUpperCase();
  const type = String(req.query.type || "");
  if (!uf || !type) return res.status(400).json({ error: "uf and type are required" });
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));

  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     WHERE uf = $1 AND type = $2
     ORDER BY score DESC, editorial_rank ASC NULLS LAST, instagram_followers DESC NULLS LAST, name ASC
     LIMIT $3`,
    [uf, type, limit]
  );
  res.json(rows.map((r, i) => mapVehicle(r, i + 1)));
});

/** Top 20 editorial misto (não-TV) — levantamento humano por estado. */
app.get("/api/top20/editorial", async (req, res) => {
  const uf = String(req.query.uf || "").toUpperCase();
  if (!uf) return res.status(400).json({ error: "uf is required" });

  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     WHERE uf = $1 AND editorial_rank IS NOT NULL
     ORDER BY editorial_rank ASC, score DESC, name ASC
     LIMIT 20`,
    [uf]
  );
  res.json(rows.map((r) => mapVehicle(r, Number(r.editorial_rank))));
});

/** Top 20 quantitativo (desk research enriquecido) por estado. */
app.get("/api/top20/quantitative", async (req, res) => {
  const uf = String(req.query.uf || "").toUpperCase();
  if (!uf) return res.status(400).json({ error: "uf is required" });

  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     WHERE uf = $1 AND quantitative_rank IS NOT NULL
     ORDER BY quantitative_rank ASC, desk_score_final DESC NULLS LAST, score DESC, name ASC
     LIMIT 20`,
    [uf]
  );
  res.json(rows.map((r) => mapVehicle(r, Number(r.quantitative_rank))));
});

/**
 * Top 10 municípios IBGE (pop. 2025) do estado + principais veículos de cada cidade.
 * Query: uf (obrigatório), limitPerCity (default 8 no NE, 5 no Amapá, max 20)
 */
app.get("/api/cities/top10", async (req, res) => {
  const uf = String(req.query.uf || "").toUpperCase();
  if (!uf) return res.status(400).json({ error: "uf is required" });

  const meta = getTopCitiesForUf(uf);
  if (!meta) return res.status(404).json({ error: `UF sem top 10 IBGE: ${uf}` });

  const limitPerCity = Math.min(20, Math.max(1, Number(req.query.limitPerCity) || defaultLimitPerCity(uf)));

  try {
    const { rows: cityCountRows } = await pool.query(
      `SELECT city, COUNT(*)::int AS c FROM vehicles
       WHERE uf = $1 AND city IS NOT NULL AND city <> ''
       GROUP BY city`,
      [uf]
    );
    const inventory = cityCountRows.map((r) => r.city);
    const inventoryCountByCity = new Map(cityCountRows.map((r) => [r.city, r.c]));

    const resolved = meta.cities.map((c) => ({
      ...c,
      matchedCity: resolveCityName(c.name, inventory),
    }));
    const matchedCities = [...new Set(resolved.map((c) => c.matchedCity).filter(Boolean))];

    const vehiclesByCity = new Map();
    if (matchedCities.length) {
      const { rows } = await pool.query(
        `SELECT * FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY city
             ORDER BY
               quantitative_rank ASC NULLS LAST,
               desk_score_final DESC NULLS LAST,
               score DESC,
               instagram_followers DESC NULLS LAST,
               name ASC
           ) AS rn
           FROM vehicles
           WHERE uf = $1 AND city = ANY($2::text[])
         ) ranked
         WHERE rn <= $3
         ORDER BY city, rn`,
        [uf, matchedCities, limitPerCity]
      );
      for (const row of rows) {
        if (!vehiclesByCity.has(row.city)) vehiclesByCity.set(row.city, []);
        vehiclesByCity.get(row.city).push(row);
      }
    }

    const cities = resolved.map((c) => {
      const rows = c.matchedCity ? vehiclesByCity.get(c.matchedCity) || [] : [];
      return {
        rank: c.rank,
        name: c.name,
        matchedCity: c.matchedCity,
        population: c.population,
        inventoryCount: c.matchedCity ? inventoryCountByCity.get(c.matchedCity) || 0 : 0,
        vehicles: rows.map((r, i) => mapVehicle(r, i + 1)),
      };
    });

    res.json({
      uf: meta.uf,
      state: meta.state,
      source: meta.source,
      referenceDate: meta.referenceDate,
      tableUpdatedAt: meta.tableUpdatedAt,
      note: meta.note,
      limitPerCity,
      cities,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
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

app.get("/api/contacts/coverage", async (req, res) => {
  const uf = req.query.uf ? String(req.query.uf).toUpperCase() : null;
  const type = req.query.type ? String(req.query.type) : null;
  const params = [];
  const clauses = [];
  if (uf) {
    params.push(uf);
    clauses.push(`uf = $${params.length}`);
  }
  if (type) {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }

  // Cobertura do Top 20 por UF×tipo (mesma ordem do ranking)
  const { rows: sets } = await pool.query(
    `
    WITH ranked AS (
      SELECT uf, type, email, phone,
             ROW_NUMBER() OVER (
               PARTITION BY uf, type
               ORDER BY score DESC, instagram_followers DESC NULLS LAST, name ASC
             ) AS rn
      FROM vehicles
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    )
    SELECT uf, type,
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE phone IS NOT NULL)::int AS with_phone,
      COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
      COUNT(*) FILTER (WHERE phone IS NOT NULL OR email IS NOT NULL)::int AS with_any
    FROM ranked
    WHERE rn <= 20
    GROUP BY uf, type
    ORDER BY uf, type
    `,
    params
  );

  const total = sets.reduce((a, r) => a + r.n, 0);
  const withAny = sets.reduce((a, r) => a + r.with_any, 0);
  res.json({
    targetPct: 70,
    overallPct: total ? Math.round((1000 * withAny) / total) / 10 : 0,
    total,
    withAny,
    placesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    sets: sets.map((r) => ({
      ...r,
      pct: r.n ? Math.round((1000 * r.with_any) / r.n) / 10 : 0,
    })),
  });
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

    if (!uf) return res.status(400).json({ error: "uf é obrigatório" });
    if (REGION.ufs.length && !REGION.ufs.includes(uf)) {
      return res.status(400).json({
        error: `UF fora desta instância (${RADAR_REGION}). Use: ${REGION.ufs.join(", ")}`,
      });
    }
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
        `SELECT id, name, phone, whatsapp, email, score, instagram_followers, type
         FROM vehicles WHERE uf = $1 AND id = ANY($2::text[])
         ORDER BY editorial_rank ASC NULLS LAST, score DESC NULLS LAST`,
        [uf, ids]
      );
      rows = r;
    } else {
      if (!type) return res.status(400).json({ error: "uf e tipo são obrigatórios" });
      const { rows: r } = await pool.query(
        `SELECT id, name, phone, whatsapp, email, score, instagram_followers, type
         FROM vehicles WHERE uf = $1 AND type = $2
         ORDER BY score DESC, instagram_followers DESC NULLS LAST, name ASC
         LIMIT 20`,
        [uf, type]
      );
      rows = r;
    }

    const destinos = rows.map((v, i) => {
      const wa = cleanPhone(v.whatsapp) || cleanPhone(v.phone);
      return {
        id: v.id,
        veiculo: v.name,
        phone: wa,
        whatsapp: cleanPhone(v.whatsapp),
        email: v.email || null,
        rank: i + 1,
        followers: v.instagram_followers != null ? Number(v.instagram_followers) : null,
      };
    });

    const reachable = destinos.filter((d) => {
      if (canal === "whatsapp") return Boolean(d.phone);
      if (canal === "email") return Boolean(d.email);
      return Boolean(d.phone || d.email);
    });

    const payload = {
      uf,
      tipo: type || (RADAR_REGION === "AP" ? "Amapá" : type),
      regiao: RADAR_REGION,
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
await applyEditorialRanking();
await applyDeskScore();
await applyAmapaSeed();

// Recalcula scores com a fórmula atual (sem custo Apify)
{
  const { computeScore } = await import("./score.js");
  const { rows } = await pool.query(
    `SELECT id, completeness, email, phone, instagram, website, website_alive, city, type,
            instagram_followers, ig_engagement_rate, ig_avg_likes, ig_verified, sources,
            editorial_rank, editorial_band, editorial_confidence, ig_biography,
            desk_followers, desk_score_final, desk_coverage
     FROM vehicles
     WHERE instagram_followers IS NOT NULL OR editorial_rank IS NOT NULL OR desk_score_final IS NOT NULL`
  );
  for (const row of rows) {
    const scored = computeScore(row);
    await pool.query(
      `UPDATE vehicles SET score = $2, confidence = $3, score_version = $4, updated_at = NOW() WHERE id = $1`,
      [row.id, scored.score, scored.confidence, scored.scoreVersion]
    );
  }
  console.log(`Rescored ${rows.length} enriched/editorial/desk vehicles`);
}

app.listen(PORT, () => {
  console.log(`Radar API listening on :${PORT} · region=${RADAR_REGION} · ${REGION.brand}`);
});
