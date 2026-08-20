const CAPITALS = new Set([
  "Maceió",
  "Salvador",
  "Fortaleza",
  "São Luís",
  "João Pessoa",
  "Recife",
  "Teresina",
  "Natal",
  "Aracaju",
]);

const COMPLETENESS = { minimal: 0.35, partial: 0.7, complete: 1 };

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/** Followers → 0..1 with soft log scale (10k ≈ 0.5, 1M ≈ 1) */
export function followersScore(followers) {
  if (followers == null || Number.isNaN(Number(followers))) return 0.5; // neutral until enriched
  const n = Math.max(0, Number(followers));
  if (n <= 0) return 0.15;
  return clamp01(Math.log10(n + 1) / 6);
}

export function computeScore(v) {
  const completeness = COMPLETENESS[v.completeness] ?? 0.3;
  const contact =
    (v.email ? 0.45 : 0) + (v.phone ? 0.35 : 0) + (v.instagram ? 0.2 : 0);
  const website = v.website ? (v.website_alive === false ? 0.2 : 1) : 0;
  const capital = CAPITALS.has(v.city) ? 1 : 0.45;
  const typeBoost =
    v.type === "TV" ? 1 : v.type === "Jornal" ? 0.9 : v.type === "Rádio" ? 0.75 : 0.65;
  const sourceTrust = Array.isArray(v.sources) && v.sources.length ? 0.85 : 0.4;
  const reach = followersScore(v.instagram_followers ?? v.followers);

  const score =
    completeness * 0.12 +
    clamp01(contact) * 0.12 +
    website * 0.08 +
    capital * 0.12 +
    typeBoost * 0.12 +
    sourceTrust * 0.08 +
    reach * 0.36;

  const hasRealMetric = v.instagram_followers != null;
  const confidence = hasRealMetric
    ? "alta"
    : v.completeness === "complete"
      ? "média"
      : v.completeness === "partial"
        ? "baixa-média"
        : "baixa";

  return {
    score: Math.round(score * 1000) / 1000,
    confidence,
    scoreVersion: hasRealMetric ? "v1-apify" : "v0-provisional",
  };
}

export function instagramHandle(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://instagram.com/${url}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const handle = parts[0].replace(/^@/, "");
    if (["p", "reel", "stories", "explore"].includes(handle.toLowerCase())) return null;
    return handle;
  } catch {
    return null;
  }
}
