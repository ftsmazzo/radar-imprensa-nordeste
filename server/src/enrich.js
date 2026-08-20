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
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN não configurado no serviço");
  if (!usernames.length) return [];

  const actorId = encodeURIComponent(IG_ACTOR);
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=300`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      usernames,
      resultsLimit: Math.max(usernames.length * 3, 12),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error ${res.status}: ${text.slice(0, 400)}`);
  }

  return res.json();
}

function pickUsername(item) {
  return String(item?.username || item?.userName || item?.ownerUsername || "")
    .replace(/^@/, "")
    .toLowerCase();
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(nums) {
  const list = nums.filter((n) => n != null && Number.isFinite(n));
  if (!list.length) return null;
  return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
}

/** Extrai perfil rico do item bruto do Apify */
export function parseApifyProfile(item) {
  if (!item || typeof item !== "object") return null;

  const followers =
    num(item.followersCount) ??
    num(item.followers) ??
    num(item?.edge_followed_by?.count) ??
    num(item?.profile?.followersCount);

  const following =
    num(item.followsCount) ??
    num(item.followingCount) ??
    num(item.following) ??
    num(item?.edge_follow?.count);

  const postsCount =
    num(item.postsCount) ??
    num(item.mediaCount) ??
    num(item.post_count) ??
    num(item?.edge_owner_to_timeline_media?.count);

  const latest = item.latestPosts || item.posts || item.latestIgtvVideos || [];
  const recent = Array.isArray(latest)
    ? latest.slice(0, 12).map((p) => ({
        caption: String(p.caption ?? p.text ?? "").slice(0, 280),
        likes: num(p.likesCount ?? p.likes) ?? 0,
        comments: num(p.commentsCount ?? p.comments) ?? 0,
        type: String(p.type ?? p.productType ?? "post"),
        url: p.url ? String(p.url) : null,
        timestamp: p.timestamp ? String(p.timestamp) : null,
        displayUrl: p.displayUrl || p.imageUrl || null,
      }))
    : [];

  const avgLikes = avg(recent.map((p) => p.likes));
  const avgComments = avg(recent.map((p) => p.comments));
  const engagementRate =
    followers && avgLikes != null
      ? Math.round(((avgLikes + (avgComments || 0)) / followers) * 10000) / 100
      : null;

  const externalUrl =
    item.externalUrl ||
    item.external_url ||
    item.bioLink ||
    (Array.isArray(item.bioLinks) && item.bioLinks[0]?.url) ||
    null;

  const emailsFromBio = [];
  const phonesFromBio = [];
  const bio = String(item.biography ?? item.bio ?? "");
  const emailMatch = bio.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (emailMatch) emailsFromBio.push(...emailMatch);
  const phoneMatch = bio.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/g);
  if (phoneMatch) phonesFromBio.push(...phoneMatch);

  return {
    username: pickUsername(item) || null,
    fullName: item.fullName || item.full_name || null,
    biography: bio || null,
    followers,
    following,
    postsCount,
    verified: Boolean(item.verified || item.isVerified),
    isBusinessAccount: Boolean(item.isBusinessAccount || item.is_business_account),
    isProfessionalAccount: Boolean(item.isProfessionalAccount),
    businessCategory: item.businessCategoryName || item.categoryName || item.category || null,
    profilePicUrl:
      item.profilePicUrlHD ||
      item.profilePicUrl ||
      item.profile_pic_url_hd ||
      item.profile_pic_url ||
      null,
    externalUrl: externalUrl ? String(externalUrl) : null,
    igtvVideoCount: num(item.igtvVideoCount),
    highlightReelCount: num(item.highlightReelCount),
    avgLikes,
    avgComments,
    engagementRate,
    recentPosts: recent,
    emailsFromBio,
    phonesFromBio,
    rawKeys: Object.keys(item).slice(0, 40),
  };
}

