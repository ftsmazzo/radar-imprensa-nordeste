import { computeScore, instagramHandle } from "./score.js";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const IG_ACTOR = process.env.APIFY_IG_ACTOR || "apify/instagram-profile-scraper";
const CONTACT_ACTOR = process.env.APIFY_CONTACT_ACTOR || "";
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const DEFAULT_BATCH = Number(process.env.ENRICH_BATCH_SIZE || 25);

const jobs = new Map();

const JUNK_EMAIL =
  /noreply|no-reply|donotreply|example\.|sentry\.|wixpress|cloudflare|schema\.org|w3\.org|github\.com|google(mail)?\.com$/i;

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

export function extractEmailsFromText(text) {
  if (!text) return [];
  const found = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const uniq = [...new Set(found.map((e) => e.toLowerCase()))];
  return uniq.filter((e) => !JUNK_EMAIL.test(e) && !e.endsWith(".png") && !e.endsWith(".jpg"));
}

export function extractPhonesFromText(text) {
  if (!text) return [];
  const found = String(text).match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s.]?\d{4}/g) || [];
  const cleaned = [];
  for (const raw of found) {
    let d = raw.replace(/\D/g, "");
    if (d.length < 10) continue;
    if (d.startsWith("55") && d.length >= 12) {
      cleaned.push(d);
      continue;
    }
    if (d.length >= 10 && d.length <= 11) cleaned.push(`55${d}`);
  }
  return [...new Set(cleaned)];
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

async function fetchHtml(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; RadarImprensaBot/1.0; +https://radar-imprensa-web.kxryyk.easypanel.host)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype && !/html|text|xml/i.test(ctype)) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function contactPaths(baseUrl) {
  const paths = ["", "/contato", "/contact", "/fale-conosco", "/faleconosco", "/about", "/sobre"];
  try {
    const u = new URL(baseUrl);
    return paths.map((p) => {
      if (!p) return `${u.origin}/`;
      return new URL(p, u.origin).toString();
    });
  } catch {
    return [baseUrl];
  }
}

/** Scrape leve do site (home + páginas de contato) */
export async function scrapeWebsiteContacts(website) {
  if (!website) return { emails: [], phones: [], pages: 0, alive: null };
  const urls = contactPaths(website.startsWith("http") ? website : `https://${website}`);
  const emails = new Set();
  const phones = new Set();
  let pages = 0;

  for (const url of urls) {
    const html = await fetchHtml(url);
    if (!html) continue;
    pages += 1;
    for (const e of extractEmailsFromText(html)) emails.add(e);
    for (const p of extractPhonesFromText(html)) phones.add(p);
    if (emails.size && phones.size) break;
  }

  return {
    emails: [...emails],
    phones: [...phones],
    pages,
    alive: pages > 0,
  };
}

