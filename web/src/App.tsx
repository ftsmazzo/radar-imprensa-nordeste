import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Vehicle = {
  rank: number;
  id: string;
  name: string;
  uf: string;
  state: string;
  city: string;
  type: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  completeness: string;
  score: number;
  confidence: string;
  instagramFollowers: number | null;
  websiteAlive: boolean | null;
  lastEnrichedAt: string | null;
};

type Meta = {
  total: number;
  scoreVersion: string;
  note: string;
  scoredAt: string;
  withFollowers?: number;
  enriched?: number;
  lastEnrichedAt?: string | null;
  apifyConfigured?: boolean;
  dynamicRanking?: boolean;
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

function formatFollowers(n: number | null) {
  if (n == null) return null;
  return n.toLocaleString("pt-BR");
}

function contactLabel(v: Vehicle) {
  const parts = [];
  if (v.email) parts.push("e-mail");
  if (v.phone) parts.push("telefone");
  if (v.instagram) parts.push("Instagram");
  if (v.instagramFollowers != null) parts.push(`${formatFollowers(v.instagramFollowers)} seg.`);
  return parts.length ? parts.join(" · ") : "Sem contato";
}

export default function App() {
  const [list, setList] = useState<Vehicle[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [uf, setUf] = useState<string>("PE");
  const [type, setType] = useState<string>("Portal");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  const loadMeta = () =>
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ uf, type });
    fetch(`/api/top20?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => setList(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [uf, type]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        v.city.toLowerCase().includes(query) ||
        (v.email ?? "").toLowerCase().includes(query)
    );
  }, [list, q]);

  const exportCsv = () => {
    const header = [
      "rank",
      "name",
      "uf",
      "city",
      "type",
      "score",
      "followers",
      "email",
      "phone",
      "instagram",
      "website",
      "confidence",
    ];
    const rows = filtered.map((v) =>
      [
        v.rank,
        v.name,
        v.uf,
        v.city,
        v.type,
        v.score,
        v.instagramFollowers ?? "",
        v.email ?? "",
        v.phone ?? "",
        v.instagram ?? "",
        v.website ?? "",
        v.confidence,
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top20-${uf}-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runEnrichPilot = async () => {
    setEnrichMsg("Iniciando enrichment…");
    try {
      const res = await fetch("/api/enrich/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uf, limit: 20, mode: "full" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setEnrichMsg(
        `Job ${data.id} rodando (${data.total} veículos de ${uf}). O Top 20 atualiza sozinho quando o score mudar.`
      );
      const poll = setInterval(async () => {
        const st = await fetch(`/api/enrich/status?id=${data.id}`).then((r) => r.json());
        if (st.status === "done" || st.status === "error") {
          clearInterval(poll);
          setEnrichMsg(
            st.status === "done"
              ? `Enrichment concluído: ${st.updated} atualizados. Recarregando ranking…`
              : `Enrichment com erro: ${JSON.stringify(st.errors?.[0] || st)}`
          );
          loadMeta();
          const params = new URLSearchParams({ uf, type });
          const fresh = await fetch(`/api/top20?${params}`).then((r) => r.json());
          setList(fresh);
        }
      }, 3000);
    } catch (e) {
      setEnrichMsg(String(e));
    }
  };

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <header className="hero">
        <p className="brand">Radar Imprensa Nordeste</p>
        <h1>Top 20 por estado</h1>
        <p className="lede">
          Ranking dinâmico no Postgres. Enrichment Apify atualiza seguidores e o Top 20 recalcula na hora.
        </p>
        {meta && (
          <p className="meta">
            {meta.total.toLocaleString("pt-BR")} veículos · {meta.withFollowers ?? 0} com seguidores · score{" "}
            {meta.scoreVersion}
            {meta.apifyConfigured ? " · Apify OK" : " · Apify pendente (token)"}
          </p>
        )}
      </header>

      <section className="controls" aria-label="Filtros">
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
        <label>
          Categoria
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Buscar na lista
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, cidade ou e-mail"
          />
        </label>
        <button type="button" className="btn" onClick={exportCsv} disabled={!filtered.length}>
          Exportar CSV
        </button>
        <button type="button" className="btn btn-ghost" onClick={runEnrichPilot}>
          Enrichment {uf}
        </button>
      </section>

      {enrichMsg && <p className="enrich-msg">{enrichMsg}</p>}
      {meta && <p className="footnote top-note">{meta.note}</p>}

      <section className="panel">
        <div className="panel-head">
          <h2>
            {STATE_NAME[uf]} · {type}
          </h2>
          <span>{filtered.length} de até 20</span>
        </div>

        {error && <p className="error">{error}</p>}
        {loading && <p className="loading">Carregando ranking…</p>}

        {!loading && (
          <ol className="rank-list">
            {filtered.map((v) => (
              <li key={v.id} className="rank-item">
                <span className="rank">#{v.rank}</span>
                <div className="main">
                  <strong>{v.name}</strong>
                  <span className="sub">
                    {v.city} · score {v.score.toFixed(3)} · confiança {v.confidence}
                    {v.instagramFollowers != null
                      ? ` · ${formatFollowers(v.instagramFollowers)} seguidores`
                      : ""}
                  </span>
                  <span className="sub">{contactLabel(v)}</span>
                </div>
                <div className="links">
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noreferrer">
                      Site
                    </a>
                  )}
                  {v.email && <a href={`mailto:${v.email}`}>E-mail</a>}
                  {v.instagram && (
                    <a href={v.instagram} target="_blank" rel="noreferrer">
                      IG
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="footer">
        Fonte inventário:{" "}
        <a href="https://radarimprensanordeste.manus.space/" target="_blank" rel="noreferrer">
          Radar v1
        </a>
        {" · "}
        Fabria IA — ranking dinâmico
      </footer>
    </div>
  );
}
