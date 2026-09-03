# Radar Imprensa Nordeste v2

Evolução do [Radar v1](https://radarimprensanordeste.manus.space/) com ranking Top 20 por estado/categoria, API Node + Postgres e caminho para automação (Apify + n8n).

## Produção (Easypanel)

- **URL:** https://radar-imprensa-web.kxryyk.easypanel.host
- **Projeto:** `radar-imprensa`
- **Serviços:** `web` (app) + `postgres` (PostgreSQL 16)
- **Repo:** https://github.com/ftsmazzo/radar-imprensa-nordeste

Health: `/api/health` · Catálogo MCP: `/api/catalog` · Busca cruzada: `/api/search`

Exemplos:
- Contatos em PE, Top 10 IBGE: `/api/search?uf=PE&top10=true&hasContact=true`
- Rádios de Recife: `/api/search?uf=PE&city=Recife&type=Rádio`
- **Amapá (16 cidades, 5 principais):** `/api/search?uf=AP` · `/api/cities/top10?uf=AP` (limit 5)
- Cidades do estado: `/api/cities?uf=PE&top10=true`
- Facetas: `/api/facets?uf=PE&hasPhone=true`
- Ranking: `/api/top20?uf=PE&type=Portal`

## Radar Amapá

Segunda região no mesmo painel (aba **Amapá**). Inventário desk research web — não havia a base v1 do Nordeste.

- Seed: `data/vehicles-ap-v1.json` (`npm run import:ap`)
- 16 municípios IBGE 2026: `data/ibge-cities-ap-2026.json`
- Campos: endereço, telefone, WhatsApp, site, e-mail · CSV com `tel:` / `https://wa.me/`
- Cidades sem emissora mapeada usam o portal institucional da prefeitura (marcado nas métricas)

## Estrutura

```
radar-imprensa-nordeste-v2/
  docs/PLANO-ESTRATEGICO.md
  docs/SPEC-APIFY.md
  data/                       # seed / snapshots
  scripts/                    # extract + score
  server/                     # API Express + Postgres
  web/                        # painel Vite + React
  Dockerfile
```

## Local

```bash
# precisa de Postgres com DATABASE_URL
cd web && npm install && npm run build
cd ../server && npm install
DATABASE_URL=postgresql://... PORT=3000 npm start
```

## Regenerar seed a partir da v1

```bash
node scripts/download-v1-bundle.mjs
node scripts/extract-v1.mjs
node scripts/score-v0.mjs
```

## Status

- [x] Snapshot da base v1 (3.664 veículos)
- [x] Score provisional v0 + Top 20
- [x] API + Postgres
- [x] Deploy Easypanel
- [x] Ranking editorial humano (Top 20 não-TV por estado)
- [x] Desk research quantitativo (score 0–100 + métricas)
- [ ] Enrichment Apify em escala (parcial — pipeline pronto)
- [ ] Automação n8n (e-mail / WhatsApp) em produção

## Ranking editorial

Levantamento em `Imprensa/ranking_imprensa_nordeste_2026.xlsx` → `npm run import:editorial`.  
Excel enriquecido → `npm run import:desk` → `data/desk-score-v1.json`.  
Detalhes: [docs/EDITORIAL.md](docs/EDITORIAL.md).