async function updateVehicle(pool, row, patch) {
  const profile = patch.profile || null;
  const followers = profile?.followers ?? patch.instagram_followers ?? row.instagram_followers;

  const email =
    patch.email ||
    row.email ||
    profile?.emailsFromBio?.[0] ||
    null;
  const phone =
    patch.phone ||
    row.phone ||
    profile?.phonesFromBio?.[0] ||
    null;

  const merged = {
    ...row,
    email,
    phone,
    website_alive: patch.website_alive ?? row.website_alive,
    instagram_followers: followers,
    ig_following: profile?.following ?? row.ig_following,
    ig_posts_count: profile?.postsCount ?? row.ig_posts_count,
    ig_avg_likes: profile?.avgLikes ?? row.ig_avg_likes,
    ig_engagement_rate: profile?.engagementRate ?? row.ig_engagement_rate,
    last_enriched_at: new Date().toISOString(),
  };
  const scored = computeScore(merged);

  await pool.query(
    `UPDATE vehicles SET
      email = COALESCE($2, email),
      phone = COALESCE($3, phone),
      website_alive = COALESCE($4, website_alive),
      instagram_followers = COALESCE($5, instagram_followers),
      ig_full_name = COALESCE($6, ig_full_name),
      ig_biography = COALESCE($7, ig_biography),
      ig_following = COALESCE($8, ig_following),
      ig_posts_count = COALESCE($9, ig_posts_count),
      ig_verified = COALESCE($10, ig_verified),
      ig_is_business = COALESCE($11, ig_is_business),
      ig_category = COALESCE($12, ig_category),
      ig_profile_pic = COALESCE($13, ig_profile_pic),
      ig_external_url = COALESCE($14, ig_external_url),
      ig_avg_likes = COALESCE($15, ig_avg_likes),
      ig_avg_comments = COALESCE($16, ig_avg_comments),
      ig_engagement_rate = COALESCE($17, ig_engagement_rate),
      ig_profile = COALESCE(ig_profile, '{}'::jsonb) || COALESCE($18::jsonb, '{}'::jsonb),
      last_enriched_at = NOW(),
      score = $19,
      confidence = $20,
      score_version = $21,
      metrics = COALESCE(metrics, '{}'::jsonb) || $22::jsonb,
      updated_at = NOW()
    WHERE id = $1`,
    [
      row.id,
      email,
      phone,
      patch.website_alive ?? null,
      followers,
      profile?.fullName ?? null,
      profile?.biography ?? null,
      profile?.following ?? null,
      profile?.postsCount ?? null,
      profile ? profile.verified : null,
      profile ? profile.isBusinessAccount : null,
      profile?.businessCategory ?? null,
      profile?.profilePicUrl ?? null,
      profile?.externalUrl ?? null,
      profile?.avgLikes ?? null,
      profile?.avgComments ?? null,
      profile?.engagementRate ?? null,
      profile ? JSON.stringify(profile) : null,
      scored.score,
      scored.confidence,
      scored.scoreVersion,
      JSON.stringify({
        followers,
        following: profile?.following ?? null,
        postsCount: profile?.postsCount ?? null,
        avgLikes: profile?.avgLikes ?? null,
        engagementRate: profile?.engagementRate ?? null,
        websiteAlive: patch.website_alive ?? row.website_alive,
        enrichedAt: new Date().toISOString(),
        source: patch.source || "apify",
      }),
    ]
  );
}

export async function startEnrichment(pool, options = {}) {
  const jobId = `job_${Date.now()}`;
  const uf = options.uf ? String(options.uf).toUpperCase() : null;
  const type = options.type ? String(options.type) : null;
  const limit = Math.min(Number(options.limit || DEFAULT_BATCH), 100);
  const mode = options.mode || "full";
  const force = Boolean(options.force);

  const params = [];
  let where = "WHERE instagram IS NOT NULL AND instagram <> ''";
  if (uf) {
    params.push(uf);
    where += ` AND uf = $${params.length}`;
  }
  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }

  if (!force) {
    // incomplete profile OR stale
    where += ` AND (
      ig_biography IS NULL
      OR instagram_followers IS NULL
      OR last_enriched_at IS NULL
      OR last_enriched_at < NOW() - INTERVAL '3 days'
    )`;
  }

  params.push(limit);
  const { rows } = await pool.query(
    `SELECT * FROM vehicles
     ${where}
     ORDER BY
       CASE WHEN ig_biography IS NULL THEN 0 ELSE 1 END,
       CASE WHEN instagram_followers IS NULL THEN 0 ELSE 1 END,
       score DESC
     LIMIT $${params.length}`,
    params
  );

  const job = {
    id: jobId,
    status: "running",
    mode,
    uf,
    type,
    total: rows.length,
    done: 0,
    updated: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    apifyConfigured: Boolean(APIFY_TOKEN),
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      if (mode === "full" || mode === "website") {
        for (const row of rows) {
          try {
            const alive = await checkWebsiteAlive(row.website);
            await updateVehicle(pool, row, { website_alive: alive, source: "http-check" });
            job.updated += 1;
          } catch (err) {
            job.errors.push({ id: row.id, error: String(err.message || err) });
          }
          job.done += 1;
        }
      }

      if ((mode === "full" || mode === "instagram") && APIFY_TOKEN) {
        const withHandle = rows
          .map((r) => ({ row: r, handle: instagramHandle(r.instagram) }))
          .filter((x) => x.handle);

        const chunkSize = 8;
        for (let i = 0; i < withHandle.length; i += chunkSize) {
          const chunk = withHandle.slice(i, i + chunkSize);
          const usernames = chunk.map((c) => c.handle);
          try {
            const items = await runApifyProfiles(usernames);
            const byUser = new Map();
            for (const item of items) {
              const profile = parseApifyProfile(item);
              if (profile?.username) byUser.set(profile.username, profile);
            }
            for (const { row, handle } of chunk) {
              const profile = byUser.get(handle.toLowerCase());
              if (profile && (profile.followers != null || profile.biography || profile.fullName)) {
                await updateVehicle(pool, row, {
                  website_alive: row.website_alive,
                  profile,
                  source: "apify-instagram",
                });
                job.updated += 1;
              } else {
                job.errors.push({ id: row.id, handle, error: "perfil incompleto no retorno Apify" });
              }
            }
          } catch (err) {
            job.errors.push({ chunk: usernames, error: String(err.message || err) });
          }
        }
      } else if ((mode === "full" || mode === "instagram") && !APIFY_TOKEN) {
        job.errors.push({ error: "APIFY_TOKEN ausente" });
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
