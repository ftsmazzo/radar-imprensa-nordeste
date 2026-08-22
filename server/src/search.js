import { getTopCitiesForUf, resolveCityName } from "./cities.js";

export const VALID_UFS = ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"];
export const VALID_TYPES = ["Portal", "Rádio", "TV", "Jornal", "Blog"];
export const VALID_SORTS = ["score", "editorial", "quantitative", "followers", "name", "city", "contacts"];
export const VALID_BANDS = ["A", "A/B", "B", "B/C"];

export const CATALOG = {
  version: "search-v1",
  basePath: "/api",
  enums: {
    uf: VALID_UFS,
    type: VALID_TYPES,
    editorialBand: VALID_BANDS,
    sort: VALID_SORTS,
    fields: ["summary", "full"],
  },
  endpoints: {
    catalog: { method: "GET", path: "/api/catalog" },
    search: { method: "GET", path: "/api/search" },
    cities: { method: "GET", path: "/api/cities" },
    facets: { method: "GET", path: "/api/facets" },
    citiesTop10: { method: "GET", path: "/api/cities/top10", required: ["uf"] },
    top20: { method: "GET", path: "/api/top20", required: ["uf", "type"] },
    top20Editorial: { method: "GET", path: "/api/top20/editorial", required: ["uf"] },
    top20Quantitative: { method: "GET", path: "/api/top20/quantitative", required: ["uf"] },
    vehicle: { method: "GET", path: "/api/vehicle/:id" },
    meta: { method: "GET", path: "/api/meta" },
    stats: { method: "GET", path: "/api/stats" },
  },
  searchParams: {
    q: "texto livre: nome, cidade, instagram, site, e-mail; dígitos batem no telefone",
    uf: "uma UF ou lista AL,PE (vírgula)",
    type: "um tipo ou lista Portal,Rádio",
    city: "nome da cidade (ILIKE)",
    top10: "true = só municípios do Top 10 IBGE 2025 da(s) UF(s)",
    ibgeRank: "1–10, exige top10 ou uf; filtra aquele posto IBGE",
    hasPhone: "true/false",
    hasEmail: "true/false",
    hasInstagram: "true/false",
    hasWebsite: "true/false",
    hasContact: "true = telefone OU e-mail",
    editorialOnly: "true = só Top 20 editorial (não-TV)",
    quantitativeOnly: "true = só Top 20 quantitativo",
    editorialBand: "A | A/B | B | B/C",
    verified: "true = Instagram verificado",
    minScore: "número",
    minFollowers: "número",
    sort: VALID_SORTS.join(" | "),
    fields: "summary (padrão, lista MCP) | full",
    limit: "1–100, padrão 20",
    offset: "paginação",
  },
};

function csvUpper(v) {
  if (v == null || v === "") return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(v) {
  if (v == null || v === "") return null;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "sim"].includes(s)) return true;
  if (["0", "false", "no", "nao", "não"].includes(s)) return false;
  return null;
}

function parseList(v, allowed, normalize) {
  const raw = csvUpper(v).map(normalize);
  if (!raw.length) return [];
  const bad = raw.filter((x) => !allowed.includes(x));
  return { values: raw.filter((x) => allowed.includes(x)), bad };
}

