# Instrução para o agente Cursor — ligar o Radar ao MCP Campanha Ary

Cole este arquivo inteiro no chat do **outro** agente (projeto do MCP). Ele deve implementar no serviço **já existente**, não criar MCP novo.

---

## 0. Objetivo

Expor o **Radar Imprensa Nordeste** como tools no MCP:

`https://mineracao-ary-mcp-campanha.kxryyk.easypanel.host/mcp`

Produto atual: *Catalogo Campanha Ary (servico isolado)* · serviço Easypanel: `mcp-campanha`.

O Radar **não** é um MCP. É uma **API HTTP pública de leitura**. O MCP Ary faz `fetch` nela e devolve JSON estruturado, no mesmo estilo das tools `pib_uf`, `mulher_mun`, `catalogo`.

```
Cliente MCP / Cursor
  → https://mineracao-ary-mcp-campanha.kxryyk.easypanel.host/mcp
      → GET https://radar-imprensa-web.kxryyk.easypanel.host/api/...
```

**Proibido:** criar MCP paralelo, copiar o Postgres, chamar `/api/enrich/*` ou `/api/dispatch`, inventar ranking/telefone/seguidores.

---

## 1. Conferir que a API Radar está viva (faça isso primeiro)

```
GET https://radar-imprensa-web.kxryyk.easypanel.host/api/health
```

Esperado:

```json
{
  "ok": true,
  "vehicles": 3664,
  "apifyConfigured": true,
  "search": "/api/search",
  "catalog": "/api/catalog"
}
```

Se `search`/`catalog` não existirem, ou `/api/catalog` der 404, **pare** e avise: o Radar ainda está na API antiga.

Contrato canônico (enums e params):

```
GET https://radar-imprensa-web.kxryyk.easypanel.host/api/catalog
```

`version` deve ser `search-v1`. Se o catálogo mudar, siga o JSON ao vivo, não este doc.

Env no MCP Ary:

```
RADAR_API_BASE=https://radar-imprensa-web.kxryyk.easypanel.host
```

Timeout sugerido: 15s. Sem autenticação na leitura.

---

## 2. O que é o Radar (para o `catalogo()` do MCP)

- 3.664 veículos de imprensa dos **9 estados do Nordeste**.
- Tipos (string **exata**): `Portal` | `Rádio` | `TV` | `Jornal` | `Blog`.
- UFs: `AL` `BA` `CE` `MA` `PB` `PE` `PI` `RN` `SE`.
- IDs: texto tipo `atlas-13`.
- Três rankings (não misturar):
  - **Por categoria:** Top 20 por `UF × type` (TV entra). `GET /api/top20?uf=&type=`
  - **Editorial:** Top 20 **não-TV** mistos por estado (julgamento humano). 180 registros. `GET /api/top20/editorial?uf=`
  - **Quantitativo:** os mesmos 180, ordem desk research. `GET /api/top20/quantitative?uf=`
- **Top 10 cidades:** municípios IBGE pop. 2025 por UF + veículos do inventário.
- Contatos: telefone, e-mail, site, Instagram (cobertura incompleta; use filtros `hasPhone` / `hasContact`).

TV **não** entra no Top 20 editorial/quantitativo. Para TV use `radar_top` modo `categoria` e `type=TV`.

---

## 3. Endpoints (proxy GET, query string)

Base: `https://radar-imprensa-web.kxryyk.easypanel.host`

| Uso | Método | Path |
|-----|--------|------|
| Contrato | GET | `/api/catalog` |
| Busca cruzada (**principal**) | GET | `/api/search` |
| Municípios + flag IBGE + cobertura contato | GET | `/api/cities` |
| Contagens sobre o mesmo filtro | GET | `/api/facets` |
| Top 10 IBGE + veículos por cidade | GET | `/api/cities/top10?uf=PE&limitPerCity=8` |
| Top 20 categoria | GET | `/api/top20?uf=PE&type=Portal` |
| Top 20 editorial | GET | `/api/top20/editorial?uf=PE` |
| Top 20 quantitativo | GET | `/api/top20/quantitative?uf=PE` |
| Ficha | GET | `/api/vehicle/{id}` |
| Totais | GET | `/api/meta` |
| Stats por tipo | GET | `/api/stats?uf=PE` |

Helper: monte a URL com `URLSearchParams`. `type=Rádio` precisa de encoding (`R%C3%A1dio`). Booleans: `true`/`false`. Listas: `uf=BA,PE` `type=Portal,Rádio`.

### 3.1 Params de `/api/search` (todos combináveis)

