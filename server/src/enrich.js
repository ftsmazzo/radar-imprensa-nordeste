import { computeScore, instagramHandle } from "./score.js";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const IG_ACTOR = process.env.APIFY_IG_ACTOR || "apify/instagram-profile-scraper";
const DEFAULT_BATCH = Number(process.env.ENRICH_BATCH_SIZE || 25);

const jobs = new Map();

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

async function checkWebsiteAlive(url) {
  if (!url) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "RadarImprensaBot/1.0" },
    });
    return res.ok || (res.status >= 200 && res.status < 500);
  } catch {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "RadarImprensaBot/1.0" },
      });
      return res.ok || (res.status >= 200 && res.status < 500);
    } catch {
      return false;
    }
  } finally {
    clearTimeout(t);
  }
}

async function runApifyProfiles(usernames) {
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN não configurado no serviço");
  }
  if (!usernames.length) return [];

  const actorId = encodeURIComponent(IG_ACTOR);
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=300`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      usernames,
      resultsLimit: usernames.length,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error ${res.status}: ${text.slice(0, 400)}`);
  }

  return res.json();
}

function pickFollowers(item) {
  return (
    item?.followersCount ??
    item?.followers ??
    item?.edge_followed_by?.count ??
    item?.profile?.followersCount ??
    null
  );
}

function pickUsername(item) {
  return (item?.username || item?.userName || item?.ownerUsername || "").replace(/^@/, "").toLowerCase();
}

async function updateVehicle(pool, row, patch) {
  const merged = {
    ...row,
    email: patch.email ?? row.email,
    phone: patch.phone ?? row.phone,
    website_alive: patch.website_alive ?? row.website_alive,
    instagram_followers: patch.instagram_followers ?? row.instagram_followers,
    last_enriched_at: new Date().toISOString(),
  };
  const scored = computeScore(merged);

  await pool.query(
    `UPDATE vehicles SET
      email = COALESCE($2, email),
      phone = COALESCE($3, phone),
      website_alive = $4,
      instagram_followers = $5,
      last_enriched_at = NOW(),
      score = $6,
      confidence = $7,
      score_version = $8,
      metrics = COALESCE(metrics, '{}'::jsonb) || $9::jsonb,
      updated_at = NOW()
    WHERE id = $1`,
    [
      row.id,
      patch.email ?? null,
      patch.phone ?? null,
      merged.website_alive,
      merged.instagram_followers,
      scored.score,
      scored.confidence,
      scored.scoreVersion,
      JSON.stringify({
        followers: merged.instagram_followers,
        websiteAlive: merged.website_alive,
        enrichedAt: merged.last_enriched_at,
        source: patch.source || "apify",
      }),
    ]
  );
}

export async function startEnrichment(pool, options = {}) {
  const jobId = `job_${Date.now()}`;
  const uf = options.uf ? String(options.uf).toUpperCase() : null;
  const limit = Math.min(Number(options.limit || DEFAULT_BATCH), 100);
  const mode = options.mode || "full"; // full | website | instagram

  const params = [];
  let where = "WHERE instagram IS NOT NULL";
  if (uf) {
    params.push(uf);
    where += ` AND uf = $${params.length}`;
  }
  // prioritize never enriched / stale
  where += ` AND (last_enriched_at IS NULL OR last_enriched_at < NOW() - INTERVAL '7 days')`;

  params.push(limit);
  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     ${where}
     ORDER BY
       CASE WHEN last_enriched_at IS NULL THEN 0 ELSE 1 END,
       score DESC
     LIMIT $${params.length}`,
    params
  );

  const job = {
    id: jobId,
    status: "running",
    mode,
    uf,
    total: rows.length,
    done: 0,
    updated: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    apifyConfigured: Boolean(APIFY_TOKEN),
  };
  jobs.set(jobId, job);

  // async run
  (async () => {
    try {
      // 1) website alive (no Apify cost)
      if (mode === "full" || mode === "website") {
        for (const row of rows) {
          try {
            const alive = await checkWebsiteAlive(row.website);
            await updateVehicle(pool, row, {
              website_alive: alive,
              source: "http-check",
            });
            job.updated += 1;
          } catch (err) {
            job.errors.push({ id: row.id, error: String(err.message || err) });
          }
          job.done += 1;
        }
      }

      // 2) Instagram via Apify
      if ((mode === "full" || mode === "instagram") && APIFY_TOKEN) {
        const withHandle = rows
          .map((r) => ({ row: r, handle: instagramHandle(r.instagram) }))
          .filter((x) => x.handle);

        const chunkSize = 10;
        for (let i = 0; i < withHandle.length; i += chunkSize) {
          const chunk = withHandle.slice(i, i + chunkSize);
          const usernames = chunk.map((c) => c.handle);
          try {
            const items = await runApifyProfiles(usernames);
            const byUser = new Map();
            for (const item of items) {
              const u = pickUsername(item);
              if (u) byUser.set(u, item);
            }
            for (const { row, handle } of chunk) {
              const item = byUser.get(handle.toLowerCase());
              const followers = item ? pickFollowers(item) : null;
              if (followers != null) {
                await updateVehicle(pool, row, {
                  website_alive: row.website_alive,
                  instagram_followers: Number(followers),
                  source: "apify-instagram",
                });
                job.updated += 1;
              } else {
                job.errors.push({ id: row.id, handle, error: "sem followers no retorno" });
              }
            }
          } catch (err) {
            job.errors.push({ chunk: usernames, error: String(err.message || err) });
          }
        }
      } else if ((mode === "full" || mode === "instagram") && !APIFY_TOKEN) {
        job.errors.push({ error: "APIFY_TOKEN ausente — só website check rodou" });
      }

      job.status = "done";
      job.finishedAt = new Date().toISOString();
    } catch (err) {
      job.status = "error";
      job.finishedAt = new Date().toISOString();
      job.errors.push({ error: String(err.message || err) });
    }
  })();

  return job;
}