export function parseSearchQuery(query) {
  const q = String(query.q || "").trim();
  const city = String(query.city || "").trim();

  const ufParsed = parseList(query.uf, VALID_UFS, (s) => s.toUpperCase());
  if (ufParsed.bad?.length) {
    return { error: `UF inválida: ${ufParsed.bad.join(",")}. Use: ${VALID_UFS.join(", ")}` };
  }

  const typeParsed = parseList(query.type, VALID_TYPES, (s) => {
    const exact = VALID_TYPES.find((t) => t.toLowerCase() === s.toLowerCase());
    if (exact) return exact;
    if (s.toLowerCase() === "radio") return "Rádio";
    return s;
  });
  if (typeParsed.bad?.length) {
    return { error: `type inválido: ${typeParsed.bad.join(",")}. Use: ${VALID_TYPES.join(", ")}` };
  }

  const band = String(query.editorialBand || query.band || "").trim();
  if (band && !VALID_BANDS.includes(band)) {
    return { error: `editorialBand inválida. Use: ${VALID_BANDS.join(", ")}` };
  }

  let sort = String(query.sort || "score").toLowerCase();
  if (!VALID_SORTS.includes(sort)) {
    return { error: `sort inválido. Use: ${VALID_SORTS.join(", ")}` };
  }

  const fields = String(query.fields || "summary").toLowerCase() === "full" ? "full" : "summary";
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = Math.max(0, Number(query.offset) || 0);
  const ibgeRank = query.ibgeRank != null && query.ibgeRank !== "" ? Number(query.ibgeRank) : null;
  if (ibgeRank != null && (!Number.isFinite(ibgeRank) || ibgeRank < 1 || ibgeRank > 10)) {
    return { error: "ibgeRank deve ser 1–10" };
  }

  const top10 = parseBool(query.top10) === true || parseBool(query.top10Cities) === true || ibgeRank != null;

  return {
    q,
    city,
    ufs: ufParsed.values || [],
    types: typeParsed.values || [],
    top10,
    ibgeRank,
    hasPhone: parseBool(query.hasPhone),
    hasEmail: parseBool(query.hasEmail),
    hasInstagram: parseBool(query.hasInstagram),
    hasWebsite: parseBool(query.hasWebsite),
    hasContact: parseBool(query.hasContact),
    editorialOnly: parseBool(query.editorialOnly) === true,
    quantitativeOnly: parseBool(query.quantitativeOnly) === true,
    editorialBand: band || null,
    verified: parseBool(query.verified),
    minScore: query.minScore != null && query.minScore !== "" ? Number(query.minScore) : null,
    minFollowers: query.minFollowers != null && query.minFollowers !== "" ? Number(query.minFollowers) : null,
    sort,
    fields,
    limit,
    offset,
  };
}

export async function resolveTop10Pairs(pool, ufs, ibgeRank = null) {
  const targetUfs = ufs.length ? ufs : VALID_UFS;
  const pairs = [];
  for (const uf of targetUfs) {
    const meta = getTopCitiesForUf(uf);
    if (!meta) continue;
    const { rows } = await pool.query(
      `SELECT DISTINCT city FROM vehicles WHERE uf = $1 AND city IS NOT NULL AND city <> ''`,
      [uf]
    );
    const inventory = rows.map((r) => r.city);
    for (const c of meta.cities) {
      if (ibgeRank != null && c.rank !== ibgeRank) continue;
      const matched = resolveCityName(c.name, inventory);
      pairs.push({
        uf,
        ibgeName: c.name,
        ibgeRank: c.rank,
        population: c.population,
        matchedCity: matched,
      });
    }
  }
  return pairs;
}

function contactClause(col, wanted, params) {
  if (wanted == null) return null;
  if (wanted) {
    return `(${col} IS NOT NULL AND BTRIM(${col}) <> '')`;
  }
  return `(${col} IS NULL OR BTRIM(${col}) = '')`;
}

