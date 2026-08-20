# Radar Imprensa Nordeste v2

Evolução do [Radar v1](https://radarimprensanordeste.manus.space/) com ranking Top 20 por estado/categoria, API Node + Postgres e caminho para automação (Apify + n8n).

## Produção (Easypanel)

- **URL:** https://radar-imprensa-web.kxryyk.easypanel.host
- **Projeto:** `radar-imprensa`
- **Serviços:** `web` (app) + `postgres` (PostgreSQL 16)
- **Repo:** https://github.com/ftsmazzo/radar-imprensa-nordeste

Health: `/api/health` · Meta: `/api/meta` · Ranking: `/api/top20?uf=PE&type=Portal`

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
- [ ] Enrichment Apify
- [ ] Automação n8n (e-mail / WhatsApp)
