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
  address?: string | null;
  whatsapp?: string | null;
  completeness?: string | null;
  note?: string | null;
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
  withWhatsapp?: number;
  verified?: number;
  enriched?: number;
  editorial?: number;
  deskScored?: number;
  deskFollowers?: number;
  deskReach?: number;
  maxFollowers?: number;
  apifyConfigured?: boolean;
};

type ContactFilter = "todos" | "telefone" | "email" | "whatsapp" | "qualquer" | "ambos";
type RankingMode = "categoria" | "editorial" | "quantitativo" | "cidades" | "todos";
type Region = "NE" | "AP";

type AppConfig = {
  region: Region;
  brand: string;
  tag: string;
  ufs: string[];
  defaultUf: string;
  defaultMode: RankingMode;
  limitPerCity: number;
  categoryLimit?: number;
  footer: string;
  dispatchConfigured: boolean;
  apifyConfigured: boolean;
};

type CityGroup = {
  rank: number;
  name: string;
  matchedCity: string | null;
  population: number;
  inventoryCount: number;
  vehicles: Vehicle[];
};

const UFS_NE = ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] as const;
const TYPES = ["TV", "Rádio", "Jornal", "Portal", "Blog"] as const;
const AP_TOTAL_MUNICIPALITIES = 16;
const AP_TOP_CITIES_COUNT = 3;

const COMPLETENESS_LABEL: Record<string, string> = {
  minimal: "Mínima",
  partial: "Parcial",
  complete: "Completa",
};

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
  AP: "Amapá",
};

function digitsOf(s: string) {
  return String(s).replace(/\D/g, "");
}