| Param | Significado |
|-------|-------------|
| `q` | Nome, cidade, Instagram, site, e-mail; dígitos batem no telefone |
| `uf` | Uma ou várias (`PE` ou `AL,PE`) |
| `type` | Um ou vários tipos exatos |
| `city` | ILIKE no município |
| `top10=true` | Só municípios do Top 10 IBGE 2025 da(s) UF(s) |
| `ibgeRank` | 1–10 (posto IBGE naquele estado) |
| `hasPhone` `hasEmail` `hasInstagram` `hasWebsite` | true/false |
| `hasContact=true` | telefone **ou** e-mail |
| `editorialOnly` `quantitativeOnly` | só os 20 ranqueados daquele modo |
| `editorialBand` | `A` `A/B` `B` `B/C` |
| `verified` | Instagram verificado |
| `minScore` `minFollowers` | piso numérico |
| `sort` | `score` `editorial` `quantitative` `followers` `name` `city` `contacts` |
| `fields` | `summary` (padrão, listas) ou `full` |
| `limit` | 1–100, default 20 |
| `offset` | paginação |

Resposta search:

```json
{
  "total": 67,
  "limit": 3,
  "offset": 0,
  "filters": { "uf": ["PE"], "top10": true, "hasContact": true },
  "items": [
    {
      "id": "atlas-1439",
      "name": "DIARIO DE PERNAMBUCO",
      "displayName": "...",
      "uf": "PE",
      "state": "Pernambuco",
      "city": "Recife",
      "type": "Jornal",
      "phone": "+55 ...",
      "email": "...",
      "website": "...",
      "instagram": "...",
      "score": 0.8,
      "editorialRank": 2,
      "quantitativeRank": 1,
      "deskScoreFinal": 85,
      "instagramFollowers": 123,
      "igVerified": false,
      "inIbgeTop10": true,
      "ibgeRank": 1,
      "ibgeCity": "Recife",
      "ibgePopulation": 1588376
    }
  ]
}
```

Smoke test já validado em produção (2026-08-22):

```
GET /api/search?uf=PE&top10=true&hasContact=true&limit=3
→ total 67, 1º Diário de Pernambuco, Recife, inIbgeTop10 true, com telefone

GET /api/cities?uf=PE&top10=true
→ 10 cidades, Recife ibgeRank 1, 73 veículos

GET /api/facets?uf=PE
→ total 454, withContact 220, editorial 20

GET /api/search?uf=XX → 400
```

---

## 4. Tools a registrar (espelhar `*_uf` / `*_mun`)

Inclua no discovery `GET /mcp` (array `tools`) **e** no handler `tools/list` / `tools/call` do protocolo MCP.

### 4.1 `radar`

**Quando:** “o que o Radar tem?”, ping, dicionário do domínio imprensa.

**Args:** nenhum (ou `{}`).

**Chamadas:** `GET /api/catalog` e `GET /api/meta`. Devolva os dois objetos juntos.

Atualize também a tool `catalogo` do MCP Ary: uma linha dizendo que existe domínio **imprensa/radar** (Nordeste, veículos, contatos, rankings).

### 4.2 `radar_uf`  (principal)

**Quando:** qualquer pergunta por estado, cidade, tipo, contato, top 10 municípios, nome de veículo.

**Args (JSON):**

| Campo | Obrigatório | Tipo |
|-------|-------------|------|
| `uf` | sim | string 2 letras (ou `"BA,PE"`) |
| `q` | não | string |
| `type` | não | string (ex. `Rádio` ou `Portal,Rádio`) |
| `city` | não | string |
| `top10` | não | boolean |
| `ibgeRank` | não | 1–10 |
| `hasPhone` `hasEmail` `hasInstagram` `hasWebsite` `hasContact` | não | boolean |
| `editorialOnly` `quantitativeOnly` | não | boolean |
| `editorialBand` | não | string |
| `verified` | não | boolean |
| `minScore` `minFollowers` | não | number |
| `sort` | não | string |
| `fields` | não | `summary` \| `full` |
| `limit` | não | number, default 20, max 50 no MCP (a API aceita 100) |
| `offset` | não | number |

**Chamada:** `GET {RADAR_API_BASE}/api/search?...`

Defaults úteis:

- Usuário pede “maiores cidades” / “capitais e interior grande” / “top municípios” → `top10=true`.
- Usuário pede “pra disparar” / “quem tem telefone ou e-mail” → `hasContact=true`.
- Listas: `fields=summary`. Ficha rica só com `radar_veiculo` ou `fields=full`.

Se `uf` não for do Nordeste, **não** chame a API: erro com a lista `AL BA CE MA PB PE PI RN SE`.

### 4.3 `radar_mun`

**Quando:** “cidades de PE”, “Recife vs Caruaru”, inventário municipal.

**Args:** `uf` (obrigatório), `city?`, `top10?`, `q?`, `hasContact?`, `hasPhone?`.

**Chamada:** `GET /api/cities?uf=&city=&top10=&q=&hasContact=...`

Se `city` vier preenchida, opcionalmente também `GET /api/search?uf=&city=&limit=20` e anexe `veiculos`.

Para o pacote “10 maiores + veículos de cada uma”:

`GET /api/cities/top10?uf=PE&limitPerCity=8`

Pode ser o mesmo tool com `comVeiculos=true`, ou um flag interno.

### 4.4 `radar_top`

**Args:**

- `uf` obrigatório
- `modo`: `categoria` | `editorial` | `quantitativo`
- `type` obrigatório **somente** se `modo=categoria`

Rotas:

