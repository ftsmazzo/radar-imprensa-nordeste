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
};

type Meta = {
  total: number;
  scoreVersion: string;
  note: string;
  scoredAt: string;
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

function contactLabel(v: Vehicle) {
  const parts = [];
  if (v.email) parts.push("e-mail");
  if (v.phone) parts.push("telefone");
  if (v.instagram) parts.push("Instagram");
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

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch((e) => setError(String(e)));
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
    const header = ["rank", "name", "uf", "city", "type", "score", "email", "phone", "instagram", "website", "confidence"];
    const rows = filtered.map((v) =>
      [v.rank, v.name, v.uf, v.city, v.type, v.score, v.email ?? "", v.phone ?? "", v.instagram ?? "", v.website ?? "", v.confidence]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top20-${uf}-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <header className="hero">
        <p className="brand">Radar Imprensa Nordeste</p>
        <h1>Top 20 por estado</h1>
        <p className="lede">
          Base no Postgres com ranking provisional. Próximo passo: métricas reais via Apify e disparo automatizado.
        </p>
        {meta && (
          <p className="meta">
            {meta.total.toLocaleString("pt-BR")} veículos · score {meta.scoreVersion} · atualizado{" "}
            {new Date(meta.scoredAt).toLocaleString("pt-BR")}
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
      </section>

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

        {meta && <p className="footnote">{meta.note}</p>}
      </section>

      <footer className="footer">
        Fonte inventário:{" "}
        <a href="https://radarimprensanordeste.manus.space/" target="_blank" rel="noreferrer">
          Radar v1
        </a>
        {" · "}
        Fabria IA — v2 no Easypanel
      </footer>
    </div>
  );
}