function waMe(whatsapp?: string | null, phone?: string | null) {
  const raw = whatsapp || "";
  let d = digitsOf(raw || phone || "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;
  if (!whatsapp && !/^55\d{2}9\d{8}$/.test(d)) return null;
  return `https://wa.me/${d}`;
}

function telHref(phone?: string | null) {
  if (!phone) return null;
  let d = digitsOf(phone);
  if (d.length <= 11) d = `55${d}`;
  return `tel:+${d}`;
}

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

type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "dark";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [list, setList] = useState<Vehicle[]>([]);
  const [cityGroups, setCityGroups] = useState<CityGroup[]>([]);
  const [citiesNote, setCitiesNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [uf, setUf] = useState("PE");
  const [region, setRegion] = useState<Region>("NE");
  const [type, setType] = useState("Portal");
  const [mode, setMode] = useState<RankingMode>("quantitativo");
  const [q, setQ] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("todos");
  const [cityFocus, setCityFocus] = useState<string>("");
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("radar-theme", theme);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue sem persistir
    }
  }, [theme]);

  useEffect(() => {
    setCityFocus("");
  }, [mode, uf]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: AppConfig) => {
        setConfig(cfg);
        setRegion(cfg.region);
        setUf(cfg.defaultUf);
        setMode(cfg.defaultMode);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const loadMeta = () =>
    fetch(region === "AP" ? "/api/meta?uf=AP" : "/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch((e) => setError(String(e)));

  const loadList = () => {
    if (!config) return;
    setLoading(true);
    setError(null);
    if (mode === "cidades") {
      return fetch(
        `/api/cities/top10?uf=${encodeURIComponent(uf)}&limitPerCity=${config.limitPerCity}`
      )
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
    if (mode === "todos") {
      return fetch(`/api/search?uf=${encodeURIComponent(uf)}&limit=100&fields=full`)
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text());
          return r.json();
        })
        .then((data: { items: Vehicle[] }) => {
          const rows = data.items || [];
          setList(rows);
          setSelected((prev) => rows.find((d) => d.id === prev?.id) || rows[0] || null);
          setDispatchIds(rows.map((d) => d.id));
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }

    const url =
      mode === "editorial"
        ? `/api/top20/editorial?uf=${encodeURIComponent(uf)}`
        : mode === "quantitativo"
          ? `/api/top20/quantitative?uf=${encodeURIComponent(uf)}`
          : `/api/top20?${new URLSearchParams({
              uf,
              type,
              ...(config.categoryLimit ? { limit: String(config.categoryLimit) } : {}),
            })}`;
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
    if (!config) return;
    loadMeta();
  }, [config, region]);

  useEffect(() => {
    if (!config) return;
    loadList();
  }, [config, uf, type, mode, region]);

  const ufOptions = config?.ufs?.length ? config.ufs : region === "AP" ? ["AP"] : [...UFS_NE];

  const matchesContact = (v: Vehicle, filter: ContactFilter) => {
    const hasPhone = Boolean(v.phone);
    const hasEmail = Boolean(v.email);
    const hasWa = Boolean(v.whatsapp || waMe(v.whatsapp, v.phone));
    if (filter === "telefone") return hasPhone;
    if (filter === "email") return hasEmail;
    if (filter === "whatsapp") return hasWa;
    if (filter === "qualquer") return hasPhone || hasEmail || hasWa;
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

  const kpis = useMemo(() => {
    if (!meta) return [];
    if (region === "AP") {
      const items = [
        { label: "Base", value: meta.total.toLocaleString("pt-BR") },
        { label: "Municípios", value: `${AP_TOTAL_MUNICIPALITIES}/${AP_TOTAL_MUNICIPALITIES}` },
        { label: "Com telefone", value: (meta.withPhone ?? 0).toLocaleString("pt-BR") },
        { label: "Com e-mail", value: (meta.withEmail ?? 0).toLocaleString("pt-BR") },
      ];
      if ((meta.withWhatsapp ?? 0) > 0) {
        items.push({ label: "WhatsApp", value: (meta.withWhatsapp ?? 0).toLocaleString("pt-BR") });
      }
      return items;
    }
    const items = [
      { label: "Base", value: meta.total.toLocaleString("pt-BR") },
      { label: "Editorial", value: (meta.editorial ?? 0).toLocaleString("pt-BR") },
      { label: "Desk score", value: (meta.deskScored ?? 0).toLocaleString("pt-BR") },
      { label: "Com telefone", value: (meta.withPhone ?? 0).toLocaleString("pt-BR") },
      { label: "Com e-mail", value: (meta.withEmail ?? 0).toLocaleString("pt-BR") },
    ];
    if ((meta.withWhatsapp ?? 0) > 0) {
      items.push({ label: "WhatsApp", value: (meta.withWhatsapp ?? 0).toLocaleString("pt-BR") });
    }
    items.push({ label: "Com seguidores", value: String(meta.withFollowers ?? 0) });
    items.push({ label: "Maior alcance", value: fmt(meta.maxFollowers) });
    return items;
  }, [meta, region]);

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
    const withPhone = selectedRows.filter((v) => v.phone || v.whatsapp).length;
    const withEmail = selectedRows.filter((v) => v.email).length;
    const withWa = selectedRows.filter((v) => waMe(v.whatsapp, v.phone)).length;
    return { total: selectedRows.length, withPhone, withEmail, withWa };
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
      "rank", "name", "type", "city", "address",
      "email", "email_link", "phone", "phone_link", "whatsapp", "whatsapp_link",
      "instagram", "website", "score",
    ];
    const rows = filtered.map((v) => {
      const wa = waMe(v.whatsapp, v.phone);
      const tel = telHref(v.phone);
      const mail = v.email ? `mailto:${v.email}` : "";
      return [
        v.rank, v.name, v.type, v.city, v.address ?? "",
        v.email ?? "", mail, v.phone ?? "", tel ?? "", v.whatsapp ?? "", wa ?? "",
        v.instagram ?? "", v.website ?? "", v.score,
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = region === "AP"
      ? `radar-amapa-${mode === "categoria" ? type : mode}.csv`
      : `top20-${uf}-${mode === "categoria" ? type : mode}.csv`;
    a.click();
  };

  const renderCityBlock = (g: CityGroup) => (
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
            {g.inventoryCount > g.vehicles.length ? ` de ${g.inventoryCount}` : ""} veículos
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
                <strong>
                  {v.name}
                  {v.note && (
                    <i className="badge-note" title={v.note}>
                      i
                    </i>
                  )}
                </strong>
                <em>
                  {v.type}
                  {v.editorialBand ? ` · Faixa ${v.editorialBand}` : ""}
                  {v.deskCoverage ? ` · ${v.deskCoverage}` : ""}
                </em>
                <div className="metrics">
                  {region === "AP" ? (
                    <>
                      <span className={v.phone ? "ok" : "miss"}>{v.phone ? "tel" : "sem tel"}</span>
                      <span className={v.email ? "ok" : "miss"}>{v.email ? "mail" : "sem mail"}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        <b>{fmt(v.instagramFollowers)}</b> seg.
                      </span>
                      <span className={v.phone ? "ok" : "miss"}>{v.phone ? "tel" : "sem tel"}</span>
                      <span className={v.email ? "ok" : "miss"}>{v.email ? "mail" : "sem mail"}</span>
                    </>
                  )}
                </div>
              </div>
              {region !== "AP" && <div className="score-chip">{v.score.toFixed(2)}</div>}
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderCityCompact = (g: CityGroup) => (
    <div key={g.name} className="city-compact">
      <div className="city-compact-head">
        <span className="city-rank">#{g.rank}</span>
        <strong>{g.name}</strong>
        <span className="muted">{g.population.toLocaleString("pt-BR")} hab.</span>
      </div>
      {g.vehicles.length === 0 ? (
        <span className="city-empty-inline">Sem canal mapeado</span>
      ) : (
        <div className="city-compact-vehicles">
          {g.vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              className={selected?.id === v.id ? "chip-veh active" : "chip-veh"}
              onClick={() => setSelected(v)}
            >
              {v.name}
              {v.note && (
                <i className="badge-note" title={v.note}>
                  i
                </i>
              )}
              <span className={v.phone ? "ok" : "miss"}>{v.phone ? "tel" : "—"}</span>
              <span className={v.email ? "ok" : "miss"}>{v.email ? "mail" : "—"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="shell">
      <div className="glow" aria-hidden />

      {!config && (
        <p className="loading" style={{ padding: "2rem 0" }}>
          Carregando Radar…
        </p>
      )}

      {config && (
      <>
      <header className="top">
        <div className="brand-block">
          <p className="brand">{config?.brand || (region === "AP" ? "Radar Imprensa Amapá" : "Radar Imprensa Nordeste")}</p>
          <p className="tag">
            {config?.tag ||
              (region === "AP"
                ? "16 municípios · rádio, TV, jornal, portal e blog · CSV com WhatsApp e telefone clicáveis"
                : "Mapa vivo dos veículos que realmente alcançam audiência")}
          </p>
        </div>
        <div className="top-right">
          {meta && (
            <div className="kpi-row">
              {kpis.map((k) => (
                <div className="kpi" key={k.label}>
                  <span>{k.label}</span>
                  <strong>{k.value}</strong>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <div className="equator-line" aria-hidden />

      <section className="dock">
        {ufOptions.length > 1 && (
          <label>
            Estado
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              {ufOptions.map((code) => (
                <option key={code} value={code}>
                  {code} — {STATE_NAME[code] || code}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="type-tabs" role="tablist" aria-label="Modo de ranking">
          {region !== "AP" && (
            <>
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
            </>
          )}
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
          {region === "AP" && (
          <button
            type="button"
            role="tab"
            aria-selected={mode === "todos"}
            className={mode === "todos" ? "tab on" : "tab"}
            onClick={() => setMode("todos")}
          >
            Todos
          </button>
          )}
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
        {mode === "cidades" && cityGroups.length > 0 && (
          <>
            <label className="city-jump">
              Ir para cidade
              <select value={cityFocus} onChange={(e) => setCityFocus(e.target.value)}>
                <option value="">Todas as cidades</option>
                {cityGroups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            {cityFocus && (
              <button type="button" className="city-jump-reset" onClick={() => setCityFocus("")}>
                Ver todas
              </button>
            )}
          </>
        )}
        <label>
          Contato
          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value as ContactFilter)}
          >
            <option value="todos">Todos</option>
            <option value="qualquer">Telefone, e-mail ou WhatsApp</option>
            <option value="telefone">Só com telefone</option>
            <option value="whatsapp">Só com WhatsApp</option>
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
            WhatsApp / E-mail
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
                ? region === "AP"
                  ? `${AP_TOTAL_MUNICIPALITIES} municípios · Amapá`
                  : `Top 10 cidades · ${STATE_NAME[uf]}`
                : mode === "todos"
                  ? `Todos os veículos · ${STATE_NAME[uf]}`
                : region === "AP"
                  ? `${type} · Amapá`
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
              {!loading && cityFocus ? (
                filteredCityGroups.filter((g) => g.name === cityFocus).map(renderCityBlock)
              ) : !loading && region === "AP" ? (
                <>
                  <h3 className="city-group-heading">
                    Top {AP_TOP_CITIES_COUNT} municípios
                  </h3>
                  {filteredCityGroups.slice(0, AP_TOP_CITIES_COUNT).map(renderCityBlock)}
                  <h3 className="city-group-heading">
                    Demais municípios ({Math.max(0, filteredCityGroups.length - AP_TOP_CITIES_COUNT)})
                  </h3>
                  <div className="city-compact-list">
                    {filteredCityGroups.slice(AP_TOP_CITIES_COUNT).map(renderCityCompact)}
                  </div>
                </>
              ) : (
                !loading && filteredCityGroups.map(renderCityBlock)
              )}
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
                    <strong>
                      {v.name}
                      {v.note && (
                        <i className="badge-note" title={v.note}>
                          i
                        </i>
                      )}
                    </strong>
                    <em>
                      {v.city}
                      {mode !== "categoria" ? ` · ${v.type}` : ""}
                      {v.editorialBand ? ` · Faixa ${v.editorialBand}` : ""}
                      {v.deskCoverage ? ` · ${v.deskCoverage}` : ""}
                      {v.igCategory ? ` · ${v.igCategory}` : ""}
                    </em>
                    <div className="metrics">
                      {region === "AP" ? (
                        <>
                          <span className={v.phone ? "ok" : "miss"}>{v.phone ? "tel" : "sem tel"}</span>
                          <span className={v.email ? "ok" : "miss"}>{v.email ? "mail" : "sem mail"}</span>
                          <span className={v.whatsapp ? "ok" : "miss"}>{v.whatsapp ? "whatsapp" : "sem whatsapp"}</span>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                  {region !== "AP" && <div className="score-chip">{v.score.toFixed(2)}</div>}
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
                  <h2>
                    {selected.name}
                    {selected.note && (
                      <i className="badge-note" title={selected.note}>
                        i
                      </i>
                    )}
                  </h2>
                  {selected.displayName && selected.displayName !== selected.name && (
                    <p className="aka">{selected.displayName}</p>
                  )}
                  <p className="place">
                    {selected.city}, {selected.state}
                  </p>
                  {selected.note && <p className="institutional-note">{selected.note}</p>}
                </div>
              </div>

              {region === "AP" ? (
                <div className="stat-grid ap">
                  <div>
                    <span>Tipo</span>
                    <strong>{selected.type}</strong>
                  </div>
                  <div>
                    <span>Município</span>
                    <strong>{selected.city}</strong>
                  </div>
                  <div>
                    <span>Completude</span>
                    <strong>{COMPLETENESS_LABEL[selected.completeness ?? ""] ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Confiança</span>
                    <strong>{selected.confidence}</strong>
                  </div>
                </div>
              ) : (
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
              )}

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
                  {selected.address && (
                    <li>
                      <span>Endereço</span>
                      <span>{selected.address}</span>
                    </li>
                  )}
                  {selected.email && (
                    <li>
                      <span>E-mail</span>
                      <a href={`mailto:${selected.email}`}>{selected.email}</a>
                    </li>
                  )}
                  {selected.phone && (
                    <li>
                      <span>Telefone</span>
                      <a href={telHref(selected.phone) || `tel:${selected.phone}`}>{selected.phone}</a>
                    </li>
                  )}
                  {waMe(selected.whatsapp, selected.phone) && (
                    <li>
                      <span>WhatsApp</span>
                      <a href={waMe(selected.whatsapp, selected.phone)!} target="_blank" rel="noreferrer">
                        {selected.whatsapp || "Abrir conversa"}
                      </a>
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
                  {!selected.email && !selected.phone && !selected.website && !selected.instagram && !selected.whatsapp && !selected.address && (
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

              {region === "AP" ? (
                selected.lastEnrichedAt && (
                  <p className="trust">
                    Enriquecido em {new Date(selected.lastEnrichedAt).toLocaleString("pt-BR")}
                  </p>
                )
              ) : (
                <p className="trust">
                  Confiança {selected.confidence}
                  {selected.lastEnrichedAt
                    ? ` · enriquecido ${new Date(selected.lastEnrichedAt).toLocaleString("pt-BR")}`
                    : " · ainda sem enrichment rico"}
                </p>
              )}
            </>
          )}
        </aside>
      </div>

      <footer className="foot">
        {config?.footer ||
          (region === "AP"
            ? "Inventário Amapá · disparo WhatsApp/e-mail via n8n"
            : "Inventário Nordeste · Enrichment Apify · ranking editorial · disparo via webhook")}
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
                <p className="eyebrow">Disparo na plataforma</p>
                <h2 id="dispatch-title">WhatsApp e e-mail</h2>
                <p className="drawer-sub">
                  {STATE_NAME[uf]} ·{" "}
                  {mode === "editorial"
                    ? "Editorial (misto)"
                    : mode === "quantitativo"
                      ? "Quantitativo (desk)"
                      : mode === "cidades"
                        ? region === "AP"
                          ? "Por cidade (16 municípios)"
                          : "Por cidade (IBGE)"
                        : mode === "todos"
                          ? "Todos os veículos"
                          : type}{" "}
                  · {config?.dispatchConfigured ? "n8n pronto" : "configure N8N_DISPATCH_WEBHOOK"}
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
                {dispatchPreview.total} selecionados · {dispatchPreview.withWa} WhatsApp ·{" "}
                {dispatchPreview.withPhone} telefone · {dispatchPreview.withEmail} e-mail
              </strong>
              <p className="drawer-sub" style={{ marginTop: "0.35rem" }}>
                Simulação só testa o fluxo. “Enviar de verdade” dispara pela Evolution (WhatsApp) e/ou e-mail no n8n.
              </p>
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
                      {waMe(v.whatsapp, v.phone) ? "wa" : "—"}
                      {" · "}
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
      </>
      )}
    </div>
  );
}