- `categoria` → `/api/top20?uf=&type=`
- `editorial` → `/api/top20/editorial?uf=`
- `quantitativo` → `/api/top20/quantitative?uf=`

### 4.5 `radar_veiculo`

**Args:** `id` (ex. `atlas-13`).

**Chamada:** `GET /api/vehicle/{id}`

404 da API = “veículo não encontrado”.

---

## 5. Mapeamento pergunta → tool

| Pergunta do usuário | Tool | Args |
|---------------------|------|------|
| Contatos de rádio em Recife | `radar_uf` | `uf=PE` `city=Recife` `type=Rádio` `hasPhone=true` |
| Imprensa das 10 maiores de PE com telefone ou e-mail | `radar_uf` | `uf=PE` `top10=true` `hasContact=true` |
| Quais as 10 maiores cidades de BA no Radar | `radar_mun` | `uf=BA` `top10=true` |
| Quem pautar em BA (não-TV) | `radar_top` | `uf=BA` `modo=editorial` |
| Top 20 portais de CE | `radar_top` | `uf=CE` `modo=categoria` `type=Portal` |
| TVs de SE | `radar_uf` ou `radar_top` | `type=TV` |
| Ficha do TNH1 | `radar_uf` `q=TNH1` `uf=AL` depois `radar_veiculo` `id=atlas-13` |
| Quantos veículos em PE têm e-mail | `GET /api/facets?uf=PE` (pode ir dentro de `radar_uf` com `facetsOnly`, ou chamar facets no mesmo tool se `resumo=true`) |

Sugestão extra (opcional): se `radar_uf` receber `resumo=true`, chame `/api/facets` em vez de `/api/search`.

---

## 6. Implementação (padrão do MCP Ary)

1. Ache onde as tools são declaradas (array que o `GET /mcp` lista: `catalogo`, `pib_uf`, `mulher_mun`, …).
2. Adicione `radar`, `radar_uf`, `radar_mun`, `radar_top`, `radar_veiculo` nesse array **e** nos schemas JSON do MCP (`inputSchema`).
3. No `tools/call`, um `switch`/`if` por nome: `fetch` Radar, `res.ok`? parse JSON : devolva `{ error, status, url }`.
4. Encode UTF-8 (`Rádio`). Não reescreva acentos para `Radio` (a API só aceita `Rádio`).
5. Redeploy o serviço `mcp-campanha`. Confirme `GET /mcp` listando as 5 tools.

Esqueleto:

```js
const RADAR = process.env.RADAR_API_BASE || "https://radar-imprensa-web.kxryyk.easypanel.host";

async function radarGet(pathAndQuery) {
  const url = `${RADAR}${pathAndQuery}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) return { ok: false, status: res.status, url, error: data.error || data };
  return { ok: true, url, data };
}

function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  return p.toString();
}

// radar_uf
async function radar_uf(args) {
  const uf = String(args.uf || "").toUpperCase();
  if (!uf) return { error: "uf é obrigatório (Nordeste: AL BA CE MA PB PE PI RN SE)" };
  return radarGet(`/api/search?${qs({ ...args, uf, fields: args.fields || "summary", limit: args.limit || 20 })}`);
}
```

---

## 7. Regras de produto

- Só Nordeste. Fora disso, recuse na tool.
- Não invente dados. Se `items` vier vazio, diga `total: 0`.
- Listas: `summary`. Completo: `radar_veiculo`.
- Contatos são de assessoria: não despejar 3664 fones sem filtro; sempre UF (e de preferência cidade/top10/`hasContact`).
- `score` é composto (editorial + desk + Apify). Para “quem pautar”, prefira `radar_top` editorial, não só `sort=score`.
- Health do Radar com `vehicles: 3664` e `search` preenchido = fonte certa.

---

## 8. Checklist de aceite

- [ ] `GET {MCP}/mcp` lista `radar`, `radar_uf`, `radar_mun`, `radar_top`, `radar_veiculo`
- [ ] `catalogo` menciona imprensa/radar
- [ ] `tools/call radar` devolve catalog `search-v1` + meta
- [ ] `radar_uf` `{ "uf":"PE", "top10": true, "hasContact": true, "limit": 10 }` → `data.total` ≈ 67, itens com `phone` ou `email`, `inIbgeTop10: true`
- [ ] `radar_mun` `{ "uf":"PE", "top10": true }` → 10 cidades
- [ ] `radar_top` `{ "uf":"PE", "modo":"editorial" }` → 20 veículos, ranks 1–20
- [ ] `radar_veiculo` `{ "id":"atlas-13" }` → TNH1 / Alagoas
- [ ] UF `SP` não chama a API (erro local) ou a API 400

---

## 9. O que **não** fazer

- Não clonar `github.com/ftsmazzo/radar-imprensa-nordeste` para servir dados (a API já é a fonte).
- Não usar seed JSON local (`data/vehicles-scored-v0.json`): está desatualizado vs Postgres.
- Não autenticar; não POST.
- Não criar tool por tipo (`radar_radio`, `radar_tv`, …): use `type` em `radar_uf`.
)
