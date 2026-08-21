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
  editorialRank?: number | null;
  editorialBand?: string | null;
  editorialConfidence?: string | null;
  editorialJustification?: string | null;
  deskFollowers?: number | null;
  deskReachValue?: number | null;
  deskReachUnit?: string | null;
  deskMetricSource?: string | null;
  deskSourceType?: string | null;
  deskEvidenceQuality?: number | null;
  deskObservation?: string | null;
  deskScoreFinal?: number | null;
  deskCoverage?: string | null;
  quantitativeRank?: number | null;
};

type Meta = {
  total: number;
  scoreVersion: string;
  note: string;
  withFollowers?: number;
  withBio?: number;
  withPhone?: number;
  withEmail?: number;
  verified?: number;
  enriched?: number;
  editorial?: number;
  deskScored?: number;
  deskFollowers?: number;
  deskReach?: number;
  maxFollowers?: number;
  apifyConfigured?: boolean;
};

type ContactFilter = "todos" | "telefone" | "email" | "qualquer" | "ambos";
type RankingMode = "categoria" | "editorial" | "quantitativo" | "cidades";

type CityGroup = {
  rank: number;
  name: string;
  matchedCity: string | null;
  population: number;
  inventoryCount: number;
  vehicles: Vehicle[];
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
  const [cityGroups, setCityGroups] = useState<CityGroup[]>([]);
  const [citiesNote, setCitiesNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [uf, setUf] = useState("PE");
  const [type, setType] = useState("Portal");
  const [mode, setMode] = useState<RankingMode>("quantitativo");
  const [q, setQ] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("todos");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchAssunto, setDispatchAssunto] = useState("");
  const [dispatchTexto, setDispatchTexto] = useState("");
  const [dispatchLink, setDispatchLink] = useState("");
  const [dispatchCanal, setDispatchCanal] = useState<"whatsapp" | "email" | "ambos">("whatsapp");
  const [dispatchModo, setDispatchModo] = useState<"simulacao" | "enviar">("simulacao");
  const [dispatchInstancia, setDispatchInstancia] = useState("Agente");
  const [dispatchIds, setDispatchIds] = useState<string[]>([]);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  const loadMeta = () =>
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch((e) => setError(String(e)));

  const loadList = () => {
    setLoading(true);
    setError(null);
    if (mode === "cidades") {
      return fetch(`/api/cities/top10?uf=${encodeURIComponent(uf)}&limitPerCity=8`)
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text());
          return r.json();
        })
        .then((data: { cities: CityGroup[]; note?: string; source?: string; referenceDate?: string }) => {
          const groups = data.cities || [];
          setCityGroups(groups);
          setCitiesNote(
            [data.source, data.referenceDate ? `ref. ${data.referenceDate}` : null, data.note]
              .filter(Boolean)
              .join(" · ")
          );
          const flat = groups.flatMap((g) => g.vehicles);
          setList(flat);
          setSelected((prev) => flat.find((d) => d.id === prev?.id) || flat[0] || null);
          setDispatchIds(flat.map((d) => d.id));
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }

    setCityGroups([]);
    setCitiesNote(null);
    const url =
      mode === "editorial"
        ? `/api/top20/editorial?uf=${encodeURIComponent(uf)}`
        : mode === "quantitativo"
          ? `/api/top20/quantitative?uf=${encodeURIComponent(uf)}`
          : `/api/top20?${new URLSearchParams({ uf, type })}`;
    return fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data: Vehicle[]) => {
        setList(data);
        setSelected((prev) => data.find((d) => d.id === prev?.id) || data[0] || null);
        setDispatchIds(data.map((d) => d.id));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadList();
  }, [uf, type, mode]);

  const matchesContact = (v: Vehicle, filter: ContactFilter) => {
    const hasPhone = Boolean(v.phone);
    const hasEmail = Boolean(v.email);
    if (filter === "telefone") return hasPhone;
    if (filter === "email") return hasEmail;
    if (filter === "qualquer") return hasPhone || hasEmail;
    if (filter === "ambos") return hasPhone && hasEmail;
    return true;
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return list.filter((v) => {
      if (!matchesContact(v, contactFilter)) return false;
      if (!query) return true;
      return (
        v.name.toLowerCase().includes(query) ||
        v.displayName?.toLowerCase().includes(query) ||
        v.city.toLowerCase().includes(query) ||
        (v.igBiography ?? "").toLowerCase().includes(query)
      );
    });
  }, [list, q, contactFilter]);

  const filteredCityGroups = useMemo(() => {
    if (mode !== "cidades") return [];
    const ids = new Set(filtered.map((v) => v.id));
    return cityGroups.map((g) => ({
      ...g,
      vehicles: g.vehicles.filter((v) => ids.has(v.id)),
    }));
  }, [mode, cityGroups, filtered]);

  const listContactStats = useMemo(() => {
    const withPhone = list.filter((v) => v.phone).length;
    const withEmail = list.filter((v) => v.email).length;
    const withBoth = list.filter((v) => v.phone && v.email).length;
    const withAny = list.filter((v) => v.phone || v.email).length;
    return { withPhone, withEmail, withBoth, withAny, total: list.length };
  }, [list]);

  useEffect(() => {
    if (!dispatchOpen) return;
    setDispatchIds(filtered.map((v) => v.id));
    setDispatchResult(null);
  }, [dispatchOpen, filtered]);

  useEffect(() => {
    setSelected((prev) => filtered.find((d) => d.id === prev?.id) || filtered[0] || null);
  }, [filtered]);

  const dispatchPreview = useMemo(() => {
    const selectedRows = list.filter((v) => dispatchIds.includes(v.id));
    const withPhone = selectedRows.filter((v) => v.phone).length;
    const withEmail = selectedRows.filter((v) => v.email).length;
    return { total: selectedRows.length, withPhone, withEmail };
  }, [list, dispatchIds]);

  const toggleDispatchId = (id: string) => {
    setDispatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runDispatch = async () => {
    setDispatchBusy(true);
    setDispatchResult(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uf,
          tipo: type,
          assunto: dispatchAssunto,
          texto: dispatchTexto,
          link: dispatchLink,
          canal: dispatchCanal,
          modo: dispatchModo,
          instancia: dispatchInstancia,
          vehicleIds: dispatchIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const msg =
        data.n8n?.message ||
        `${data.modo === "enviar" ? "Disparo enviado" : "Simulação ok"} · ${data.comContato}/${data.totalVeiculos} com contato`;
      setDispatchResult(msg);
    } catch (e) {
      setDispatchResult(String(e));
    } finally {
      setDispatchBusy(false);
    }
  };

  const runEnrich = async (mode = "instagram") => {
    setEnriching(true);
    setEnrichMsg(
      mode === "contacts"
        ? "Buscando e-mail/telefone em bio e sites…"
        : "Buscando perfis ricos no Apify…"
    );
    try {
      const res = await fetch("/api/enrich/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uf, type, limit: 25, mode, force: mode === "contacts" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setEnrichMsg(`Job ${data.id}: ${data.total} na fila…`);
      const poll = setInterval(async () => {
        const st = await fetch(`/api/enrich/status?id=${data.id}`).then((r) => r.json());
        if (st.status === "done" || st.status === "error") {
          clearInterval(poll);
          setEnriching(false);
          setEnrichMsg(
            st.status === "done"
              ? `${st.updated} atualizados (${mode}).`
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
      "rank", "name", "type", "city", "band", "coverage", "deskScore", "quantitativeRank",
      "editorialRank", "followers", "deskFollowers", "deskReach", "deskReachUnit",
      "email", "phone", "instagram", "website", "score",
    ];
    const rows = filtered.map((v) =>
      [
        v.rank, v.name, v.type, v.city, v.editorialBand ?? "", v.deskCoverage ?? "",
        v.deskScoreFinal ?? "", v.quantitativeRank ?? "", v.editorialRank ?? "",
        v.instagramFollowers ?? "", v.deskFollowers ?? "", v.deskReachValue ?? "",
        v.deskReachUnit ?? "", v.email ?? "", v.phone ?? "", v.instagram ?? "",
        v.website ?? "", v.score,
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `top20-${uf}-${mode === "categoria" ? type : mode}.csv`;
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
              <span>Editorial</span>
              <strong>{(meta.editorial ?? 0).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="kpi">
              <span>Desk score</span>
              <strong>{(meta.deskScored ?? 0).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="kpi">
              <span>Com telefone</span>
              <strong>{(meta.withPhone ?? 0).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="kpi">
              <span>Com e-mail</span>
              <strong>{(meta.withEmail ?? 0).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="kpi">
              <span>Com seguidores</span>
              <strong>{meta.withFollowers ?? 0}</strong>
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
        <div className="type-tabs" role="tablist" aria-label="Modo de ranking">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "quantitativo"}
            className={mode === "quantitativo" ? "tab on" : "tab"}
            onClick={() => setMode("quantitativo")}
          >
            Quantitativo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "editorial"}
            className={mode === "editorial" ? "tab on" : "tab"}
            onClick={() => setMode("editorial")}
          >
            Editorial
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "categoria"}
            className={mode === "categoria" ? "tab on" : "tab"}
            onClick={() => setMode("categoria")}
          >
            Por categoria
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "cidades"}
            className={mode === "cidades" ? "tab on" : "tab"}
            onClick={() => setMode("cidades")}
          >
            Por cidade
          </button>
        </div>
        {mode === "categoria" && (
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
        )}
        <label>
          Contato
          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value as ContactFilter)}
          >
            <option value="todos">Todos</option>
            <option value="qualquer">Telefone ou e-mail</option>
            <option value="telefone">Só com telefone</option>
            <option value="email">Só com e-mail</option>
            <option value="ambos">Telefone e e-mail</option>
          </select>
        </label>
        <label className="search">
          Buscar
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cidade ou bio" />
        </label>
        <div className="dock-actions">
          <button type="button" className="btn ghost" onClick={exportCsv} disabled={!filtered.length}>
            CSV
          </button>
          <button type="button" className="btn ghost" onClick={() => setDispatchOpen(true)} disabled={!filtered.length}>
            Disparo
          </button>
          <button type="button" className="btn ghost" onClick={() => runEnrich("contacts")} disabled={enriching}>
            Contatos
          </button>
          <button type="button" className="btn" onClick={() => runEnrich("instagram")} disabled={enriching}>
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
              {mode === "cidades"
                ? `Top 10 cidades · ${STATE_NAME[uf]}`
                : `Top 20 · ${STATE_NAME[uf]}${
                    mode === "editorial"
                      ? " · Editorial"
                      : mode === "quantitativo"
                        ? " · Quantitativo"
                        : ` · ${type}`
                  }`}
            </h1>
            <div className="panel-meta">
              <span>
                {filtered.length}
                {filtered.length !== list.length ? ` de ${list.length}` : ""} veículos
              </span>
              <span className="chip">tel {listContactStats.withPhone}</span>
              <span className="chip">mail {listContactStats.withEmail}</span>
              <span className="chip">ambos {listContactStats.withBoth}</span>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          {loading && <p className="loading">Carregando…</p>}
          {!loading && mode === "cidades" && citiesNote && (
            <p className="cities-source">{citiesNote}</p>
          )}

          {mode === "cidades" ? (
            <div className="city-blocks">
              {!loading &&
                filteredCityGroups.map((g) => (
                  <section key={g.name} className="city-block">
                    <header className="city-head">
                      <div>
                        <span className="city-rank">#{g.rank}</span>
                        <h2>{g.name}</h2>
                      </div>
                      <div className="city-meta">
                        <span>{g.population.toLocaleString("pt-BR")} hab.</span>
                        <span>
                          {g.vehicles.length}
                          {g.inventoryCount > g.vehicles.length
                            ? ` de ${g.inventoryCount}`
                            : ""}{" "}
                          veículos
                        </span>
                      </div>
                    </header>
                    {g.vehicles.length === 0 ? (
                      <p className="city-empty">Sem veículos principais cadastrados nesta cidade.</p>
                    ) : (
                      <div className="cards">
                        {g.vehicles.map((v) => (
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
                              {v.igVerified && (
                                <i className="badge-v" title="Verificado">
                                  ✓
                                </i>
                              )}
                            </div>
                            <div className="card-body">
                              <strong>{v.name}</strong>
                              <em>
                                {v.type}
                                {v.editorialBand ? ` · Faixa ${v.editorialBand}` : ""}
                                {v.deskCoverage ? ` · ${v.deskCoverage}` : ""}
                              </em>
                              <div className="metrics">
                                <span>
                                  <b>{fmt(v.instagramFollowers)}</b> seg.
                                </span>
                                <span className={v.phone ? "ok" : "miss"}>
                                  {v.phone ? "tel" : "sem tel"}
                                </span>
                                <span className={v.email ? "ok" : "miss"}>
                                  {v.email ? "mail" : "sem mail"}
                                </span>
                              </div>
                            </div>
                            <div className="score-chip">{v.score.toFixed(2)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
            </div>
          ) : (
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
                      {mode !== "categoria" ? ` · ${v.type}` : ""}
                      {v.editorialBand ? ` · Faixa ${v.editorialBand}` : ""}
                      {v.deskCoverage ? ` · ${v.deskCoverage}` : ""}
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
                      <span className={v.phone ? "ok" : "miss"}>{v.phone ? "tel" : "sem tel"}</span>
                      <span className={v.email ? "ok" : "miss"}>{v.email ? "mail" : "sem mail"}</span>
                    </div>
                  </div>
                  <div className="score-chip">{v.score.toFixed(2)}</div>
                </button>
              ))}
          </div>
          )}
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
                    {selected.editorialBand ? ` · Faixa ${selected.editorialBand}` : ""}
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

              {selected.editorialJustification && (
                <div className="bio editorial">
                  <h3>Justificativa editorial</h3>
                  <p>{selected.editorialJustification}</p>
                  {selected.editorialConfidence && (
                    <small>Confiança do levantamento: {selected.editorialConfidence}</small>
                  )}
                </div>
              )}

              {(selected.deskScoreFinal != null || selected.deskObservation) && (
                <div className="bio editorial">
                  <h3>Desk research quantitativo</h3>
                  <p>
                    Score final {selected.deskScoreFinal?.toFixed(1) ?? "—"}/100
                    {selected.deskCoverage ? ` · cobertura ${selected.deskCoverage}` : ""}
                    {selected.quantitativeRank != null ? ` · rank Q#${selected.quantitativeRank}` : ""}
                    {selected.editorialRank != null ? ` · editorial #${selected.editorialRank}` : ""}
                  </p>
                  {(selected.deskFollowers != null || selected.deskReachValue != null) && (
                    <p>
                      {selected.deskFollowers != null ? `IG desk ${fmt(selected.deskFollowers)}` : ""}
                      {selected.deskFollowers != null && selected.deskReachValue != null ? " · " : ""}
                      {selected.deskReachValue != null
                        ? `Alcance ${fmt(selected.deskReachValue)}${selected.deskReachUnit ? ` (${selected.deskReachUnit})` : ""}`
                        : ""}
                    </p>
                  )}
                  {selected.deskObservation && <p>{selected.deskObservation}</p>}
                  {selected.deskMetricSource && (
                    <small>
                      Fonte:{" "}
                      <a href={selected.deskMetricSource} target="_blank" rel="noreferrer">
                        {selected.deskSourceType || "métrica"}
                      </a>
                      {selected.deskEvidenceQuality != null
                        ? ` · evidência ${selected.deskEvidenceQuality}/10`
                        : ""}
                    </small>
                  )}
                </div>
              )}

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
        Enrichment Apify · ranking editorial humano · disparo via webhook
      </footer>

      {dispatchOpen && (
        <div className="drawer-backdrop" onClick={() => !dispatchBusy && setDispatchOpen(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispatch-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <p className="eyebrow">Automação</p>
                <h2 id="dispatch-title">Disparo Top 20</h2>
                <p className="drawer-sub">
                  {STATE_NAME[uf]} ·{" "}
                  {mode === "editorial"
                    ? "Editorial (misto)"
                    : mode === "quantitativo"
                      ? "Quantitativo (desk)"
                      : mode === "cidades"
                        ? "Por cidade (IBGE)"
                        : type}{" "}
                  · webhook n8n
                </p>
              </div>
              <button type="button" className="btn ghost" onClick={() => setDispatchOpen(false)} disabled={dispatchBusy}>
                Fechar
              </button>
            </header>

            <div className="drawer-grid">
              <label>
                Assunto
                <input
                  value={dispatchAssunto}
                  onChange={(e) => setDispatchAssunto(e.target.value)}
                  placeholder="Release / pauta"
                />
              </label>
              <label className="span-2">
                Texto
                <textarea
                  value={dispatchTexto}
                  onChange={(e) => setDispatchTexto(e.target.value)}
                  rows={5}
                  placeholder="Corpo do material para imprensa"
                />
              </label>
              <label>
                Link opcional
                <input
                  value={dispatchLink}
                  onChange={(e) => setDispatchLink(e.target.value)}
                  placeholder="https://"
                />
              </label>
              <label>
                Instância Evolution
                <input
                  value={dispatchInstancia}
                  onChange={(e) => setDispatchInstancia(e.target.value)}
                  placeholder="Agente"
                />
              </label>
              <label>
                Canal
                <select
                  value={dispatchCanal}
                  onChange={(e) => setDispatchCanal(e.target.value as typeof dispatchCanal)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="ambos">Ambos</option>
                </select>
              </label>
              <label>
                Modo
                <select
                  value={dispatchModo}
                  onChange={(e) => setDispatchModo(e.target.value as typeof dispatchModo)}
                >
                  <option value="simulacao">Simulação (só registra)</option>
                  <option value="enviar">Enviar de verdade</option>
                </select>
              </label>
            </div>

            <div className="dispatch-preview">
              <strong>
                {dispatchPreview.total} selecionados · {dispatchPreview.withPhone} com telefone ·{" "}
                {dispatchPreview.withEmail} com e-mail
              </strong>
              <div className="dispatch-list">
                {filtered.map((v) => (
                  <label key={v.id} className="dispatch-row">
                    <input
                      type="checkbox"
                      checked={dispatchIds.includes(v.id)}
                      onChange={() => toggleDispatchId(v.id)}
                    />
                    <span className="rank">#{v.rank}</span>
                    <span className="name">{v.name}</span>
                    <span className="hint">
                      {v.phone ? "tel" : "—"}
                      {" · "}
                      {v.email ? "mail" : "—"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {dispatchResult && <p className="dispatch-result">{dispatchResult}</p>}

            <footer className="drawer-foot">
              <button
                type="button"
                className="btn"
                disabled={
                  dispatchBusy ||
                  !dispatchAssunto.trim() ||
                  !dispatchTexto.trim() ||
                  !dispatchIds.length
                }
                onClick={runDispatch}
              >
                {dispatchBusy
                  ? "Processando…"
                  : dispatchModo === "enviar"
                    ? "Enviar agora"
                    : "Simular disparo"}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