/** Google Places API (New) — Text Search */
export async function lookupGooglePlaces(row) {
  if (!GOOGLE_PLACES_API_KEY) return null;
  const query = `${row.name} ${row.type || ""} ${row.city || ""} ${row.state || row.uf || ""} Brasil`.trim();
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "pt-BR",
      regionCode: "BR",
      maxResultCount: 3,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const place = json?.places?.[0];
  if (!place) return null;
  const phoneRaw = place.internationalPhoneNumber || place.nationalPhoneNumber || null;
  const phones = extractPhonesFromText(phoneRaw || "");
  return {
    phone: phones[0] || null,
    website: place.websiteUri || null,
    placeName: place.displayName?.text || null,
  };
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

async function runApifyContactActor(urls) {
  if (!APIFY_TOKEN || !CONTACT_ACTOR || !urls.length) return [];
  const actorId = encodeURIComponent(CONTACT_ACTOR);
  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=300`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      urls,
      startUrls: urls.map((u) => ({ url: u })),
      maxPages: 4,
      followLinks: true,
      extractEmails: true,
      extractPhones: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify contact error ${res.status}: ${text.slice(0, 300)}`);
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

  const bio = String(item.biography ?? item.bio ?? "");
  const emailsFromBio = extractEmailsFromText(bio);
  const phonesFromBio = extractPhonesFromText(bio);

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

function contactsFromStoredBio(row) {
  const bio = row.ig_biography || "";
  const profile = row.ig_profile || {};
  const emails = [
    ...extractEmailsFromText(bio),
    ...(Array.isArray(profile.emailsFromBio) ? profile.emailsFromBio : []),
  ];
  const phones = [
    ...extractPhonesFromText(bio),
    ...(Array.isArray(profile.phonesFromBio) ? profile.phonesFromBio.map(String) : []),
  ];
  return {
    email: emails.find(Boolean) || null,
    phone: phones.find(Boolean) || null,
  };
}

async function enrichContactsForRow(pool, row) {
  const patch = { source: "contacts" };
  let found = false;

  if (!row.email || !row.phone) {
    const fromBio = contactsFromStoredBio(row);
    if (!row.email && fromBio.email) {
      patch.email = fromBio.email;
      found = true;
    }
    if (!row.phone && fromBio.phone) {
      patch.phone = fromBio.phone;
      found = true;
    }
  }

  if ((!row.email && !patch.email) || (!row.phone && !patch.phone)) {
    if (row.website) {
      const scraped = await scrapeWebsiteContacts(row.website);
      if (scraped.alive != null) patch.website_alive = scraped.alive;
      if (!row.email && !patch.email && scraped.emails[0]) {
        patch.email = scraped.emails[0];
        found = true;
      }
      if (!row.phone && !patch.phone && scraped.phones[0]) {
        patch.phone = scraped.phones[0];
        found = true;
      }
    }
  }

  if ((!row.phone && !patch.phone) || (!row.website && !patch.website)) {
    try {
      const places = await lookupGooglePlaces(row);
      if (places) {
        if (!row.phone && !patch.phone && places.phone) {
          patch.phone = places.phone;
          found = true;
        }
        if (!row.website && places.website) {
          patch.website = places.website;
          found = true;
        }
        patch.source = "contacts+places";
      }
    } catch {
      /* Places opcional */
    }
  }

  if (found || patch.website_alive != null) {
    await updateVehicle(pool, row, patch);
    return true;
  }
  return false;
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
  const website = patch.website || row.website || null;

  const merged = {
    ...row,
    email,
    phone,
    website,
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
      website = COALESCE($4, website),
      website_alive = COALESCE($5, website_alive),
      instagram_followers = COALESCE($6, instagram_followers),
      ig_full_name = COALESCE($7, ig_full_name),
      ig_biography = COALESCE($8, ig_biography),
      ig_following = COALESCE($9, ig_following),
      ig_posts_count = COALESCE($10, ig_posts_count),
      ig_verified = COALESCE($11, ig_verified),
      ig_is_business = COALESCE($12, ig_is_business),
      ig_category = COALESCE($13, ig_category),
      ig_profile_pic = COALESCE($14, ig_profile_pic),
      ig_external_url = COALESCE($15, ig_external_url),
      ig_avg_likes = COALESCE($16, ig_avg_likes),
      ig_avg_comments = COALESCE($17, ig_avg_comments),
      ig_engagement_rate = COALESCE($18, ig_engagement_rate),
      ig_profile = COALESCE(ig_profile, '{}'::jsonb) || COALESCE($19::jsonb, '{}'::jsonb),
      last_enriched_at = NOW(),
      score = $20,
      confidence = $21,
      score_version = $22,
      metrics = COALESCE(metrics, '{}'::jsonb) || $23::jsonb,
      updated_at = NOW()
    WHERE id = $1`,
    [
      row.id,
      email,
      phone,
      website,
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
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const uf = options.uf ? String(options.uf).toUpperCase() : null;
  const type = options.type ? String(options.type) : null;
  const limit = Math.min(Number(options.limit || DEFAULT_BATCH), 100);
  const mode = options.mode || "full";
  const force = Boolean(options.force);

  const params = [];
  const clauses = [];

  if (mode === "contacts") {
    clauses.push("(email IS NULL OR phone IS NULL)");
  } else if (mode === "instagram" || mode === "full") {
    clauses.push("instagram IS NOT NULL AND instagram <> ''");
  }

  if (uf) {
    params.push(uf);
    clauses.push(`uf = $${params.length}`);
  }
  if (type) {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }

  if (!force && mode !== "contacts") {
    clauses.push(`(
      ig_biography IS NULL
      OR instagram_followers IS NULL
      OR last_enriched_at IS NULL
      OR last_enriched_at < NOW() - INTERVAL '3 days'
    )`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit);

  const order =
    mode === "contacts"
      ? `ORDER BY score DESC, instagram_followers DESC NULLS LAST`
      : `ORDER BY
       CASE WHEN ig_biography IS NULL THEN 0 ELSE 1 END,
       CASE WHEN instagram_followers IS NULL THEN 0 ELSE 1 END,
       score DESC`;

  const { rows } = await pool.query(
    `SELECT * FROM vehicles ${where} ${order} LIMIT $${params.length}`,
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
    placesConfigured: Boolean(GOOGLE_PLACES_API_KEY),
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      if (mode === "contacts") {
        for (const row of rows) {
          try {
            const ok = await enrichContactsForRow(pool, row);
            if (ok) job.updated += 1;
          } catch (err) {
            job.errors.push({ id: row.id, error: String(err.message || err) });
          }
          job.done += 1;
        }

        if (CONTACT_ACTOR && APIFY_TOKEN) {
          const stillMissing = rows.filter((r) => !r.email || !r.phone).slice(0, 15);
          const withSite = stillMissing.filter((r) => r.website);
          if (withSite.length) {
            try {
              const items = await runApifyContactActor(withSite.map((r) => r.website));
              for (const item of items || []) {
                const site = String(item.url || item.domain || item.website || "");
                const match = withSite.find((r) => {
                  if (!r.website || !site) return false;
                  try {
                    const host = new URL(r.website.startsWith("http") ? r.website : `https://${r.website}`)
                      .hostname.replace(/^www\./, "");
                    return site.includes(host);
                  } catch {
                    return false;
                  }
                });
                if (!match) continue;
                const emails = item.emails || item.email || [];
                const phones = item.phones || item.phone || [];
                const emailList = Array.isArray(emails) ? emails : [emails];
                const phoneList = Array.isArray(phones) ? phones : [phones];
                await updateVehicle(pool, match, {
                  email: emailList[0] || null,
                  phone: extractPhonesFromText(String(phoneList[0] || ""))[0] || null,
                  source: "apify-contact",
                });
                job.updated += 1;
              }
            } catch (err) {
              job.errors.push({ error: String(err.message || err) });
            }
          }
        }
      }

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
