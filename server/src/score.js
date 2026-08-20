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

const EDITORIAL_BAND = { A: 1, "A/B": 0.85, B: 0.7, "B/C": 0.55 };

/** Sinal 0–1 a partir do Top 20 editorial humano (rank 1 = mais forte). */
export function editorialSignal(rank, band) {
  if (rank == null || Number.isNaN(Number(rank))) return null;
  const fromRank = clamp01((21 - Number(rank)) / 20);
  const bandBoost = EDITORIAL_BAND[band] ?? 0.6;
  return clamp01(fromRank * 0.7 + bandBoost * 0.3);
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
  const editorial = editorialSignal(v.editorial_rank ?? v.editorialRank, v.editorial_band ?? v.editorialBand);

  const hasRealMetric = v.instagram_followers != null;
  const hasEditorial = editorial != null;

  // Levantamento humano: tradição/marca + alcance estadual + capacidade de pautar.
  // Quando há rank editorial, ele pesa forte; métricas Apify ajustam sem sobrescrever.
  let score;
  if (hasEditorial && hasRealMetric) {
    score =
      editorial * 0.42 +
      reach * 0.28 +
      engagement * 0.08 +
      clamp01(contact) * 0.07 +
      website * 0.05 +
      capital * 0.05 +
      verifiedBoost * 0.05;
  } else if (hasEditorial) {
    score =
      editorial * 0.55 +
      completeness * 0.1 +
      clamp01(contact) * 0.1 +
      website * 0.08 +
      capital * 0.1 +
      typeBoost * 0.07;
  } else if (hasRealMetric) {
    score =
      reach * 0.55 +
      engagement * 0.1 +
      clamp01(contact) * 0.08 +
      website * 0.05 +
      capital * 0.07 +
      typeBoost * 0.07 +
      verifiedBoost * 0.08;
  } else {
    score =
      completeness * 0.2 +
      clamp01(contact) * 0.2 +
      website * 0.15 +
      capital * 0.2 +
      typeBoost * 0.25;
  }

  const confidence = hasEditorial
    ? String(v.editorial_confidence || v.editorialConfidence || "alta").toLowerCase()
    : hasRealMetric
      ? v.ig_biography
        ? "alta"
        : "média-alta"
      : v.completeness === "complete"
        ? "média"
        : "baixa";

  const scoreVersion = hasEditorial
    ? hasRealMetric
      ? "v1-editorial+apify"
      : "v1-editorial"
    : hasRealMetric
      ? "v1-apify"
      : "v0-provisional";

  return {
    score: Math.round(score * 1000) / 1000,
    confidence,
    scoreVersion,
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
