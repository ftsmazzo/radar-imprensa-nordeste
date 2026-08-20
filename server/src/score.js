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

export function followersScore(followers) {
  if (followers == null || Number.isNaN(Number(followers))) return 0.35;
  const n = Math.max(0, Number(followers));
  if (n <= 0) return 0.1;
  return clamp01(Math.log10(n + 1) / 6);
}

export function engagementScore(rate, avgLikes) {
  if (rate != null && Number.isFinite(Number(rate))) {
    // piso 0.25 para não punir páginas grandes (eng. % naturalmente baixo)
    return clamp01(Math.max(0.25, Number(rate) / 5));
  }
  if (avgLikes != null && Number.isFinite(Number(avgLikes))) {
    return clamp01(Math.max(0.25, Math.log10(Number(avgLikes) + 1) / 5));
  }
  return 0.45; // neutro quando ainda não há amostra de posts
}

export function computeScore(v) {
  const completeness = COMPLETENESS[v.completeness] ?? 0.3;
  const contact =
    (v.email ? 0.4 : 0) + (v.phone ? 0.35 : 0) + (v.instagram ? 0.25 : 0);
  const website = v.website ? (v.website_alive === false ? 0.2 : 1) : 0;
  const capital = CAPITALS.has(v.city) ? 1 : 0.45;
  const typeBoost =
    v.type === "TV" ? 1 : v.type === "Jornal" ? 0.9 : v.type === "Rádio" ? 0.75 : 0.65;
  const reach = followersScore(v.instagram_followers ?? v.followers);
  const engagement = engagementScore(v.ig_engagement_rate, v.ig_avg_likes);
  const verifiedBoost = v.ig_verified ? 1 : 0.5;

  const hasRealMetric = v.instagram_followers != null;

  // Alcance manda; engajamento é ajuste fino (não derruba veículo grande)
  const score = hasRealMetric
    ? reach * 0.55 +
      engagement * 0.1 +
      clamp01(contact) * 0.08 +
      website * 0.05 +
      capital * 0.07 +
      typeBoost * 0.07 +
      verifiedBoost * 0.08
    : completeness * 0.2 +
      clamp01(contact) * 0.2 +
      website * 0.15 +
      capital * 0.2 +
      typeBoost * 0.25;

  const confidence = hasRealMetric
    ? v.ig_biography
      ? "alta"
      : "média-alta"
    : v.completeness === "complete"
      ? "média"
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