export async function buildFilters(pool, f) {
  const params = [];
  const clauses = [];
  let top10Pairs = [];

  if (f.ufs.length) {
    params.push(f.ufs);
    clauses.push(`uf = ANY($${params.length}::text[])`);
  }
  if (f.types.length) {
    params.push(f.types);
    clauses.push(`type = ANY($${params.length}::text[])`);
  }
  if (f.city) {
    params.push(`%${f.city}%`);
    clauses.push(`city ILIKE $${params.length}`);
  }
  if (f.q) {
    const like = `%${f.q}%`;
    params.push(like);
    const likeIdx = params.length;
    const digits = f.q.replace(/\D/g, "");
    let phonePart = "";
    if (digits.length >= 8) {
      params.push(`%${digits}%`);
      phonePart = ` OR regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') LIKE $${params.length}`;
    }
    clauses.push(`(
      name ILIKE $${likeIdx}
      OR COALESCE(ig_full_name,'') ILIKE $${likeIdx}
      OR city ILIKE $${likeIdx}
      OR COALESCE(instagram,'') ILIKE $${likeIdx}
      OR COALESCE(website,'') ILIKE $${likeIdx}
      OR COALESCE(email,'') ILIKE $${likeIdx}
      ${phonePart}
    )`);
  }

  const phoneC = contactClause("phone", f.hasPhone);
  if (phoneC) clauses.push(phoneC);
  const emailC = contactClause("email", f.hasEmail);
  if (emailC) clauses.push(emailC);
  const igC = contactClause("instagram", f.hasInstagram);
  if (igC) clauses.push(igC);
  const webC = contactClause("website", f.hasWebsite);
  if (webC) clauses.push(webC);
  if (f.hasContact === true) {
    clauses.push(`(
      (phone IS NOT NULL AND BTRIM(phone) <> '')
      OR (email IS NOT NULL AND BTRIM(email) <> '')
    )`);
  } else if (f.hasContact === false) {
    clauses.push(`(
      (phone IS NULL OR BTRIM(phone) = '')
      AND (email IS NULL OR BTRIM(email) = '')
    )`);
  }

  if (f.editorialOnly) clauses.push(`editorial_rank IS NOT NULL`);
  if (f.quantitativeOnly) clauses.push(`quantitative_rank IS NOT NULL`);
  if (f.editorialBand) {
    params.push(f.editorialBand);
    clauses.push(`editorial_band = $${params.length}`);
  }
  if (f.verified === true) clauses.push(`ig_verified IS TRUE`);
  if (f.verified === false) clauses.push(`(ig_verified IS NOT TRUE)`);
  if (f.minScore != null && Number.isFinite(f.minScore)) {
    params.push(f.minScore);
    clauses.push(`score >= $${params.length}`);
  }
  if (f.minFollowers != null && Number.isFinite(f.minFollowers)) {
    params.push(f.minFollowers);
    clauses.push(`instagram_followers >= $${params.length}`);
  }

  if (f.top10) {
    top10Pairs = await resolveTop10Pairs(pool, f.ufs, f.ibgeRank);
    const matched = top10Pairs.filter((p) => p.matchedCity);
    if (!matched.length) {
      clauses.push(`FALSE`);
    } else {
      params.push(matched.map((p) => p.uf));
      params.push(matched.map((p) => p.matchedCity));
      clauses.push(`(uf, city) IN (
        SELECT * FROM unnest($${params.length - 1}::text[], $${params.length}::text[]) AS t(uf, city)
      )`);
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params, top10Pairs };
}

function orderSql(sort) {
  switch (sort) {
    case "editorial":
      return `editorial_rank ASC NULLS LAST, score DESC, name ASC`;
    case "quantitative":
      return `quantitative_rank ASC NULLS LAST, desk_score_final DESC NULLS LAST, score DESC, name ASC`;
    case "followers":
      return `instagram_followers DESC NULLS LAST, score DESC, name ASC`;
    case "name":
      return `name ASC`;
    case "city":
      return `uf ASC, city ASC, score DESC`;
    case "contacts":
      return `(CASE WHEN phone IS NOT NULL AND BTRIM(phone) <> '' THEN 0 ELSE 1 END),
              (CASE WHEN email IS NOT NULL AND BTRIM(email) <> '' THEN 0 ELSE 1 END),
              score DESC, name ASC`;
    default:
      return `score DESC, editorial_rank ASC NULLS LAST, instagram_followers DESC NULLS LAST, name ASC`;
  }
}

function ibgeLookup(pairs) {
  const map = new Map();
  for (const p of pairs) {
    if (!p.matchedCity) continue;
    map.set(`${p.uf}|${p.matchedCity}`, p);
  }
  return map;
}

export function attachIbge(row, lookup) {
  const hit = lookup.get(`${row.uf}|${row.city}`);
  if (!hit) return { inIbgeTop10: false, ibgeRank: null, ibgeCity: null, ibgePopulation: null };
  return {
    inIbgeTop10: true,
    ibgeRank: hit.ibgeRank,
    ibgeCity: hit.ibgeName,
    ibgePopulation: hit.population,
  };
}

export async function searchVehicles(pool, f) {
  const built = await buildFilters(pool, f);
  const order = orderSql(f.sort);
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM vehicles ${built.where}`, built.params);
  const total = countRes.rows[0]?.c || 0;

  const params = [...built.params, f.limit, f.offset];
  const { rows } = await pool.query(
    `SELECT * FROM vehicles ${built.where} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  let lookup = ibgeLookup(built.top10Pairs);
  if (!f.top10 && rows.length) {
    const ufs = [...new Set(rows.map((r) => r.uf))];
    lookup = ibgeLookup(await resolveTop10Pairs(pool, ufs));
  }

  return { total, rows, ibgeLookup: lookup, top10Pairs: built.top10Pairs };
}

export async function listCities(pool, f) {
  const cityFilter = { ...f, city: f.city || f.q, q: "" };
  const built = await buildFilters(pool, { ...cityFilter, top10: false });
  const pairs = await resolveTop10Pairs(pool, f.ufs, f.ibgeRank);
  const lookup = ibgeLookup(pairs);

  const extra = [];
  const params = [...built.params];
  if (f.top10) {
    const matched = pairs.filter((p) => p.matchedCity);
    if (!matched.length) {
      extra.push(`AND FALSE`);
    } else {
      params.push(matched.map((p) => p.uf));
      params.push(matched.map((p) => p.matchedCity));
      extra.push(`AND (uf, city) IN (
        SELECT * FROM unnest($${params.length - 1}::text[], $${params.length}::text[]) AS t(uf, city)
      )`);
    }
  }

  const where = built.where ? `${built.where} ${extra.join(" ")}` : extra.length ? `WHERE TRUE ${extra.join(" ")}` : "";

  const { rows } = await pool.query(
    `
    SELECT uf, city,
      COUNT(*)::int AS vehicles,
      COUNT(*) FILTER (WHERE phone IS NOT NULL AND BTRIM(phone) <> '')::int AS with_phone,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND BTRIM(email) <> '')::int AS with_email,
      COUNT(*) FILTER (WHERE instagram IS NOT NULL AND BTRIM(instagram) <> '')::int AS with_instagram,
      COUNT(*) FILTER (WHERE website IS NOT NULL AND BTRIM(website) <> '')::int AS with_website,
      COUNT(*) FILTER (WHERE editorial_rank IS NOT NULL)::int AS editorial,
      COALESCE(MAX(score), 0) AS max_score
    FROM vehicles
    ${where}
    GROUP BY uf, city
    ORDER BY uf, vehicles DESC, city
    `,
    params
  );

  return rows.map((r) => {
    const ibge = attachIbge(r, lookup);
    return {
      uf: r.uf,
      city: r.city,
      vehicles: r.vehicles,
      withPhone: r.with_phone,
      withEmail: r.with_email,
      withInstagram: r.with_instagram,
      withWebsite: r.with_website,
      editorial: r.editorial,
      maxScore: Number(r.max_score),
      ...ibge,
    };
  });
}

export async function facets(pool, f) {
  const built = await buildFilters(pool, f);
  const [byUf, byType, contacts] = await Promise.all([
    pool.query(
      `SELECT uf, COUNT(*)::int AS n FROM vehicles ${built.where} GROUP BY uf ORDER BY uf`,
      built.params
    ),
    pool.query(
      `SELECT type, COUNT(*)::int AS n FROM vehicles ${built.where} GROUP BY type ORDER BY type`,
      built.params
    ),
    pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE phone IS NOT NULL AND BTRIM(phone) <> '')::int AS with_phone,
        COUNT(*) FILTER (WHERE email IS NOT NULL AND BTRIM(email) <> '')::int AS with_email,
        COUNT(*) FILTER (WHERE instagram IS NOT NULL AND BTRIM(instagram) <> '')::int AS with_instagram,
        COUNT(*) FILTER (WHERE website IS NOT NULL AND BTRIM(website) <> '')::int AS with_website,
        COUNT(*) FILTER (WHERE (phone IS NOT NULL AND BTRIM(phone) <> '') OR (email IS NOT NULL AND BTRIM(email) <> ''))::int AS with_contact,
        COUNT(*) FILTER (WHERE editorial_rank IS NOT NULL)::int AS editorial,
        COUNT(*) FILTER (WHERE quantitative_rank IS NOT NULL)::int AS quantitative
       FROM vehicles ${built.where}`,
      built.params
    ),
  ]);
  const c = contacts.rows[0];
  return {
    total: c.total,
    byUf: Object.fromEntries(byUf.rows.map((r) => [r.uf, r.n])),
    byType: Object.fromEntries(byType.rows.map((r) => [r.type, r.n])),
    contacts: {
      withPhone: c.with_phone,
      withEmail: c.with_email,
      withInstagram: c.with_instagram,
      withWebsite: c.with_website,
      withContact: c.with_contact,
    },
    editorial: c.editorial,
    quantitative: c.quantitative,
  };
}
