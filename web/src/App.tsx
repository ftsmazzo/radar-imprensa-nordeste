import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Post = {
  caption?: string;
  likes?: number;
  comments?: number;
  url?: string | null;
  displayUrl?: string | null;
};

type Vehicle = {
  rank: number;
  id: string;
  name: string;
  displayName: string;
  uf: string;
  state: string;
  city: string;
  type: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  score: number;
  confidence: string;
  instagramFollowers: number | null;
  igFollowing: number | null;
  igPostsCount: number | null;
  igVerified: boolean;
  igIsBusiness: boolean;
  igCategory: string | null;
  igProfilePic: string | null;
  igExternalUrl: string | null;
  igBiography: string | null;
  igAvgLikes: number | null;
  igAvgComments: number | null;
  igEngagementRate: number | null;
  recentPosts: Post[];
  websiteAlive: boolean | null;
  lastEnrichedAt: string | null;
};

type Meta = {
  total: number;
  scoreVersion: string;
  note: string;
  withFollowers?: number;
  withBio?: number;
  verified?: number;
  enriched?: number;
  maxFollowers?: number;
  apifyConfigured?: boolean;
};

const UFS = ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] as const;
const TYPES = ["TV", "Rádio", "Jornal", "Portal", "Blog"] as const;

const STATE_NAME: Record<string, string> = {
  AL: "Alagoas",
  BA: "Bahia",
  CE: "Ceará",
  MA: "Maranhão",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  RN: "Rio Grande do Norte",
  SE: "Sergipe",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(".0", "")}k`;
  return n.toLocaleString("pt-BR");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function App() {
  const [list, setList] = useState<Vehicle[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [uf, setUf] = useState("PE");
  const [type, setType] = useState("Portal");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);

  const loadMeta = () =>
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch((e) => setError(String(e)));

  const loadList = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ uf, type });
    return fetch(`/api/top20?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data: Vehicle[]) => {
        setList(data);
        setSelected((prev) => data.find((d) => d.id === prev?.id) || data[0] || null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadList();
  }, [uf, type]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        v.displayName?.toLowerCase().includes(query) ||
        v.city.toLowerCase().includes(query) ||
        (v.igBiography ?? "").toLowerCase().includes(query)
    );
  }, [list, q]);

  const runEnrich = async () => {
    setEnriching(true);
    setEnrichMsg("Buscando perfis ricos no Apify…");
    try {
      const res = await fetch("/api/enrich/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uf, type, limit: 25, mode: "instagram", force: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setEnrichMsg(`Job ${data.id}: ${data.total} perfis na fila…`);
      const poll = setInterval(async () => {
        const st = await fetch(`/api/enrich/status?id=${data.id}`).then((r) => r.json());
        if (st.status === "done" || st.status === "error") {
          clearInterval(poll);
          setEnriching(false);
          setEnrichMsg(
            st.status === "done"
              ? `${st.updated} perfis atualizados com bio/engajamento.`
              : `Erro: ${JSON.stringify(st.errors?.[0] || st)}`
          );
          loadMeta();
          loadList();
        }
      }, 4000);
    } catch (e) {
      setEnriching(false);
      setEnrichMsg(String(e));
    }
  };

  const exportCsv = () => {
    const header = [
      "rank", "name", "city", "followers", "following", "posts", "engagement",
      "avgLikes", "verified", "email", "phone", "instagram", "website", "bio", "score",
    ];
    const rows = filtered.map((v) =>
      [
        v.rank, v.name, v.city, v.instagramFollowers ?? "", v.igFollowing ?? "",
        v.igPostsCount ?? "", v.igEngagementRate ?? "", v.igAvgLikes ?? "",
        v.igVerified ? "sim" : "", v.email ?? "", v.phone ?? "", v.instagram ?? "",
        v.website ?? "", (v.igBiography ?? "").replaceAll("\n", " "), v.score,
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `top20-${uf}-${type}-rico.csv`;
    a.click();
  };

  return (
    <div className="shell">
      <div className="glow" aria-hidden />

      <header className="top">
        <div className="brand-block">
          <p className="brand">Radar Imprensa Nordeste</p>
          <p className="tag">Mapa vivo dos veículos que realmente alcançam audiência</p>
        </div>
        {meta && (
          <div className="kpi-row">
            <div className="kpi">
              <span>Base</span>
              <strong>{meta.total.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="kpi">
              <span>Com seguidores</span>
              <strong>{meta.withFollowers ?? 0}</strong>
            </div>
            <div className="kpi">
              <span>Com bio</span>
              <strong>{meta.withBio ?? 0}</strong>
            </div>
            <div className="kpi">
              <span>Maior alcance</span>
              <strong>{fmt(meta.maxFollowers)}</strong>
            </div>
          </div>
        )}
      </header>

      <section className="dock">
        <label>
          Estado
          <select value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((code) => (
              <option key={code} value={code}>
                {code} — {STATE_NAME[code]}
              </option>
            ))}
          </select>
        </label>
        <div className="type-tabs" role="tablist" aria-label="Categoria">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={type === t}
              className={type === t ? "tab on" : "tab"}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="search">
          Buscar
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cidade ou bio" />
        </label>
        <div className="dock-actions">
          <button type="button" className="btn ghost" onClick={exportCsv} disabled={!filtered.length}>
            CSV
          </button>
          <button type="button" className="btn" onClick={runEnrich} disabled={enriching}>
            {enriching ? "Enriquecendo…" : `Apify ${uf}`}
          </button>
        </div>
      </section>

      {(enrichMsg || meta?.note) && (
        <p className="status-line">{enrichMsg || meta?.note}</p>
      )}

      <div className="board">
        <section className="rank-panel">
          <div className="panel-title">
            <h1>
              Top 20 · {STATE_NAME[uf]} · {type}
            </h1>
            <span>{filtered.length} veículos</span>
          </div>

          {error && <p className="error">{error}</p>}
          {loading && <p className="loading">Carregando…</p>}

          <div className="cards">
            {!loading &&
              filtered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={selected?.id === v.id ? "card active" : "card"}
                  onClick={() => setSelected(v)}
                >
                  <div className="card-rank">#{v.rank}</div>
                  <div className="avatar" aria-hidden>
                    {v.igProfilePic ? (
                      <img src={v.igProfilePic} alt="" loading="lazy" />
                    ) : (
                      <span>{initials(v.name)}</span>
                    )}
                    {v.igVerified && <i className="badge-v" title="Verificado">✓</i>}
                  </div>
                  <div className="card-body">
                    <strong>{v.name}</strong>
                    <em>
                      {v.city}
                      {v.igCategory ? ` · ${v.igCategory}` : ""}
                    </em>
                    <div className="metrics">
                      <span>
                        <b>{fmt(v.instagramFollowers)}</b> seg.
                      </span>
                      <span>
                        <b>{fmt(v.igPostsCount)}</b> posts
                      </span>
                      <span>
                        <b>{v.igEngagementRate != null ? `${v.igEngagementRate}%` : "—"}</b> eng.
                      </span>
                    </div>
                  </div>
                  <div className="score-chip">{v.score.toFixed(2)}</div>
                </button>
              ))}
          </div>
        </section>

        <aside className="detail" aria-live="polite">
          {!selected && <p className="loading">Selecione um veículo</p>}
          {selected && (
            <>
              <div className="detail-hero">
                <div className="avatar lg" aria-hidden>
                  {selected.igProfilePic ? (
                    <img src={selected.igProfilePic} alt="" />
                  ) : (
                    <span>{initials(selected.name)}</span>
                  )}
                </div>
                <div>
                  <p className="eyebrow">
                    #{selected.rank} · {selected.type}
                    {selected.igVerified ? " · verificado" : ""}
                    {selected.igIsBusiness ? " · business" : ""}
                  </p>
                  <h2>{selected.name}</h2>
                  {selected.displayName && selected.displayName !== selected.name && (
                    <p className="aka">{selected.displayName}</p>
                  )}
                  <p className="place">
                    {selected.city}, {selected.state}
                  </p>
                </div>
              </div>

              <div className="stat-grid">
                <div>
                  <span>Seguidores</span>
                  <strong>{fmt(selected.instagramFollowers)}</strong>
                </div>
                <div>
                  <span>Seguindo</span>
                  <strong>{fmt(selected.igFollowing)}</strong>
                </div>
                <div>
                  <span>Posts</span>
                  <strong>{fmt(selected.igPostsCount)}</strong>
                </div>
                <div>
                  <span>Engajamento</span>
                  <strong>
                    {selected.igEngagementRate != null ? `${selected.igEngagementRate}%` : "—"}
                  </strong>
                </div>
                <div>
                  <span>Média likes</span>
                  <strong>{fmt(selected.igAvgLikes)}</strong>
                </div>
                <div>
                  <span>Score</span>
                  <strong>{selected.score.toFixed(3)}</strong>
                </div>
              </div>

              {selected.igBiography && (
                <div className="bio">
                  <h3>Bio</h3>
                  <p>{selected.igBiography}</p>
                </div>
              )}

              <div className="contacts">
                <h3>Contatos & canais</h3>
                <ul>
                  {selected.email && (
                    <li>
                      <span>E-mail</span>
                      <a href={`mailto:${selected.email}`}>{selected.email}</a>
                    </li>
                  )}
                  {selected.phone && (
                    <li>
                      <span>Telefone</span>
                      <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                    </li>
                  )}
                  {selected.website && (
                    <li>
                      <span>Site</span>
                      <a href={selected.website} target="_blank" rel="noreferrer">
                        {selected.website.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  )}
                  {selected.instagram && (
                    <li>
                      <span>Instagram</span>
                      <a href={selected.instagram} target="_blank" rel="noreferrer">
                        Abrir perfil
                      </a>
                    </li>
                  )}
                  {selected.igExternalUrl && (
                    <li>
                      <span>Link da bio</span>
                      <a href={selected.igExternalUrl} target="_blank" rel="noreferrer">
                        {selected.igExternalUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  )}
                  {!selected.email && !selected.phone && !selected.website && !selected.instagram && (
                    <li className="muted">Sem canais cadastrados</li>
                  )}
                </ul>
              </div>

              {selected.recentPosts?.length > 0 && (
                <div className="posts">
                  <h3>Posts recentes</h3>
                  <div className="post-grid">
                    {selected.recentPosts.map((p, i) => (
                      <article key={i} className="post">
                        {p.displayUrl && <img src={p.displayUrl} alt="" loading="lazy" />}
                        <p>{p.caption || "Sem legenda"}</p>
                        <small>
                          ♥ {fmt(p.likes ?? 0)} · 💬 {fmt(p.comments ?? 0)}
                        </small>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              <p className="trust">
                Confiança {selected.confidence}
                {selected.lastEnrichedAt
                  ? ` · enriquecido ${new Date(selected.lastEnrichedAt).toLocaleString("pt-BR")}`
                  : " · ainda sem enrichment rico"}
              </p>
            </>
          )}
        </aside>
      </div>

      <footer className="foot">
        Inventário base:{" "}
        <a href="https://radarimprensanordeste.manus.space/" target="_blank" rel="noreferrer">
          Radar v1
        </a>
        {" · "}
        Enrichment Apify · ranking dinâmico
      </footer>
    </div>
  );
}
